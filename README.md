# MeetFlow - AI 會議記錄整理網站

上傳會議錄音，後端呼叫 Gemini（Files API + `generateContent`）一次完成語音轉文字（含講者識別與時間戳記）、會議摘要、決策與待辦事項擷取。

## 安裝與設定

```bash
npm install
cp .env.example .env
```

編輯 `.env`，填入：

- `GEMINI_API_KEY`：用於語音轉錄與 AI 摘要（Gemini）

## 啟動

```bash
npm start
```

伺服器預設在 `http://localhost:3000`。

## 功能

- 上傳音檔（`.mp3`/`.wav`/`.m4a` 等，Gemini Files API 上限 2GB）
- 一鍵由 Gemini 產生逐字稿（含講者與時間戳記）、會議摘要、決策清單與建議待辦事項
- 逐字稿關鍵字搜尋
- 建議待辦事項可一鍵加入待辦清單
- 待辦事項新增／狀態切換／刪除
- 匯出會議資料為 JSON

## 專案結構

```
server.js        Express 後端，提供 /api/process-meeting
public/index.html 前端頁面（純 HTML/CSS/JS，無建置流程）
```
