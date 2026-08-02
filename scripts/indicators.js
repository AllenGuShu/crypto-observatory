/**
 * 技術指標計算工具
 * 輸入皆為依日期由「舊到新」排序的數值陣列
 * 資料不足以計算的位置回傳 null，方便前端判斷是否要畫線
 */

/** 簡單移動平均線 SMA */
function calcSMA(values, period) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** 指數移動平均線 EMA */
function calcEMA(values, period) {
  const result = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let emaPrev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || values[i] === undefined) continue;
    if (emaPrev === null) {
      // 用前 period 筆的 SMA 當作第一個 EMA 的種子
      if (i >= period - 1) {
        const slice = values.slice(i - period + 1, i + 1);
        emaPrev = slice.reduce((a, b) => a + b, 0) / period;
        result[i] = emaPrev;
      }
    } else {
      emaPrev = values[i] * k + emaPrev * (1 - k);
      result[i] = emaPrev;
    }
  }
  return result;
}

/**
 * KD 指標（台式，RSV 平滑法）
 * K = 前一日K * 2/3 + 當日RSV * 1/3
 * D = 前一日D * 2/3 + 當日K * 1/3
 * 初始 K、D 皆設為 50
 */
function calcKD(highs, lows, closes, rsvPeriod = 9) {
  const n = closes.length;
  const rsv = new Array(n).fill(null);
  const kArr = new Array(n).fill(null);
  const dArr = new Array(n).fill(null);

  let kPrev = 50;
  let dPrev = 50;

  for (let i = 0; i < n; i++) {
    if (i < rsvPeriod - 1) continue;
    const sliceHigh = highs.slice(i - rsvPeriod + 1, i + 1);
    const sliceLow = lows.slice(i - rsvPeriod + 1, i + 1);
    const highestHigh = Math.max(...sliceHigh);
    const lowestLow = Math.min(...sliceLow);
    const denom = highestHigh - lowestLow;
    const todayRSV = denom === 0 ? 50 : ((closes[i] - lowestLow) / denom) * 100;
    rsv[i] = +todayRSV.toFixed(2);

    const k = kPrev * (2 / 3) + todayRSV * (1 / 3);
    const d = dPrev * (2 / 3) + k * (1 / 3);
    kArr[i] = +k.toFixed(2);
    dArr[i] = +d.toFixed(2);
    kPrev = k;
    dPrev = d;
  }
  return { k: kArr, d: dArr, rsv };
}

/**
 * MACD 指標
 * DIF = EMA(fast) - EMA(slow)
 * MACD signal = EMA(DIF, signal)
 * histogram = DIF - signal
 */
function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const n = closes.length;
  const dif = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif[i] = emaFast[i] - emaSlow[i];
    }
  }
  const difForSignal = dif.map((v) => (v === null ? null : v));
  // 找出第一個非 null 的位置，從那邊開始餵給 EMA signal
  const firstValidIdx = difForSignal.findIndex((v) => v !== null);
  const signalArr = new Array(n).fill(null);
  if (firstValidIdx !== -1) {
    const validDif = difForSignal.slice(firstValidIdx);
    const emaOfDif = calcEMA(validDif, signal);
    for (let i = 0; i < emaOfDif.length; i++) {
      signalArr[firstValidIdx + i] = emaOfDif[i];
    }
  }
  const histogram = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dif[i] !== null && signalArr[i] !== null) {
      histogram[i] = dif[i] - signalArr[i];
    }
  }
  return { dif, signal: signalArr, histogram };
}

module.exports = { calcSMA, calcEMA, calcKD, calcMACD };
