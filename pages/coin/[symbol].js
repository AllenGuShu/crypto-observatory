import fs from "fs";
import path from "path";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatPrice } from "../../lib/format";

const CoinChart = dynamic(() => import("../../components/CoinChart"), { ssr: false });

export async function getStaticPaths() {
  const dataDir = path.join(process.cwd(), "data");
  const idxPath = path.join(dataDir, "coins-index.json");
  if (!fs.existsSync(idxPath)) return { paths: [], fallback: false };
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
  const paths = idx.list.map((c) => ({ params: { symbol: c.symbol } }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const filePath = path.join(process.cwd(), "data", "coins", `${params.symbol}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return { props: { data } };
}

export default function CoinDetail({ data }) {
  const lastIdx = data.close.length - 1;
  const last = {
    close: data.close[lastIdx],
    sma5: data.sma5[lastIdx],
    sma10: data.sma10[lastIdx],
    sma20: data.sma20[lastIdx],
    sma60: data.sma60[lastIdx],
    k: data.kd.k[lastIdx],
    d: data.kd.d[lastIdx],
    dif: data.macd.dif[lastIdx],
    signal: data.macd.signal[lastIdx],
    hist: data.macd.histogram[lastIdx],
  };
  const prevClose = lastIdx > 0 ? data.close[lastIdx - 1] : last.close;
  const change = last.close - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  const cls = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const isBullish =
    last.sma5 && last.sma10 && last.sma20 && last.sma60 && last.sma5 > last.sma10 && last.sma10 > last.sma20 && last.sma20 > last.sma60;

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ← 回觀測站首頁
      </Link>

      <div className="stock-header">
        <span className="stock-name">
          {data.baseAsset} ({data.symbol})
        </span>
        <span className={`stock-price ${cls}`}>{formatPrice(last.close)}</span>
        <span className={cls}>
          {change > 0 ? "+" : ""}
          {changePercent.toFixed(2)}%
        </span>
        {isBullish && <span className="badge">多頭排列</span>}
      </div>
      <div className="subtitle">
        Kraken 現貨 · {data.interval} K線
      </div>

      <div className="info-grid">
        <InfoCell label="SMA5" value={formatPrice(last.sma5)} />
        <InfoCell label="SMA10" value={formatPrice(last.sma10)} />
        <InfoCell label="SMA20" value={formatPrice(last.sma20)} />
        <InfoCell label="SMA60" value={formatPrice(last.sma60)} />
        <InfoCell label="K" value={last.k?.toFixed?.(1)} />
        <InfoCell label="D" value={last.d?.toFixed?.(1)} />
        <InfoCell label="DIF" value={formatPrice(last.dif)} />
        <InfoCell label="MACD柱" value={formatPrice(last.hist)} />
      </div>

      <CoinChart data={data} />

      <div className="footer-note">
        免責聲明：本站資料僅供技術分析與教育研究參考，資料來源為 Kraken
        公開行情API，可能有延遲，不構成任何投資建議，加密貨幣波動風險極高，投資請自行判斷風險。
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="info-cell">
      <div className="label">{label}</div>
      <div>{value ?? "-"}</div>
    </div>
  );
}
