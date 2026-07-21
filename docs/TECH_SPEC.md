# 音樂置換點檢APP — 技術規格文件（開發者版）

> 版本：v1.0 | 建立：2026/07/07 | 維護：盤點本部資訊負責人

---

## 目錄

1. [系統概述](#1-系統概述)
2. [技術架構](#2-技術架構)
3. [資料庫 Schema](#3-資料庫-schema)
4. [API 端點](#4-api-端點)
5. [驗證流程](#5-驗證流程)
6. [計費邏輯](#6-計費邏輯)
7. [部門課別對應](#7-部門課別對應)
8. [CI/CD 流程](#8-cicd-流程)
9. [環境變數與 Secrets](#9-環境變數與-secrets)
10. [已知技術債與限制](#10-已知技術債與限制)

---

## 1. 系統概述

**系統名稱**：音樂置換點檢 APP  
**用途**：管理日翊文化行銷各門市音樂置換工作的點檢紀錄、統計報表及請款作業  
**開發架構**：單一頁面應用（SPA）＋ Cloudflare Workers 後端，無框架、純 Vanilla JS  
**程式碼風格**：單一檔案架構（`index.html` ~271KB），所有前端邏輯內嵌

---

## 2. 技術架構

```
使用者 (手機/電腦)
    │
    ├─ HTTPS ─→ Cloudflare Pages (前端 index.html)
    │               │
    │               ├─ /api/*  ─→ Cloudflare Workers (worker.js)
    │               │               ├─ D1 SQLite (資料庫)
    │               │               └─ Google Apps Script (Sheets 同步)
    │               │
    │               └─ /api/auth ─→ GCP Cloud Run (music-inspect)
    │                               └─ FME CheckUserId API (公司內網)
    │
    └─ PWA (Service Worker v4, 離線快取)
```

### 各層職責

| 層級 | 技術 | 職責 |
|------|------|------|
| 前端 | HTML/CSS/JS (單一檔案) | UI、表單、報表、離線 PWA |
| 後端 API | Cloudflare Workers + D1 | 資料 CRUD、驗證代理、Sheets 同步 |
| 驗證代理 | GCP Cloud Run (nginx) | 代理 FME 內網 API（Cloudflare IP 被封） |
| 資料庫 | Cloudflare D1 (SQLite) | 點檢記錄、店舖、人員 |
| 備份 | Google Apps Script | 即時同步至 Google Sheets |
| PWA | Service Worker v4 | GET 請求快取、離線讀取 |

### 端點清單

| 名稱 | URL |
|------|-----|
| 前端 (主要) | https://music-inspection.pages.dev |
| 前端 (備用/公司內網) | https://music-inspect-403438157899.asia-east1.run.app |
| 後端 API | https://music-inspection-api.a0955944828.workers.dev |
| GCP Auth Proxy | https://music-inspect-403438157899.asia-east1.run.app/auth |

---

## 3. 資料庫 Schema

使用 **Cloudflare D1**（SQLite 相容）。

### records（點檢記錄）

```sql
CREATE TABLE records (
  id          TEXT PRIMARY KEY,       -- 格式：{course}_{yyyyMMdd}_{random4}
  store       TEXT NOT NULL,          -- 店名（對應 stores.name）
  staff       TEXT NOT NULL,          -- 點檢人員姓名
  dept        TEXT,                   -- 部別（n1/n2/.../gp）
  course      TEXT NOT NULL,          -- 課別（n1/n2/.../gp）
  date        TEXT NOT NULL,          -- 點檢日期 YYYY-MM-DD
  answers     TEXT,                   -- JSON：{ q1: {v:'Y',x:''}, ... }
  nm_reason   TEXT,                   -- 未通過原因（自由文字）
  pass_all    INTEGER DEFAULT 0,      -- 全部通過 1/0
  pass_count  INTEGER DEFAULT 0,      -- 通過題數
  total       INTEGER DEFAULT 0,      -- 題目總數
  edit_log    TEXT DEFAULT '[]',      -- JSON 陣列：[{editor,time}]
  created_at  INTEGER                 -- Unix timestamp (ms)
);
```

### stores（店舖主檔）

```sql
CREATE TABLE stores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course      TEXT NOT NULL,   -- 歸屬課別
  name        TEXT NOT NULL,   -- 店名（UNIQUE per course）
  type        TEXT DEFAULT 'M',-- 店型（M = 一般，特殊備查）
  grp         TEXT DEFAULT '', -- 群組（選填）
  last_date   TEXT,            -- 最後點檢日期 YYYY-MM-DD
  created_at  INTEGER,
  UNIQUE(course, name)
);
```

### staff（人員名單）

```sql
CREATE TABLE staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course      TEXT NOT NULL,   -- 歸屬課別
  name        TEXT NOT NULL,
  created_at  INTEGER,
  UNIQUE(course, name)
);
```

> **注意**：點檢題目（questions）目前管理介面存在於前端維護管理頁，題目資料結構為 `{text, v(通過值), x(未通過值)}`，由 `answers` JSON 欄位對應存儲。

---

## 4. API 端點

Base URL：`https://music-inspection-api.a0955944828.workers.dev`

### POST /api/auth

FME 帳號驗證代理。

**Request**
```json
{ "USER_ID": "帳號", "PSW": "密碼" }
```

**Response**（轉發 FME CheckUserId 回傳）
```json
{ "MSG": "登入成功", "CODE": "0" }
```

**限制**：每 IP 每分鐘最多 10 次（Map-based rate limit，重啟失效）

---

### GET /api/records

查詢點檢記錄。

| Query Param | 說明 |
|-------------|------|
| `course` | 課別篩選（n1/n2/n3/n4/tz/tc/jn/gp） |
| `from` | 起始日期 YYYY-MM-DD |
| `to` | 結束日期 YYYY-MM-DD |

**Response**：`Record[]`（含 `answers` 反序列化、snake_case→camelCase 轉換）

---

### POST /api/records

新增點檢記錄。同月同店防重複（409 衝突）。

**Request Body**
```json
{
  "id": "n1_20260707_a1b2",
  "store": "店名",
  "staff": "點檢人",
  "dept": "n1",
  "course": "n1",
  "date": "2026-07-07",
  "answers": { "q1": { "v": "Y", "x": "" } },
  "nmReason": "",
  "passAll": true,
  "passCount": 10,
  "total": 10
}
```

**Side effects**：更新 `stores.last_date`、非同步同步 Google Sheets

---

### PUT /api/records/:id

修改記錄（後蓋前），自動追加 `edit_log`。

---

### DELETE /api/records/:id

刪除記錄，非同步同步 Google Sheets。

---

### GET /api/stores?course=

取得店舖清單（依 course 篩選）。

### POST /api/stores

新增店舖（支援單筆或陣列）。`INSERT OR IGNORE`。

### DELETE /api/stores/:id

刪除店舖。

---

### GET /api/staff?course=

取得人員清單。

### POST /api/staff

新增人員（支援單筆或陣列）。

### DELETE /api/staff/:id

刪除人員。

---

## 5. 驗證流程

```
前端登入表單
    │ POST /api/auth {USER_ID, PSW}
    ▼
Worker /api/auth
    │ 速率限制檢查（10次/分/IP）
    │ POST https://GCP-Cloud-Run/auth
    ▼
GCP nginx proxy（music-inspect）
    │ proxy_pass https://eip.fme.com.tw/FMEIP/AasApi/CheckUserId
    ▼
FME 公司內網 API
    │ 回傳 {MSG, CODE}
    ▼
前端 → 判斷 CODE === '0' → 登入成功
```

**原因**：Cloudflare 的出口 IP 被 FME 公司防火牆封鎖，須透過 GCP Cloud Run（固定 IP）代理。

**登入狀態**：儲存於 `sessionStorage`（關閉瀏覽器即登出）。

---

## 6. 計費邏輯

計費以「點檢結果」頁籤（pp）的報表功能計算，邏輯如下：

| 條件 | 費用 |
|------|------|
| 一般點檢記錄（每店） | NT$ 110 |
| 備註含「1、2、4燈恆亮」 | NT$ 0（免費） |
| 資料彙總費 | NT$ 8,000 / 月 |
| 稅率 | 5%，四捨五入 |

報表取每店該月最新一筆記錄，跨全部課別合計。

---

## 7. 部門課別對應

| 部別 | 課別代號 | 課別名稱 |
|------|----------|----------|
| 盤點一部 | n1 | 北一課 |
| 盤點一部 | n2 | 北二課 |
| 盤點一部 | n3 | 北三課 |
| 盤點一部 | n4 | 北四課 |
| 盤點一部 | tz | 桃竹課 |
| 盤點二部 | tc | 台中課 |
| 盤點二部 | jn | 嘉南課 |
| 盤點二部 | gp | 高屏課 |

**前端邏輯**：`onDeptChange()` 函式依部別連動顯示對應課別選項。

---

## 8. CI/CD 流程

### GitHub Actions（.github/workflows/deploy.yml）

觸發條件：push to `main` branch

```
Checkout
    → 資安報告檢查（security-report-YYYYMMDD-*.docx 需存在當日）
    → GCP OAuth2 認證（GCP_CREDENTIALS secret）
    → Docker build & push（asia-east1-docker.pkg.dev）
    → Cloud Run 部署（no_traffic，等待掃描）
    → Container Analysis 掃描等待（900s，逾時跳過）
    → 開放流量 100%
```

> 前端（Cloudflare Pages）與後端（Cloudflare Workers）由 Wrangler 自動部署，目前已從 deploy.yml 分離管理。

### 手動 GCP 重新部署

```bash
cd gcp
gcloud run deploy music-inspect --source . --region asia-east1 --platform managed --port 8080
```

### 注意事項

- **GCP OAuth2 token 每日失效**：每次部署前須執行 `gcloud auth application-default login` 並更新 GitHub Secret `GCP_CREDENTIALS`
- Container Analysis 掃描：`wej5217@fme.com.tw` 缺少 `containeranalysis.occurrences.list` 權限，逾時後自動跳過

---

## 9. 環境變數與 Secrets

### Cloudflare Workers（wrangler.toml）

| 變數 | 用途 |
|------|------|
| `DB` | D1 資料庫 binding |

### GitHub Secrets

| Secret | 用途 |
|--------|------|
| `GCP_CREDENTIALS` | GCP OAuth2 application default credentials JSON |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages/Workers 部署 token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 帳號 ID |

### GCP 相關

| 項目 | 值 |
|------|-----|
| Project ID | c000-493901 |
| Region | asia-east1 |
| Service Name | music-inspect |
| Artifact Registry | asia-east1-docker.pkg.dev/c000-493901/cloud-run-source-deploy |

---

## 10. 已知技術債與限制

| 項目 | 嚴重度 | 說明 |
|------|--------|------|
| API 無身分驗證 | Medium | Worker 路由未驗證 session token，知道 API URL 即可操作 |
| 請款密碼前端明文 | Low | 密碼 9588 寫死於 index.html，應移至後端驗證 |
| Rate Limiter 非持久 | Low | Worker 重啟或多 instance 時 rate limit 失效 |
| GCP token 每日失效 | 維運 | 每次部署需手動更新 GCP_CREDENTIALS Secret |
| Container scan 無權限 | 維運 | 需管理員授予 containeranalysis.occurrences.viewer |
| 單一 HTML 檔案 | 維護性 | ~271KB，難以模組化測試 |

---

> 最後更新：2026/07/07 | 由 AI 輔助（Claude Code）維護
