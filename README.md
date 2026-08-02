# 🪙 加密貨幣均線觀測站 (Crypto Observatory)

定期自動掃描 Kraken 所有 USD 交易對，篩選出符合「**多頭排列**」
(SMA5 > SMA10 > SMA20 > SMA60) 均線策略的幣種，並提供 K 棒、SMA、KD、MACD
圖表。前端用 Next.js 部署在 Vercel，資料更新用 GitHub Actions 排程自動抓取
+ 計算 + commit，完全免費、免維護伺服器，**也不需要申請任何 API Key**。

## 為什麼是 Kraken，不是 Binance？

一開始這個專案是接 Binance API，但 **Binance.com 會直接封鎖美國地區的
IP**（回傳 HTTP 451），而 GitHub Actions 的 hosted runner 很多時候是架在
美國機房，導致排程一定會失敗，跟設定無關。Kraken 本身就是美國持牌交易所，
天生不會封鎖美國 IP，放在 GitHub Actions 上跑很穩定，所以整個專案改接
Kraken 的公開行情 API。

## 架構說明

```
使用者瀏覽器
     │
     ▼
Vercel (Next.js 靜態頁面) ── 讀取 repo 裡的 data/*.json
     ▲
     │ git push 觸發自動重新部署
     │
GitHub Actions (每4小時排程一次)
     │  抓取 Kraken API → 計算 SMA/KD/MACD → 篩選多頭排列 → 寫入 data/
     ▼
Kraken 公開行情 API
```

加密貨幣 24 小時交易、沒有休市日，Kraken 的公開行情 API 不需要註冊帳號、
不需要 API Key。

## 技術棧

- **前端**：Next.js 14 (Pages Router) + React，純 CSS
- **圖表**：[lightweight-charts](https://github.com/tradingview/lightweight-charts)（TradingView 開源圖表庫）
- **資料來源**：[Kraken 公開行情 API](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data)（免key）
- **排程**：GitHub Actions（cron，每 4 小時執行一次）
- **部署**：Vercel（免費方案即可）

## 均線策略邏輯

在 `scripts/updateData.js` 裡篩選條件為：

```js
SMA5 > SMA10 > SMA20 > SMA60   // 短中長期均線一路向上排列，代表多頭趨勢
```

指標本身（SMA/KD/MACD）都已經算好放在每個幣種的 JSON 裡，想改條件（例如改
成黃金交叉）只要修改 `updateData.js` 裡 `isBullishAligned` 那段判斷式即可。

## 本地開發

```bash
npm install

# 先產生範例假資料，讓網站馬上能看（僅供展示，不是真實幣價）
node scripts/genSampleData.js

npm run dev
# 打開 http://localhost:3000
```

## 抓真實資料

不需要申請任何帳號或 API Key，直接執行：

```bash
node scripts/updateData.js
```

跑完後 `data/` 目錄會被真實資料覆蓋，`npm run dev` 就能看到真實幣價。

預設只會抓 **最近一日成交額約 >= 20萬 USD** 的交易對（避免抓一堆沒人交易的
冷門幣），全部跑完通常幾分鐘內就結束。可以用環境變數調整：

```bash
# 調整流動性門檻（USD）
MIN_QUOTE_VOLUME_USD=500000 node scripts/updateData.js

# 只想先測試流程，只抓前20個幣，很快跑完
MAX_COINS=20 node scripts/updateData.js

# 改用其他K線週期（預設1440分鐘=日線），例如240=4小時線
INTERVAL_MINUTES=240 node scripts/updateData.js
```

## 部署到 GitHub + Vercel

### 1️⃣ 建立 GitHub Repo 並推上去

```bash
cd crypto-observatory
git init
git add .
git commit -m "init: 加密貨幣均線觀測站"
git branch -M main
git remote add origin https://github.com/你的帳號/crypto-observatory.git
git push -u origin main
```

### 2️⃣ 設定 GitHub Actions 權限

到你的 GitHub repo → **Settings → Actions → General**，把 "Workflow
permissions" 改成 **Read and write permissions**，按 Save。

（不需要設定任何 Secret，Kraken 公開 API 不用金鑰）

`.github/workflows/update-data.yml` 已經設定好每 4 小時自動執行一次
`scripts/updateData.js`，算完會自動 commit 回 `data/` 目錄。也可以到
GitHub 網頁的 **Actions** 分頁手動點 **Run workflow** 立刻跑一次。

### 3️⃣ 部署到 Vercel

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入
2. **New Project** → 選你剛推上去的 repo → 直接 Deploy
3. 之後每次 GitHub Actions commit 新資料，Vercel 都會自動重新部署

部署完成後把 Vercel 給的網址分享給朋友就可以一起用了。

## 目錄結構

```
crypto-observatory/
├── .github/workflows/update-data.yml   # 排程（每4小時）
├── scripts/
│   ├── kraken.js           # Kraken API 封裝
│   ├── indicators.js       # SMA / KD / MACD 計算
│   ├── updateData.js       # 正式資料更新主程式
│   └── genSampleData.js    # 本地展示用假資料
├── data/
│   ├── screened.json      # 符合策略的幣種清單
│   ├── coins-index.json   # 全部幣種摘要（供搜尋）
│   ├── meta.json           # 更新時間等統計資訊
│   └── coins/{交易對}.json # 每個幣種完整歷史 + 指標（供畫圖）
├── lib/format.js          # 價格格式化（處理小數幣如PEPE的精度）
├── components/CoinChart.js # K棒/SMA/KD/MACD 圖表元件
├── pages/
│   ├── index.js           # 首頁：篩選清單 + 搜尋
│   └── coin/[symbol].js   # 幣種詳細圖表頁
└── styles/globals.css
```

## 已知限制 / 之後可以加強的地方

- 目前只抓 Kraken **現貨(spot) USD交易對**，沒有涵蓋合約/期貨市場，幣種數量
  會比 Binance 少一些（Kraken 較為精選），但主流幣都有涵蓋。
- 流動性過濾門檻（`MIN_QUOTE_VOLUME_USD`）是用最後一根日K的
  「成交量×收盤價」概算，不是真正的24小時累計成交額，會有些微誤差。
- 小數位很多的幣（如 PEPE, SHIB）在 `lib/format.js` 和圖表元件裡有做動態
  精度處理，但如果之後遇到精度更誇張的幣，可以再調整那邊的判斷邏輯。
- 目前策略條件寫死在後端腳本，如果想要「在網站上自己切換條件」，各幣種的
  SMA 值都已經算好放進 `coins-index.json`，前端用 JS 即時做多種條件篩選
  即可，不需要改後端。

## 免責聲明

本專案僅供技術分析與程式學習用途，資料來源為 Kraken 公開 API，可能有
延遲或誤差，**不構成任何投資建議**，加密貨幣波動風險極高，據此操作盈虧
請自行負責。
