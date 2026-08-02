/**
 * Binance 公開市場資料 API 封裝
 * 文件: https://binance-docs.github.io/apidocs/spot/en/
 * 這些是公開行情端點，不需要 API Key/Secret，任何人都能直接呼叫。
 * 速率限制以「權重(weight)」計算，預設帳戶限制約 6000 weight/分鐘，
 * klines 一次請求只消耗 2 weight，所以抓幾百個交易對也很快。
 */

const BASE_URL = "https://api.binance.com";

async function binanceRequest(pathname, params = {}, retry = 4) {
  const url = new URL(pathname, BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 1; attempt <= retry; attempt++) {
    let res;
    try {
      res = await fetch(url.toString());
    } catch (err) {
      console.warn(`[binance] 第 ${attempt} 次請求連線失敗: ${err.message}`);
      if (attempt === retry) throw err;
      await sleep(2000 * attempt);
      continue;
    }

    // 429 = 超過流量限制、418 = IP 因持續超標被短暫封鎖，兩者都用 Retry-After header 或預設秒數等待
    if (res.status === 429 || res.status === 418) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
      console.warn(`[binance] 觸發流量限制 (${res.status})，等待 ${retryAfter} 秒後繼續...`);
      await sleep((retryAfter + 1) * 1000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[binance] 第 ${attempt} 次請求失敗: HTTP ${res.status} - ${text.slice(0, 200)}`);
      if (attempt === retry) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      await sleep(1500 * attempt);
      continue;
    }

    return res.json();
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 取得所有交易對資訊（哪些幣種在掛牌交易中） */
async function fetchExchangeInfo() {
  return binanceRequest("/api/v3/exchangeInfo");
}

/** 取得 24 小時內全部交易對的行情（用來排序/過濾流動性很低的幣） */
async function fetchTicker24hr() {
  return binanceRequest("/api/v3/ticker/24hr");
}

/**
 * 取得某交易對的K線資料
 * interval: 1m/5m/15m/1h/4h/1d/1w ...
 * limit: 最多 1000
 */
async function fetchKlines(symbol, interval = "1d", limit = 200) {
  const raw = await binanceRequest("/api/v3/klines", { symbol, interval, limit });
  if (!raw) return [];
  // Binance回傳格式: [openTime, open, high, low, close, volume, closeTime, ...]
  return raw.map((k) => ({
    date: new Date(k[0]).toISOString().slice(0, 10),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

module.exports = { fetchExchangeInfo, fetchTicker24hr, fetchKlines, sleep };
