/**
 * 每次資料更新主程式（加密貨幣版 / Kraken）
 * 1. 抓取 Kraken 所有 USD 交易對
 * 2. 逐一交易對抓取日K線資料
 * 3. 計算 SMA5/10/20/60、KD、MACD
 * 4. 用最近一日成交額過濾流動性太差的幣，並篩選「多頭排列」的幣種
 * 5. 輸出 JSON 給 Next.js 前端讀取
 *
 * 執行方式: node scripts/updateData.js
 * （Kraken 公開行情 API 不需要任何 API Key，且不會封鎖美國/GitHub Actions 的IP）
 */

const fs = require("fs");
const path = require("path");
const { fetchAssetPairs, fetchOHLC, sleep } = require("./kraken");
const { calcSMA, calcKD, calcMACD } = require("./indicators");

const DATA_DIR = path.join(__dirname, "..", "data");
const COINS_DIR = path.join(DATA_DIR, "coins");

const INTERVAL_MINUTES = process.env.INTERVAL_MINUTES ? Number(process.env.INTERVAL_MINUTES) : 1440; // 1440=日線
const MIN_QUOTE_VOLUME_USD = process.env.MIN_QUOTE_VOLUME_USD ? Number(process.env.MIN_QUOTE_VOLUME_USD) : 200000;
const REQUEST_DELAY_MS = 350; // Kraken 對公開端點沒有明訂嚴格限制，禮貌性間隔即可
// 測試用：設定 MAX_COINS=20 只抓前20個幣，很快跑完，方便本地測試流程是否正常
const MAX_COINS = process.env.MAX_COINS ? parseInt(process.env.MAX_COINS, 10) : Infinity;

async function main() {
  console.log("== 開始更新加密貨幣資料 (Kraken) ==");
  fs.mkdirSync(COINS_DIR, { recursive: true });

  console.log("[1/4] 抓取交易對清單...");
  const assetPairs = await fetchAssetPairs();
  const pairEntries = Object.entries(assetPairs).filter(([, info]) => {
    if (info.quote !== "USD") return false;
    if (info.status && info.status !== "online") return false;
    if (!info.altname) return false;
    return true;
  });
  console.log(`  -> 篩選後共 ${pairEntries.length} 個 USD 交易對`);

  console.log(`[2/4] 逐幣抓取K線資料 (interval=${INTERVAL_MINUTES}分鐘)...`);
  const targets = pairEntries.slice(0, MAX_COINS);
  const seriesMap = new Map(); // symbol -> { rows, baseAsset }
  let processed = 0;
  let failedCount = 0;

  for (const [, info] of targets) {
    processed++;
    const symbol = `${info.base}${info.quote}`; // 例如 BTCUSD，給前端用的乾淨代號
    let rows;
    try {
      rows = await fetchOHLC(info.altname, INTERVAL_MINUTES);
    } catch (err) {
      failedCount++;
      console.warn(`  ! ${symbol} (${info.altname}) 抓取失敗，跳過: ${err.message}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    await sleep(REQUEST_DELAY_MS);

    if (rows && rows.length > 0) seriesMap.set(symbol, { rows, baseAsset: info.base });

    if (processed % 30 === 0 || processed === targets.length) {
      console.log(`  -> 已處理 ${processed}/${targets.length} 個交易對 (失敗 ${failedCount})`);
    }
  }
  console.log(`  -> 共取得 ${seriesMap.size} 個交易對的K線資料`);

  console.log("[3/4] 計算指標、過濾流動性並篩選多頭排列幣種...");
  const screened = [];
  const coinsIndex = [];

  for (const [symbol, { rows, baseAsset }] of seriesMap.entries()) {
    if (rows.length < 60) continue; // 資料太少無法算SMA60

    const dates = rows.map((r) => r.date);
    const opens = rows.map((r) => r.open);
    const highs = rows.map((r) => r.high);
    const lows = rows.map((r) => r.low);
    const closes = rows.map((r) => r.close);
    const volumes = rows.map((r) => r.volume);

    const lastIdx = closes.length - 1;
    const quoteVolumeApprox = volumes[lastIdx] * closes[lastIdx];
    if (quoteVolumeApprox < MIN_QUOTE_VOLUME_USD) continue; // 流動性太差，跳過

    const sma5 = calcSMA(closes, 5);
    const sma10 = calcSMA(closes, 10);
    const sma20 = calcSMA(closes, 20);
    const sma60 = calcSMA(closes, 60);
    const kd = calcKD(highs, lows, closes, 9);
    const macd = calcMACD(closes, 12, 26, 9);

    const record = {
      symbol,
      baseAsset,
      quoteAsset: "USD",
      interval: INTERVAL_MINUTES,
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

    fs.writeFileSync(path.join(COINS_DIR, `${symbol}.json`), JSON.stringify(record));

    const isBullishAligned =
      sma5[lastIdx] !== null &&
      sma10[lastIdx] !== null &&
      sma20[lastIdx] !== null &&
      sma60[lastIdx] !== null &&
      sma5[lastIdx] > sma10[lastIdx] &&
      sma10[lastIdx] > sma20[lastIdx] &&
      sma20[lastIdx] > sma60[lastIdx];

    const prevClose = lastIdx > 0 ? closes[lastIdx - 1] : closes[lastIdx];
    const change = closes[lastIdx] - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    const summary = {
      symbol,
      baseAsset,
      close: closes[lastIdx],
      change,
      changePercent: +changePercent.toFixed(2),
      quoteVolume24h: quoteVolumeApprox,
      volume: volumes[lastIdx],
      sma5: sma5[lastIdx],
      sma10: sma10[lastIdx],
      sma20: sma20[lastIdx],
      sma60: sma60[lastIdx],
      k: kd.k[lastIdx],
      d: kd.d[lastIdx],
      macdHistogram: macd.histogram[lastIdx],
    };

    coinsIndex.push(summary);
    if (isBullishAligned) screened.push(summary);
  }

  screened.sort((a, b) => b.changePercent - a.changePercent);
  coinsIndex.sort((a, b) => (b.quoteVolume24h || 0) - (a.quoteVolume24h || 0));

  console.log(`  -> 符合「多頭排列」條件共 ${screened.length} 個幣種`);

  console.log("[4/4] 寫出 JSON 檔案...");
  const updatedAt = new Date().toISOString();

  fs.writeFileSync(
    path.join(DATA_DIR, "screened.json"),
    JSON.stringify({
      updatedAt,
      condition: "多頭排列 (SMA5 > SMA10 > SMA20 > SMA60)",
      interval: INTERVAL_MINUTES,
      count: screened.length,
      list: screened,
    })
  );

  fs.writeFileSync(
    path.join(DATA_DIR, "coins-index.json"),
    JSON.stringify({ updatedAt, total: coinsIndex.length, list: coinsIndex })
  );

  fs.writeFileSync(
    path.join(DATA_DIR, "meta.json"),
    JSON.stringify({
      updatedAt,
      interval: INTERVAL_MINUTES,
      totalCoinsProcessed: coinsIndex.length,
      screenedCount: screened.length,
      minQuoteVolumeUSD: MIN_QUOTE_VOLUME_USD,
      source: "Kraken",
    })
  );

  console.log("== 更新完成 ==");
}

main().catch((err) => {
  console.error("資料更新失敗:", err);
  process.exit(1);
});
