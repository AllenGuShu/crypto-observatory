/**
 * 產生「範例假資料」，讓專案 clone 下來後不用等真的抓資料就能先看到網站長相。
 * 正式資料請執行 npm run update-data（不需要任何API Key）。
 * 用法: node scripts/genSampleData.js
 */
const fs = require("fs");
const path = require("path");
const { calcSMA, calcKD, calcMACD } = require("./indicators");

const DATA_DIR = path.join(__dirname, "..", "data");
const COINS_DIR = path.join(DATA_DIR, "coins");
fs.mkdirSync(COINS_DIR, { recursive: true });

const SAMPLE_COINS = [
  { symbol: "BTCUSDT", baseAsset: "BTC", base: 65000, trendUp: true },
  { symbol: "ETHUSDT", baseAsset: "ETH", base: 3200, trendUp: true },
  { symbol: "SOLUSDT", baseAsset: "SOL", base: 145, trendUp: true },
  { symbol: "XRPUSDT", baseAsset: "XRP", base: 0.55, trendUp: false },
  { symbol: "DOGEUSDT", baseAsset: "DOGE", base: 0.12, trendUp: false },
  { symbol: "PEPEUSDT", baseAsset: "PEPE", base: 0.0000098, trendUp: true },
];

function genDates(n) {
  const dates = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    dates.unshift(new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  return dates;
}

function genSeries(base, n, trendUp) {
  const closes = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const drift = trendUp ? 0.002 : -0.0008;
    const noise = (Math.random() - 0.5) * base * 0.03;
    price = Math.max(base * 0.001, price * (1 + drift) + noise);
    closes.push(price);
  }
  return closes;
}

const N = 140;
const dates = genDates(N);
const screenedList = [];
const indexList = [];

for (const c of SAMPLE_COINS) {
  const closes = genSeries(c.base, N, c.trendUp);
  const opens = closes.map((v) => v * (1 - 0.004 + Math.random() * 0.008));
  const highs = closes.map((v, i) => Math.max(v, opens[i]) * (1 + Math.random() * 0.01));
  const lows = closes.map((v, i) => Math.min(v, opens[i]) * (1 - Math.random() * 0.01));
  const volumes = closes.map(() => Math.floor(1000 + Math.random() * 500000));

  const sma5 = calcSMA(closes, 5);
  const sma10 = calcSMA(closes, 10);
  const sma20 = calcSMA(closes, 20);
  const sma60 = calcSMA(closes, 60);
  const kd = calcKD(highs, lows, closes, 9);
  const macd = calcMACD(closes, 12, 26, 9);

  const record = {
    symbol: c.symbol,
    baseAsset: c.baseAsset,
    quoteAsset: "USDT",
    interval: "1d",
    dates,
    open: opens,
    high: highs,
    low: lows,
    close: closes,
    volume: volumes,
    sma5,
    sma10,
    sma20,
    sma60,
    kd,
    macd,
  };
  fs.writeFileSync(path.join(COINS_DIR, `${c.symbol}.json`), JSON.stringify(record));

  const lastIdx = N - 1;
  const prevClose = closes[lastIdx - 1];
  const change = closes[lastIdx] - prevClose;
  const changePercent = +((change / prevClose) * 100).toFixed(2);
  const summary = {
    symbol: c.symbol,
    baseAsset: c.baseAsset,
    close: closes[lastIdx],
    change,
    changePercent,
    quoteVolume24h: volumes[lastIdx] * closes[lastIdx],
    volume: volumes[lastIdx],
    sma5: sma5[lastIdx],
    sma10: sma10[lastIdx],
    sma20: sma20[lastIdx],
    sma60: sma60[lastIdx],
    k: kd.k[lastIdx],
    d: kd.d[lastIdx],
    macdHistogram: macd.histogram[lastIdx],
  };
  indexList.push(summary);
  const bullish = sma5[lastIdx] > sma10[lastIdx] && sma10[lastIdx] > sma20[lastIdx] && sma20[lastIdx] > sma60[lastIdx];
  if (bullish) screenedList.push(summary);
}

const updatedAt = new Date().toISOString();
fs.writeFileSync(
  path.join(DATA_DIR, "screened.json"),
  JSON.stringify({ updatedAt, condition: "多頭排列 (SMA5 > SMA10 > SMA20 > SMA60)", interval: "1d", count: screenedList.length, list: screenedList })
);
fs.writeFileSync(path.join(DATA_DIR, "coins-index.json"), JSON.stringify({ updatedAt, total: indexList.length, list: indexList }));
fs.writeFileSync(
  path.join(DATA_DIR, "meta.json"),
  JSON.stringify({ updatedAt, interval: "1d", totalCoinsProcessed: indexList.length, screenedCount: screenedList.length, isSampleData: true })
);

console.log(`已產生 ${SAMPLE_COINS.length} 個範例幣種資料 (data/ 目錄)`);
