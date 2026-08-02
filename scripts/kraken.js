/**
 * Kraken 公開市場資料 API 封裝
 * 文件: https://docs.kraken.com/api/docs/rest-api/get-ohlc-data
 *
 * 為什麼換成 Kraken？
 * Binance.com 會直接封鎖美國地區的IP（HTTP 451），而 GitHub Actions 的
 * hosted runner 常常架在美國機房，導致排程一定會失敗。Kraken 本身就是
 * 美國持牌交易所，天生不會封鎖美國IP，適合放在 GitHub Actions 上跑。
 *
 * 這些都是公開行情端點，不需要 API Key/Secret。
 */

const BASE_URL = "https://api.kraken.com";

async function krakenRequest(pathname, params = {}, retry = 4) {
  const url = new URL(pathname, BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 1; attempt <= retry; attempt++) {
    let res;
    try {
      res = await fetch(url.toString());
    } catch (err) {
      console.warn(`[kraken] 第 ${attempt} 次請求連線失敗: ${err.message}`);
      if (attempt === retry) throw err;
      await sleep(2000 * attempt);
      continue;
    }

    if (res.status === 429) {
      console.warn(`[kraken] 觸發流量限制 (429)，暫停 20 秒後繼續...`);
      await sleep(20000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[kraken] 第 ${attempt} 次請求失敗: HTTP ${res.status} - ${text.slice(0, 200)}`);
      if (attempt === retry) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      await sleep(1500 * attempt);
      continue;
    }

    const json = await res.json();
    if (json.error && json.error.length > 0) {
      const msg = json.error.join(", ");
      // 部分錯誤（例如查詢單一冷門pair失敗）不需要整支程式中斷，交給呼叫端決定
      throw new Error(`Kraken error: ${msg}`);
    }
    return json.result;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 取得全部交易對資訊。用 assetVersion=1 讓 base/quote 直接是人類看得懂的
 * 名稱（例如 BTC/USD），不用處理 Kraken 舊式的 XXBT/ZUSD 命名。
 */
async function fetchAssetPairs() {
  return krakenRequest("/0/public/AssetPairs", { assetVersion: "1" });
}

/**
 * 取得某交易對的K線資料
 * pair 請用 altname（例如 "XBTUSD"），這個格式在 OHLC/Ticker 端點最穩定
 * interval: 分鐘數，1440 = 日線
 */
async function fetchOHLC(pair, interval = 1440) {
  const result = await krakenRequest("/0/public/OHLC", { pair, interval });
  if (!result) return [];
  // result 是 { <某個pair key，可能跟傳入的不完全一樣>: [...], last: ... }
  const key = Object.keys(result).find((k) => k !== "last");
  if (!key) return [];
  return result[key].map((row) => ({
    date: new Date(row[0] * 1000).toISOString().slice(0, 10),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[6]),
  }));
}

module.exports = { fetchAssetPairs, fetchOHLC, sleep };
