import { useMemo, useState } from "react";
import fs from "fs";
import path from "path";
import { formatPrice, formatVolume } from "../lib/format";

export async function getStaticProps() {
  const dataDir = path.join(process.cwd(), "data");
  const read = (file, fallback) => {
    const p = path.join(dataDir, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  };

  const screened = read("screened.json", { updatedAt: null, count: 0, list: [] });
  const coinsIndex = read("coins-index.json", { total: 0, list: [] });
  const meta = read("meta.json", { updatedAt: null, totalCoinsProcessed: 0, interval: "1d" });

  return { props: { screened, coinsIndex, meta } };
}

function ChangeCell({ change, changePercent }) {
  const cls = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "";
  return (
    <td className={cls}>
      {sign}
      {changePercent}%
    </td>
  );
}

function CoinRow({ c }) {
  return (
    <tr onClick={() => (window.location.href = `/coin/${c.symbol}`)}>
      <td>{c.baseAsset}</td>
      <td>{c.symbol}</td>
      <td>{formatPrice(c.close)}</td>
      <ChangeCell change={c.change} changePercent={c.changePercent} />
      <td>{formatVolume(c.quoteVolume24h)}</td>
      <td>{c.k?.toFixed?.(1) ?? c.k}</td>
      <td>{c.d?.toFixed?.(1) ?? c.d}</td>
    </tr>
  );
}

export default function Home({ screened, coinsIndex, meta }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("screened"); // 'screened' | 'all'

  const filteredScreened = useMemo(() => {
    if (!query) return screened.list;
    const q = query.trim().toUpperCase();
    return screened.list.filter((c) => c.symbol.includes(q) || c.baseAsset.includes(q));
  }, [query, screened.list]);

  const filteredAll = useMemo(() => {
    if (!query) return coinsIndex.list.slice(0, 100);
    const q = query.trim().toUpperCase();
    return coinsIndex.list.filter((c) => c.symbol.includes(q) || c.baseAsset.includes(q)).slice(0, 200);
  }, [query, coinsIndex.list]);

  const rows = mode === "screened" ? filteredScreened : filteredAll;

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">🪙 加密貨幣均線觀測站</div>
          <div className="subtitle">
            策略：多頭排列 (SMA5 &gt; SMA10 &gt; SMA20 &gt; SMA60) · 週期：{meta.interval || "1d"}
          </div>
        </div>
      </div>

      <div className="meta-bar">
        <span>資料更新時間：{meta.updatedAt ? new Date(meta.updatedAt).toLocaleString("zh-TW") : "尚未更新"}</span>
        <span>已處理幣種數：{meta.totalCoinsProcessed}</span>
        <span>符合策略：{screened.count} 個</span>
      </div>

      <input
        className="search-box"
        placeholder="搜尋幣種代號... 例如 BTC 或 BTCUSDT"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode("screened")} style={tabStyle(mode === "screened")}>
          ✅ 符合策略 ({screened.count})
        </button>
        <button onClick={() => setMode("all")} style={tabStyle(mode === "all")}>
          🔍 全部幣種瀏覽
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>幣種</th>
            <th>交易對</th>
            <th>價格 (USDT)</th>
            <th>24h漲跌</th>
            <th>24h成交額</th>
            <th>K</th>
            <th>D</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <CoinRow key={c.symbol} c={c} />
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p style={{ color: "#8b8f98", marginTop: 24 }}>
          {mode === "screened" ? "目前沒有幣種符合多頭排列條件，或資料尚未產生。" : "查無符合搜尋條件的幣種。"}
        </p>
      )}

      <div className="footer-note">
        免責聲明：本站資料僅供技術分析與教育研究參考，資料來源為 Binance
        公開行情API，可能有延遲，不構成任何投資建議，加密貨幣波動風險極高，投資請自行判斷風險。
      </div>
    </div>
  );
}

function tabStyle(active) {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: active ? "1px solid #4d7cfe" : "1px solid #2a2d34",
    background: active ? "#182238" : "#171921",
    color: active ? "#8fb0ff" : "#8b8f98",
    fontSize: 13,
    cursor: "pointer",
  };
}
