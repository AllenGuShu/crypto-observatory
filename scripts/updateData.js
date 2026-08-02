/**
 * 每次資料更新主程式（加密貨幣版）
 * 1. 抓取 Binance 所有 USDT 交易對，並用 24hr 成交量過濾掉流動性太差的幣
 * 2. 逐一幣種抓取K線資料
 * 3. 計算 SMA5/10/20/60、KD、MACD
 * 4. 篩選「多頭排列」(SMA5 > SMA10 > SMA20 > SMA60) 的幣種
 * 5. 輸出 JSON 給 Next.js 前端讀取
 *
 * 執行方式: node scripts/updateData.js
 * （Binance 公開行情 API 不需要任何 API Key）
 */

const fs = require("fs");
const path = require("path");
const { fetchExchangeInfo, fetchTicker24hr, fetchKlines, sleep } = require("./binance");
const { calcSMA, calcKD, calcMACD } = require("./indicators");

const DATA_DIR = path.join(__dirname, "..", "data");
const COINS_DIR = path.join(DATA_DIR, "coins");

const INTERVAL = process.env.INTERVAL || "1d"; // K線週期：1d(日線) / 4h / 1h ...
const KLINE_LIMIT = 200; // 抓幾根K棒，需 >= 60 才能算SMA60，抓200讓KD/MACD有足夠暖機空間
const MIN_QUOTE_VOLUME_USDT = process.env.MIN_QUOTE_VOLUME_USDT
  ? Number(process.env.MIN_QUOTE_VOLUME_USDT)
  : 500000; // 過濾掉24小時成交額低於這個門檻的幣，避免抓一堆沒人在交易的殭屍幣
const REQUEST_DELAY_MS = 200; // Binance 限制寬鬆，禮貌性間隔即可
// 測試用：設定 MAX_COINS=20 只抓前20個幣，很快跑完，方便本地測試流程是否正常
const MAX_COINS = process.env.MAX_COINS ? parseInt(process.env.MAX_COINS, 10) : Infinity;

async function main() {
  console.log("== 開始更新加密貨幣資料 ==");
  fs.mkdirSync(COINS_DIR, { recursive: true });

  console.log("[1/4] 抓取交易對清單與24小時成交量...");
  const exchangeInfo = await fetchExchangeInfo();
  const tickers = await fetchTicker24hr();
  const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

  const symbols = exchangeInfo.symbols.filter((s) => {
    if (s.status !== "TRADING") return false;
    if (s.quoteAsset !== "USDT") return false;
    if (!s.isSpotTradingAllowed) return false;
    const ticker = tickerMap.get(s.symbol);
    if (!ticker) return false;
    if (parseFloat(ticker.quoteVolume) < MIN_QUOTE_VOLUME_USDT) return false;
    return true;
  });
  console.log(`  -> 篩選後共 ${symbols.length} 個USDT交易對 (24h成交額 >= ${MIN_QUOTE_VOLUME_USDT.toLocaleString()} USDT)`);

  console.log(`[2/4] 逐幣抓取K線資料 (${INTERVAL})...`);
  const targetSymbols = symbols.slice(0, MAX_COINS);
  const seriesMap = new Map();
  let processed = 0;
  let failedCount = 0;

  for (const s of targetSymbols) {
    processed++;
    let rows;
    try {
      rows = await fetchKlines(s.symbol, INTERVAL, KLINE_LIMIT);
    } catch (err) {
      failedCount++;
      console.warn(`  ! ${s.symbol} 抓取失敗，跳過: ${err.message}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    await sleep(REQUEST_DELAY_MS);

    if (rows && rows.length > 0) seriesMap.set(s.symbol, { rows, baseAsset: s.baseAsset });

    if (processed % 50 === 0 || processed === targetSymbols.length) {
      console.log(`  -> 已處理 ${processed}/${targetSymbols.length} 個交易對 (失敗 ${failedCount})`);
    }
  }
  console.log(`  -> 共取得 ${seriesMap.size} 個交易對的K線資料`);

  console.log("[3/4] 計算指標並篩選多頭排列幣種...");
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

    const sma5 = calcSMA(closes, 5);
    const sma10 = calcSMA(closes, 10);
    const sma20 = calcSMA(closes, 20);
    const sma60 = calcSMA(closes, 60);
    const kd = calcKD(highs, lows, closes, 9);
    const macd = calcMACD(closes, 12, 26, 9);

    const lastIdx = closes.length - 1;
    const ticker = tickerMap.get(symbol);

    const record = {
      symbol,
      baseAsset,
      quoteAsset: "USDT",
      interval: INTERVAL,
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
      quoteVolume24h: ticker ? parseFloat(ticker.quoteVolume) : null,
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
      interval: INTERVAL,
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
      interval: INTERVAL,
      totalCoinsProcessed: coinsIndex.length,
      screenedCount: screened.length,
      minQuoteVolumeUSDT: MIN_QUOTE_VOLUME_USDT,
    })
  );

  console.log("== 更新完成 ==");
}

main().catch((err) => {
  console.error("資料更新失敗:", err);
  process.exit(1);
});
