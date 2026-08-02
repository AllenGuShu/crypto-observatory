import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";

const CHART_BG = "#0f1115";
const GRID_COLOR = "#1c1e26";
const TEXT_COLOR = "#8b8f98";

function baseChartOptions(height) {
  return {
    height,
    layout: {
      background: { type: ColorType.Solid, color: CHART_BG },
      textColor: TEXT_COLOR,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: GRID_COLOR },
      horzLines: { color: GRID_COLOR },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: GRID_COLOR },
    timeScale: { borderColor: GRID_COLOR, timeVisible: false, secondsVisible: false },
  };
}

function toChartTime(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** 根據幣價大小決定要顯示幾位小數（小額幣如PEPE需要很多位小數才看得出價格變化） */
function pricePrecision(sampleClose) {
  const p = Math.abs(sampleClose);
  if (p >= 100) return { precision: 2, minMove: 0.01 };
  if (p >= 1) return { precision: 4, minMove: 0.0001 };
  if (p >= 0.01) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

export default function CoinChart({ data }) {
  const priceRef = useRef(null);
  const kdRef = useRef(null);
  const macdRef = useRef(null);

  useEffect(() => {
    if (!data) return;

    const charts = [];
    const lastClose = data.close[data.close.length - 1];
    const { precision, minMove } = pricePrecision(lastClose);

    // ---------- 主圖：K棒 + SMA ----------
    const priceChart = createChart(priceRef.current, {
      ...baseChartOptions(320),
      width: priceRef.current.clientWidth,
    });
    charts.push(priceChart);

    const candleSeries = priceChart.addCandlestickSeries({
      upColor: "#ff4d4f",
      downColor: "#22c55e",
      borderUpColor: "#ff4d4f",
      borderDownColor: "#22c55e",
      wickUpColor: "#ff4d4f",
      wickDownColor: "#22c55e",
      priceFormat: { type: "price", precision, minMove },
    });
    candleSeries.setData(
      data.dates.map((date, i) => ({
        time: toChartTime(date),
        open: data.open[i],
        high: data.high[i],
        low: data.low[i],
        close: data.close[i],
      }))
    );

    const smaConfig = [
      { key: "sma5", color: "#f5c542", title: "SMA5" },
      { key: "sma10", color: "#42c5f5", title: "SMA10" },
      { key: "sma20", color: "#a855f7", title: "SMA20" },
      { key: "sma60", color: "#f97316", title: "SMA60" },
    ];
    smaConfig.forEach(({ key, color, title }) => {
      const series = priceChart.addLineSeries({
        color,
        lineWidth: 1.5,
        title,
        priceLineVisible: false,
        priceFormat: { type: "price", precision, minMove },
      });
      const points = data.dates
        .map((date, i) => ({ time: toChartTime(date), value: data[key][i] }))
        .filter((p) => p.value !== null && p.value !== undefined);
      series.setData(points);
    });

    // ---------- KD 副圖 ----------
    const kdChart = createChart(kdRef.current, {
      ...baseChartOptions(160),
      width: kdRef.current.clientWidth,
    });
    charts.push(kdChart);
    const kSeries = kdChart.addLineSeries({ color: "#f5c542", lineWidth: 1.5, title: "K", priceLineVisible: false });
    const dSeries = kdChart.addLineSeries({ color: "#42c5f5", lineWidth: 1.5, title: "D", priceLineVisible: false });
    kSeries.setData(
      data.dates.map((date, i) => ({ time: toChartTime(date), value: data.kd.k[i] })).filter((p) => p.value !== null)
    );
    dSeries.setData(
      data.dates.map((date, i) => ({ time: toChartTime(date), value: data.kd.d[i] })).filter((p) => p.value !== null)
    );

    // ---------- MACD 副圖 ----------
    const macdChart = createChart(macdRef.current, {
      ...baseChartOptions(160),
      width: macdRef.current.clientWidth,
    });
    charts.push(macdChart);
    const macdFormat = { type: "price", precision: Math.max(precision, 6), minMove: minMove / 10 || 0.000001 };
    const histSeries = macdChart.addHistogramSeries({ title: "Histogram", priceLineVisible: false, priceFormat: macdFormat });
    histSeries.setData(
      data.dates
        .map((date, i) => ({
          time: toChartTime(date),
          value: data.macd.histogram[i],
          color: (data.macd.histogram[i] || 0) >= 0 ? "#ff4d4f" : "#22c55e",
        }))
        .filter((p) => p.value !== null && p.value !== undefined)
    );
    const difSeries = macdChart.addLineSeries({ color: "#f5c542", lineWidth: 1.2, title: "DIF", priceLineVisible: false, priceFormat: macdFormat });
    const signalSeries = macdChart.addLineSeries({ color: "#42c5f5", lineWidth: 1.2, title: "Signal", priceLineVisible: false, priceFormat: macdFormat });
    difSeries.setData(
      data.dates.map((date, i) => ({ time: toChartTime(date), value: data.macd.dif[i] })).filter((p) => p.value !== null)
    );
    signalSeries.setData(
      data.dates.map((date, i) => ({ time: toChartTime(date), value: data.macd.signal[i] })).filter((p) => p.value !== null)
    );

    // ---------- 三張圖同步移動/縮放 ----------
    const syncTimeScale = (source) => {
      const range = source.timeScale().getVisibleLogicalRange();
      if (!range) return;
      charts.forEach((c) => {
        if (c !== source) c.timeScale().setVisibleLogicalRange(range);
      });
    };
    charts.forEach((c) => {
      c.timeScale().subscribeVisibleLogicalRangeChange(() => syncTimeScale(c));
    });
    priceChart.timeScale().fitContent();
    syncTimeScale(priceChart);

    const handleResize = () => {
      priceChart.applyOptions({ width: priceRef.current.clientWidth });
      kdChart.applyOptions({ width: kdRef.current.clientWidth });
      macdChart.applyOptions({ width: macdRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      charts.forEach((c) => c.remove());
    };
  }, [data]);

  return (
    <div>
      <div className="chart-section">
        <div className="chart-title">K棒 + SMA (5 / 10 / 20 / 60)</div>
        <div ref={priceRef} />
      </div>
      <div className="chart-section">
        <div className="chart-title">KD 指標 (9, 3, 3)</div>
        <div ref={kdRef} />
      </div>
      <div className="chart-section">
        <div className="chart-title">MACD 指標 (12, 26, 9)</div>
        <div ref={macdRef} />
      </div>
    </div>
  );
}
