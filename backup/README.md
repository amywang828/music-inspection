# 音樂置換點檢APP

全家便利商店音樂置換點檢作業系統

## 系統網址
- 前端：https://music-inspection.pages.dev
- API：https://music-inspection-api.a0955944828.workers.dev

## 技術架構
- 前端：Cloudflare Pages（PWA）
- 後端：Cloudflare Workers
- 資料庫：Cloudflare D1

## 自動部署
推送到 `main` 分支後，GitHub Actions 自動部署：
- `index.html` / `sw.js` / `manifest.json` → Cloudflare Pages
- `worker.js` → Cloudflare Workers

## 檔案說明
| 檔案 | 說明 |
|------|------|
| `index.html` | 前端主程式（含登入、點檢、報表、SOP） |
| `sw.js` | Service Worker 離線快取 |
| `manifest.json` | PWA 安裝設定 |
| `worker.js` | 後端 API |
| `icons/` | APP 圖示 |

## 登入資訊
- 帳號：Reyi945
- 密碼：879123
- 請款明細密碼：9588

## 本機開發
```bash
git clone https://github.com/你的帳號/music-inspection.git
cd music-inspection
# 修改 index.html 後
git add .
git commit -m "說明修改內容"
git push
# 約 30 秒後自動部署完成
```
