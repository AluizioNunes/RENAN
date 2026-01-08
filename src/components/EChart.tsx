"use client";

import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

type Props = {
  option: EChartsOption;
  className?: string;
};

export default function EChart({ option, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef<EChartsOption>(option);

  useEffect(() => {
    let disposed = false;

    async function init() {
      const el = containerRef.current;
      if (!el || chartRef.current) return;
      const echarts = await import("echarts");
      if (disposed) return;
      chartRef.current = echarts.init(el);
      chartRef.current.setOption(optionRef.current, { notMerge: true });
    }

    void init();

    return () => {
      disposed = true;
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    optionRef.current = option;
    chartRef.current.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !chartRef.current) return;

    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className={className} />;
}
