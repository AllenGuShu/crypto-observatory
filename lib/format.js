/** 根據價格大小決定顯示幾位小數，小額幣（如 PEPE, SHIB）需要更多小數位才看得出價格 */
export function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const p = Math.abs(value);
  let digits;
  if (p >= 100) digits = 2;
  else if (p >= 1) digits = 4;
  else if (p >= 0.01) digits = 6;
  else digits = 8;
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatVolume(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}
