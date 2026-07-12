# MeetFlow - AI 會議記錄整理網站

上傳會議錄音，後端呼叫 OpenAI Whisper 轉成逐字稿，再由 Claude API 自動整理摘要、決策與建議待辦事項。

## 安裝與設定

```bash
npm install
cp .env.example .env
```

編輯 `.env`，填入：

- `OPENAI_API_KEY`：用於語音轉文字（Whisper）
- `ANTHROPIC_API_KEY`：用於自動摘要（Claude）

## 啟動

```bash
npm start
```

伺服器預設在 `http://localhost:3000`。

## 功能

- 上傳音檔（`.mp3`/`.wav`/`.m4a` 等）並自動轉錄為逐字稿
- 一鍵呼叫 Claude 產生會議摘要、決策清單與建議待辦事項
- 逐字稿關鍵字搜尋
- 待辦事項新增／狀態切換／刪除
- 匯出會議資料為 JSON

## 專案結構

```
server.js        Express 後端，提供 /api/transcribe 與 /api/summarize
public/index.html 前端頁面（純 HTML/CSS/JS，無建置流程）
```
