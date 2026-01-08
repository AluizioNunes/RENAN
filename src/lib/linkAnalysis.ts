export type LinkRow = {
  id: string;
  raw: string;
  normalized: string;
  isValid: boolean;
  error?: string;
  protocol?: string;
  hostname?: string;
  domain?: string;
  tld?: string;
  pathname?: string;
  queryParams: number;
  hasHash: boolean;
  length: number;
};

export type LinkAnalysis = {
  id: string;
  createdAt: string;
  input: string;
  items: LinkRow[];
  metrics: {
    total: number;
    valid: number;
    invalid: number;
    uniqueDomains: number;
    withQuery: number;
    withHash: number;
    avgLength: number;
  };
  distributions: {
    protocol: Record<string, number>;
    domain: Record<string, number>;
    tld: Record<string, number>;
  };
};

export type AnalyzeOptions = {
  assumeHttps: boolean;
  dedupe: boolean;
};

function safeId() {
  const maybeCrypto = globalThis.crypto as undefined | { randomUUID?: () => string };
  if (maybeCrypto?.randomUUID) return maybeCrypto.randomUUID();
  return `a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function normalizeLine(raw: string, assumeHttps: boolean) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!assumeHttps) return trimmed;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  if (hasScheme) return trimmed;
  return `https://${trimmed}`;
}

function hostnameToDomain(hostname: string) {
  const withoutWww = hostname.replace(/^www\./i, "");
  return withoutWww.length ? withoutWww : hostname;
}

function domainToTld(domain: string) {
  const parts = domain.split(".").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : undefined;
}

export function analyzeLinks(input: string, options: AnalyzeOptions): LinkAnalysis {
  const lines = input
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const normalizedList = lines.map((raw) => ({
    raw,
    normalized: normalizeLine(raw, options.assumeHttps),
  }));

  const unique = options.dedupe
    ? Array.from(
        new Map(normalizedList.map((it) => [it.normalized.toLowerCase(), it])).values(),
      )
    : normalizedList;

  const items: LinkRow[] = unique.map(({ raw, normalized }) => {
    const base: LinkRow = {
      id: safeId(),
      raw,
      normalized,
      isValid: false,
      queryParams: 0,
      hasHash: false,
      length: normalized.length,
    };

    try {
      const url = new URL(normalized);
      const protocol = url.protocol.replace(":", "");
      const hostname = url.hostname || undefined;
      const domain = hostname ? hostnameToDomain(hostname) : undefined;

      return {
        ...base,
        isValid: true,
        protocol,
        hostname,
        domain,
        tld: domain ? domainToTld(domain) : undefined,
        pathname: url.pathname,
        queryParams: Array.from(url.searchParams.keys()).length,
        hasHash: Boolean(url.hash && url.hash.length > 1),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "URL inválida";
      return { ...base, error: message };
    }
  });

  const protocolDist: Record<string, number> = {};
  const domainDist: Record<string, number> = {};
  const tldDist: Record<string, number> = {};

  let valid = 0;
  let invalid = 0;
  let withQuery = 0;
  let withHash = 0;
  let lengthSum = 0;

  for (const it of items) {
    lengthSum += it.length;
    if (it.isValid) valid += 1;
    else invalid += 1;

    if (it.queryParams > 0) withQuery += 1;
    if (it.hasHash) withHash += 1;

    if (it.protocol) inc(protocolDist, it.protocol);
    if (it.domain) inc(domainDist, it.domain.toLowerCase());
    if (it.tld) inc(tldDist, it.tld);
  }

  const uniqueDomains = Object.keys(domainDist).length;

  return {
    id: safeId(),
    createdAt: new Date().toISOString(),
    input,
    items,
    metrics: {
      total: items.length,
      valid,
      invalid,
      uniqueDomains,
      withQuery,
      withHash,
      avgLength: items.length ? lengthSum / items.length : 0,
    },
    distributions: {
      protocol: protocolDist,
      domain: domainDist,
      tld: tldDist,
    },
  };
}

export function topEntries(map: Record<string, number>, limit: number) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

