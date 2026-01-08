"use client";

import { AnimatePresence, motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { analyzeLinks, topEntries, type LinkAnalysis } from "@/lib/linkAnalysis";

const HISTORY_KEY = "link-analyzer.history.v1";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(analysis: LinkAnalysis) {
  const header = [
    "raw",
    "normalized",
    "isValid",
    "protocol",
    "hostname",
    "domain",
    "tld",
    "pathname",
    "queryParams",
    "hasHash",
    "length",
    "error",
  ];
  const rows = analysis.items.map((it) => [
    it.raw,
    it.normalized,
    String(it.isValid),
    it.protocol ?? "",
    it.hostname ?? "",
    it.domain ?? "",
    it.tld ?? "",
    it.pathname ?? "",
    String(it.queryParams),
    String(it.hasHash),
    String(it.length),
    it.error ?? "",
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

export default function Home() {
  const [input, setInput] = useState("");
  const [assumeHttps, setAssumeHttps] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null);
  const [history, setHistory] = useState<LinkAnalysis[]>([]);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed
        .filter((x) => x && typeof x === "object")
        .slice(0, 50) as LinkAnalysis[];
      queueMicrotask(() => {
        if (cancelled) return;
        setHistory(cleaned);
        if (cleaned[0]?.input) {
          setInput(cleaned[0].input);
          setAnalysis(cleaned[0]);
        }
      });
    } catch {
      queueMicrotask(() => {
        if (cancelled) return;
        setHistory([]);
        setAnalysis(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const runAnalysis = useCallback(() => {
    const next = analyzeLinks(input, { assumeHttps, dedupe });
    setAnalysis(next);
    setHistory((prev) => {
      const merged = [next, ...prev].slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
      return merged;
    });
  }, [assumeHttps, dedupe, input]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  const loadExample = useCallback(() => {
    setInput(
      [
        "https://vercel.com",
        "nextjs.org/docs",
        "http://example.com/path?utm_source=test",
        "www.google.com/search?q=echarts",
        "https://github.com/vercel/next.js#readme",
        "nota-url",
        "//cdn.example.com/assets/app.js?v=1",
      ].join("\n"),
    );
  }, []);

  const summaryLabel = useMemo(() => {
    if (!analysis) return "Nenhuma análise ainda";
    const d = new Date(analysis.createdAt);
    const absolute = format(d, "PPpp", { locale: ptBR });
    const relative = formatDistanceToNow(d, { locale: ptBR, addSuffix: true });
    return `Última análise: ${absolute} (${relative})`;
  }, [analysis]);

  const charts = useMemo(() => {
    if (!analysis) return null;

    const protocolData = topEntries(analysis.distributions.protocol, 10).map(([name, value]) => ({
      name,
      value,
    }));

    const domainTop = topEntries(analysis.distributions.domain, 10);
    const domainNames = domainTop.map(([name]) => name);
    const domainValues = domainTop.map(([, value]) => value);

    const validInvalidOption: EChartsOption = {
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: "category", data: ["Válidos", "Inválidos"] },
      yAxis: { type: "value" },
      series: [
        {
          type: "bar",
          data: [analysis.metrics.valid, analysis.metrics.invalid],
          itemStyle: { color: "#111827" },
        },
      ],
      tooltip: { trigger: "axis" },
    };

    const protocolOption: EChartsOption = {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: true,
          data: protocolData.length ? protocolData : [{ name: "n/a", value: 1 }],
          label: { color: "#111827" },
        },
      ],
    };

    const domainOption: EChartsOption = {
      grid: { left: 120, right: 20, top: 20, bottom: 20 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: domainNames.reverse() },
      series: [
        {
          type: "bar",
          data: domainValues.reverse(),
          itemStyle: { color: "#111827" },
        },
      ],
      tooltip: { trigger: "axis" },
    };

    return { validInvalidOption, protocolOption, domainOption };
  }, [analysis]);

  const exportCsv = useCallback(() => {
    if (!analysis) return;
    const date = analysis.createdAt.slice(0, 19).replace(/[:T]/g, "-");
    downloadText(`analise-links_${date}.csv`, toCsv(analysis));
  }, [analysis]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-2">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-3xl font-semibold tracking-tight"
          >
            Analisador de Links
          </motion.h1>
          <p className="text-sm text-zinc-600">{summaryLabel}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="md:col-span-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Entrada</h2>
              <button
                type="button"
                onClick={loadExample}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
              >
                Exemplo
              </button>
            </div>

            <div className="mt-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={"Cole uma lista de links, um por linha\nex: https://exemplo.com\nex: exemplo.com/pagina"}
                className="h-72 w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={assumeHttps}
                  onChange={(e) => setAssumeHttps(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Assumir https:// quando faltar protocolo
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={dedupe}
                  onChange={(e) => setDedupe(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Remover duplicados (case-insensitive)
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={runAnalysis}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Analisar
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setAnalysis(null);
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!analysis}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium enabled:hover:bg-zinc-50 disabled:opacity-50"
              >
                Exportar CSV
              </button>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="md:col-span-7 flex flex-col gap-4"
          >
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Resumo</h2>
                <div className="text-xs text-zinc-500">
                  {analysis ? format(new Date(analysis.createdAt), "HH:mm:ss", { locale: ptBR }) : null}
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {analysis ? (
                  <motion.div
                    key={analysis.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
                  >
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Total</div>
                      <div className="mt-1 text-lg font-semibold">{analysis.metrics.total}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Válidos</div>
                      <div className="mt-1 text-lg font-semibold">{analysis.metrics.valid}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Inválidos</div>
                      <div className="mt-1 text-lg font-semibold">{analysis.metrics.invalid}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Domínios únicos</div>
                      <div className="mt-1 text-lg font-semibold">{analysis.metrics.uniqueDomains}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Com query</div>
                      <div className="mt-1 text-lg font-semibold">{analysis.metrics.withQuery}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-xs text-zinc-600">Tamanho médio</div>
                      <div className="mt-1 text-lg font-semibold">
                        {analysis.metrics.avgLength.toFixed(1)}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 text-sm text-zinc-600"
                  >
                    Cole links na esquerda e clique em “Analisar”.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Válidos vs Inválidos</h3>
                <div className="mt-2 h-56">
                  {charts ? (
                    <EChart option={charts.validInvalidOption} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      Sem dados
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Protocolos</h3>
                <div className="mt-2 h-56">
                  {charts ? (
                    <EChart option={charts.protocolOption} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      Sem dados
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Top domínios</h3>
                <div className="text-xs text-zinc-500">Top 10</div>
              </div>
              <div className="mt-2 h-72">
                {charts ? (
                  <EChart option={charts.domainOption} className="h-full w-full" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    Sem dados
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Itens</h2>
              <div className="text-xs text-zinc-500">
                {analysis ? `${analysis.items.length} linhas` : "—"}
              </div>
            </div>
            <div className="mt-3 overflow-auto rounded-xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200">
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">URL</th>
                    <th className="px-3 py-2 font-semibold">Domínio</th>
                    <th className="px-3 py-2 font-semibold">Protocolo</th>
                    <th className="px-3 py-2 font-semibold">Query</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis?.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-zinc-100 last:border-b-0">
                      <td className="px-3 py-2">
                        <span
                          className={
                            it.isValid
                              ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              : "inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                          }
                        >
                          {it.isValid ? "válido" : "inválido"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[520px] truncate font-mono text-xs text-zinc-800">
                          {it.normalized}
                        </div>
                        {!it.isValid && it.error ? (
                          <div className="mt-1 max-w-[520px] truncate text-xs text-rose-700">
                            {it.error}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-700">
                        {it.domain ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-700">
                        {it.protocol ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-700">
                        {it.queryParams}
                      </td>
                    </tr>
                  ))}
                  {!analysis ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-zinc-500" colSpan={5}>
                        Sem análise ainda
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:col-span-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Histórico</h2>
              <button
                type="button"
                onClick={clearHistory}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
                disabled={history.length === 0}
              >
                Limpar
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {history.length ? (
                  history.map((h) => {
                    const d = new Date(h.createdAt);
                    return (
                      <motion.button
                        key={h.id}
                        type="button"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => {
                          setInput(h.input);
                          setAnalysis(h);
                        }}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">
                            {h.metrics.total} links
                          </div>
                          <div className="text-xs text-zinc-500">
                            {format(d, "HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">
                          {h.metrics.valid} válidos · {h.metrics.invalid} inválidos · {h.metrics.uniqueDomains} domínios
                        </div>
                      </motion.button>
                    );
                  })
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600"
                  >
                    Nenhuma análise salva ainda.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          Dica: cole links com ou sem protocolo; o app normaliza e mede padrões.
        </div>
      </div>
    </div>
  );
}
