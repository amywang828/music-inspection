# 音樂置換點檢APP — 技術規格文件

## 系統概覽

| 項目 | 說明 |
|---|---|
| 系統名稱 | 音樂置換點檢APP |
| 版本 | v5.2 |
| 建置日期 | 2026年5月 |
| 開發工具 | Claude AI (Anthropic) |
| 維護單位 | 日翊文化事業股份有限公司 |

---

## 部署架構

```
使用者（手機/電腦）
        ↓ HTTPS
Cloudflare Pages（前端 PWA）
  https://music-inspection.pages.dev
        ↓ REST API
Cloudflare Workers（後端 API）
  https://music-inspection-api.a0955944828.workers.dev
        ↓ SQL
Cloudflare D1（主要資料庫）
  music-inspection-db
        ↓ 非同步同步
Google Apps Script → Google Sheets
  tpisales@fme.com.tw（備份查閱）
```

---

## 技術堆疊

### 前端
- 單一 HTML 檔案架構（index.html，~271KB）
- 純 JavaScript（無框架）
- PWA（Progressive Web App）
  - manifest.json：APP 安裝設定，名稱「音樂置換點檢APP」
  - sw.js v4：Service Worker，DELETE/POST/PUT 直接送網路不快取
- 外部套件：SheetJS xlsx.full.min.js v0.18.5（Excel 匯出）

### 後端
- Cloudflare Workers（Edge Computing，JavaScript ES Module）
- Cloudflare D1（SQLite，綁定名稱 DB）

### 資料同步
- Google Apps Script Web App（非同步推送，不阻塞主流程）

### 版本管理
- GitHub：github.com/amywang828/music-inspection
- GitHub Actions 自動部署（push main 觸發）

---

## 檔案清單

| 檔案 | 大小 | 說明 |
|---|---|---|
| index.html | ~271KB | 前端主程式（含所有頁籤功能） |
| worker.js | ~10KB | 後端 API v5 |
| sw.js | ~1.7KB | Service Worker v4 |
| manifest.json | ~700B | PWA 設定 |
| gas.js | ~9KB | Google Apps Script 同步備份 |
| sync_init.js | ~4KB | 初始同步工具（一次性使用） |
| icons/icon-192.png | ~900B | APP 圖示（手機桌面） |
| icons/icon-512.png | ~2.6KB | APP 圖示（啟動畫面） |
| .github/workflows/deploy.yml | ~1.6KB | GitHub Actions 自動部署 |
| CLAUDE.md | ~2KB | Claude Code 專案記憶 |
| TECH_SPEC.md | 本文件 | 技術規格說明 |

---

## D1 資料庫結構

### records（點檢記錄）
```sql
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  staff TEXT NOT NULL,
  dept TEXT,
  course TEXT,
  date TEXT,
  answers TEXT,        -- JSON {"1":"V","2":"V","3":"V","4":"X"}
  nm_reason TEXT,      -- 燈號異常原因
  pass_all INTEGER,    -- 0/1
  pass_count INTEGER,
  total INTEGER,
  edit_log TEXT,       -- JSON Array [{editor, time}]
  created_at INTEGER   -- Unix timestamp
);
CREATE INDEX idx_course ON records(course);
CREATE INDEX idx_date_store ON records(date, store);
```

### stores（應查核店舖）
```sql
CREATE TABLE stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'M',
  grp TEXT DEFAULT '',
  last_date TEXT DEFAULT '',
  created_at INTEGER,
  UNIQUE(course, name)
);
CREATE INDEX idx_stores_course ON stores(course);
```

### staff（點檢人員）
```sql
CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE(course, name)
);
CREATE INDEX idx_staff_course ON staff(course);
```

---

## API 端點

Base URL：`https://music-inspection-api.a0955944828.workers.dev`

### 點檢記錄
| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /api/records?course=&from=&to= | 取得記錄 |
| POST | /api/records | 新增記錄（同月同店防重複） |
| PUT | /api/records/:id | 修改記錄（含日期） |
| DELETE | /api/records/:id | 刪除記錄 |

### 店舖名單
| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /api/stores?course= | 取得店舖 |
| POST | /api/stores | 新增單筆或批次陣列 |
| DELETE | /api/stores/:id | 刪除店舖 |

### 人員名單
| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /api/staff?course= | 取得人員 |
| POST | /api/staff | 新增單筆或批次陣列 |
| DELETE | /api/staff/:id | 刪除人員 |

---

## 帳號與金鑰

| 項目 | 值 |
|---|---|
| APP 登入帳號 | Reyi945 |
| APP 登入密碼 | 879123 |
| 請款明細密碼 | 9588 |
| 刪除記錄密碼 | 9588 |
| Cloudflare 帳號 | a0955944828@gmail.com |
| Cloudflare Account ID | a0955944828 |
| GitHub 帳號 | amywang828 |
| Google Sheets 帳號 | tpisales@fme.com.tw |
| Spreadsheet ID | 1wH0edfIlU4B4VzaDTFkzbHBfIMDTGOW81i1JCAUCQ98 |
| GAS Web App URL | https://script.google.com/a/macros/fme.com.tw/s/AKfycbzflj4bYTiLefla5gV1epG-9B_cKh6VqVIxAW9ypAaifHu2N2C1g1IdiXzkl5PITOBeHA/exec |

---

## 課別代碼對應

