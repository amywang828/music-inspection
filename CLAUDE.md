# 音樂置換點檢APP — Claude Code 專案記憶

## 系統網址
- 前端：https://music-inspection.pages.dev
- API：https://music-inspection-api.a0955944828.workers.dev
- GitHub：https://github.com/amywang828/music-inspection
- Google Sheets：https://docs.google.com/spreadsheets/d/1wH0edfIlU4B4VzaDTFkzbHBfIMDTGOW81i1JCAUCQ98

## 重要檔案
- `index.html`：前端主程式（~271KB，單一檔案架構）
- `worker.js`：後端 API（Cloudflare Workers + D1）
- `sw.js`：Service Worker v4
- `manifest.json`：PWA 設定
- `gas.js`：Google Apps Script 同步備份

## 登入資訊
- APP 帳號：Reyi945 / 密碼：879123
- 請款明細密碼：9588
- 刪除記錄密碼：9588

## 計費規則
- 每店 110 元
- 備註含「1、2、4燈恆亮」→ 0 元
- 資料彙總費：8,000 元/月
- 稅率：5%，四捨五入

## 課別與部別對應
- 盤點一部：n1=北一課, n2=北二課, n3=北三課, n4=北四課, tz=桃竹課
- 盤點二部：tc=台中課, jn=嘉南課, gp=高屏課

## 部別課別連動
- 選盤點一部 → 課別只顯示北一~北四、桃竹課
- 選盤點二部 → 課別只顯示台中、嘉南、高屏課
- 函數：onDeptChange()

## 重要業務邏輯
- 同月同店防重複（前端+後端雙重驗證）
- 修改：後蓋前（UPDATE），留存修改記錄
- 刪除：需密碼 9588，同步刪除 D1 + Sheets
- 報表：每店取最新一筆，全部課別計算
- 維護管理：無「載入範例資料」按鈕

## UI 規範
- 字體：微軟正黑體
- 主色：#1565C0
- 手機版 13px / PC版（≥640px）15px
- 點檢SOP 頁籤：橘紅色 #D84315
- 語言：Traditional Chinese，lang="zh-TW"

## 開發注意事項
- innerHTML 賦值：template literal 內不跳脫單引號
- DOM API 優先：避免引號衝突
- Service Worker：DELETE/POST/PUT 不走快取
- 更新 sw.js：需同步上傳到 Cloudflare Pages

## 部署流程
```bash
git add .
git commit -m "說明修改內容"
git push
# GitHub Actions 自動部署到 Cloudflare Pages（30秒）
```

## Worker 手動部署
dash.cloudflare.com → Workers → music-inspection-api → 編輯程式碼 → 部署