| 代碼 | 課別 | 部別 |
|---|---|---|
| n1 | 北一課 | 盤點一部 |
| n2 | 北二課 | 盤點一部 |
| n3 | 北三課 | 盤點一部 |
| n4 | 北四課 | 盤點一部 |
| tz | 桃竹課 | 盤點一部 |
| tc | 台中課 | 盤點二部 |
| jn | 嘉南課 | 盤點二部 |
| gp | 高屏課 | 盤點二部 |

---

## 計費規則

| 條件 | 費用 |
|---|---|
| 一般店舖（V 或 X 其他燈號） | 110 元/店 |
| 備註含「1、2、4燈恆亮」 | 0 元 |
| 資料彙總費 | 8,000 元/月（固定） |
| 稅率 | 5%（四捨五入） |

### 部門彙整計算
- 盤點一部：音樂更新費（各店 110 元加總）+ 5% 稅
- 盤點二部：音樂更新費（各店 110 元加總）+ 5% 稅
- 業務部：資料彙總費 8,000 + 5% 稅

---

## 業務邏輯

### 防重複規則
- 同月同店只能點檢一次
- 前端 + 後端雙重驗證（substr(date,1,7) 取年月比對）

### 修改規則
- 後蓋前（UPDATE，不新增）
- 可修改：點檢日期、各題答案
- 留存修改記錄（editor + time）

### 刪除規則
- 查詢記錄頁每店旁有「刪除」按鈕
- 需輸入管理密碼 9588 確認
- 同步刪除 D1 和 Google Sheets

### 統計規則
- 每店取最新一筆（去重），確保點檢筆數 = 已上傳店數
- 報表計算來源：全部課別

---

## 功能頁籤

### 1. 基本資料
順序：盤點部別/課別 → 點檢日期 → 應查核店舖 → 點檢人員

**部別與課別連動：**
- 選「盤點一部」→ 課別只顯示：北一課、北二課、北三課、北四課、桃竹課
- 選「盤點二部」→ 課別只顯示：台中課、嘉南課、高屏課
- 切換部別時自動重置課別、店舖、人員

### 2. 點檢問答
- 4 題 V/X 單選
- 第 4 題 X 需選燈號：
  1. 1、2、4燈恆亮（計費 0 元）
  2. 5號燈沒亮
  3. 1、3、5燈恆亮但無音樂播出
  4. 燈號全亮或全不亮

### 3. 查詢記錄
- 選課別 + 起訖日期篩選
- 未選課別時顯示全部課別統計
- 統計：總點檢筆數 / 已上傳總店數（每店一筆去重）
- 每店操作：查詢、修改、刪除

### 4. 點檢結果
- 起訖日期（全部課別）
- 音樂置換紀錄表（Excel 下載）
- 請款明細表（需密碼 9588）
  - 工作表1：逐筆請款明細
  - 工作表2：費用明細 + 部門彙整（含稅）

### 5. 維護管理
- 應查核店舖：匯入 Excel、手動新增、刪除（雲端共用，無範例資料按鈕）
- 點檢人員：匯入 Excel、手動新增、刪除（雲端共用，無範例資料按鈕）
- 點檢題目：自訂題目管理（本機儲存）

### 6. 點檢SOP
- 附件一：無網路店舖音樂更換流程
- 無網路店舖更新音樂 SOP（LED 燈號說明表）
- 機上盒收音機示意圖（含實物照片）

---

## 匯入 Excel 格式

### 應查核店舖名單
| 欄位 | 必填 | 說明 |
|---|---|---|
| 盤點課別 | ✅ | 北一課、北二課…高屏課 |
| 店名 | ✅ | 門市名稱 |
| 查核類別 | 選填 | 預設 M |
| 盤點組別 | 選填 | 負責人姓名 |
| 前次置換日期 | 選填 | |

### 點檢人員名單
| 欄位 | 必填 |
|---|---|
| 課別 | ✅ |
| 姓名 | ✅ |

---

## 更新部署流程

### 前端（index.html + sw.js）
**Cloudflare Pages 手動上傳：**
1. dash.cloudflare.com → Pages → music-inspection
2. Create new deployment → 上傳檔案 → Deploy site

**GitHub 自動部署：**
1. 編輯並 Commit → push main
2. GitHub Actions 自動部署（30秒）

### 後端（worker.js）
1. dash.cloudflare.com → Workers → music-inspection-api
2. 編輯程式碼 → 貼上 → 部署

---

## Service Worker 注意事項
- 版本：v4（CACHE = 'music-inspect-v4'）
- DELETE/POST/PUT 直接送網路（不快取）
- index.html：Network First（永遠取最新版）
- 靜態資源：Cache First
- 更新 sw.js 後使用者需清除瀏覽器快取

---

## 已知限制與注意事項

1. **Service Worker 快取**：更新後使用者需手動清除快取才載入新版
2. **Google Sheets 同步**：企業帳號（fme.com.tw）網路限制可能影響 Apps Script 執行速度
3. **D1 免費額度**：每天 5 萬次讀取、500 次寫入（免費方案）
4. **innerHTML 引號**：template literal 內不需跳脫單引號，避免語法錯誤
5. **無多帳號管理**：目前全員共用帳號 Reyi945

---

## 未來規劃

- [ ] 移轉至 GCP（Cloud Run + Cloud SQL）
- [ ] 多帳號登入（Google OAuth / Firebase Auth）
- [ ] BigQuery 報表分析 + Looker Studio
- [ ] 離線點檢後自動同步佇列
- [ ] 推播通知（點檢到期提醒）
