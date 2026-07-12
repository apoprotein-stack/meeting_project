# MeetFlow - AI 會議記錄整理（純前端 PWA）

上傳會議錄音，瀏覽器直接呼叫 Gemini 完成逐字稿（含講者、時間戳記）、摘要、決策與待辦事項整理；登入 Google 後，會議記錄會存進**你自己的** Google 雲端硬碟。整個 App 沒有後端伺服器：

- **Gemini 額度**：你自己在 Google AI Studio 申請 API Key，貼到 App 設定裡，存在你手機/電腦瀏覽器本機，不會經過任何我們的伺服器。
- **會議記錄儲存**：透過「使用 Google 登入」取得存取權限，直接寫入你 Google 雲端硬碟裡的 `MeetFlow 會議記錄` 資料夾（App 只能存取自己建立的檔案，不會讀你雲端硬碟裡其他既有檔案）。
- **部署**：純靜態網站，放 GitHub Pages 即可，手機瀏覽器打開後可「加入主畫面」，像 App 一樣使用（PWA）。

## 一、取得 Gemini API Key（每個使用者自己申請，用自己的額度）

前往 [Google AI Studio](https://aistudio.google.com/apikey) 免費建立一把 API Key，之後在 App 右上角「Gemini API Key 設定」貼上即可。

## 二、建立 Google OAuth 用戶端 ID（部署者只需設定一次）

因為要讓使用者能「登入 Google → 存取自己的雲端硬碟」，需要一組 OAuth Client ID。這步只有**部署這個網站的人**需要做一次：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，建立一個新專案（或使用現有專案）。
2. 左側選單「API 和服務」→「已啟用的 API」→ 啟用 **Google Drive API**。
3. 「API 和服務」→「OAuth 同意畫面」：
   - 使用者類型選「外部」。
   - 填寫 App 名稱、支援 email 即可，範圍（Scopes）不用額外加，`drive.file` 屬於非敏感範圍。
   - 若只有自己使用，可以在「測試使用者」加入自己的 Google 帳號，不需要送審發布。
4. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」：
   - 應用程式類型選「網頁應用程式」。
   - 「已授權的 JavaScript 來源」加入：
     - `https://<你的 GitHub 帳號>.github.io`（GitHub Pages 網址）
     - `http://localhost:8000`（本機測試用，埠號依你本機啟動的伺服器而定）
   - 建立後會拿到一組 `xxxxx.apps.googleusercontent.com` 的 Client ID。
5. 打開 `js/config.js`，把 `GOOGLE_CLIENT_ID` 換成你剛剛拿到的值。

> 這個 Client ID 不是密鑰，寫在前端程式碼裡是正常且必要的做法；Google 會用「已授權的 JavaScript 來源」來限制它只能在你指定的網址上使用。

## 三、部署到 GitHub Pages

1. 打開 repo 的 **Settings → Pages**，「Source」選擇 **GitHub Actions**（本 repo 已內建 `.github/workflows/deploy-pages.yml`，push 到 `main` 就會自動部署）。
2. 確認 repo 為 **Public**（GitHub Pages 免費方案僅支援公開 repo）。
3. push 到 `main` 後，等 Actions 跑完，Pages 網址會顯示在 Settings → Pages 頁面（通常是 `https://<帳號>.github.io/<repo 名稱>/`）。
4. 回到步驟二，把這個實際網址加進 OAuth 用戶端 ID 的「已授權的 JavaScript 來源」。

## 四、手機安裝成「App」

用手機瀏覽器（iOS Safari／Android Chrome）打開部署後的網址：

- **iOS**：分享 → 「加入主畫面」
- **Android Chrome**：右上角選單 → 「安裝應用程式」／「加到主畫面」

之後就會像 App 一樣有獨立圖示、全螢幕啟動。

## 本機開發

純前端 ES modules 需要透過 HTTP 伺服器開啟（不能直接雙擊 `index.html`），例如：

```bash
python3 -m http.server 8000
# 或
npx serve -l 8000
```

再用瀏覽器打開 `http://localhost:8000`。記得把這個網址加進 OAuth 用戶端 ID 的授權來源，才能在本機測試「使用 Google 登入」。

## 專案結構

```
index.html              App 主頁面
css/styles.css          樣式
js/config.js            OAuth Client ID／預設模型等公開設定（部署前需修改）
js/auth.js              Google 登入（OAuth2 Token Client）
js/gemini.js            呼叫 Gemini Files API + generateContent
js/drive.js             會議記錄存取 Google 雲端硬碟
js/app.js               UI 邏輯與狀態管理
manifest.webmanifest    PWA 設定
sw.js                   Service Worker（快取 App 介面，離線可開啟）
icons/                  App 圖示
.github/workflows/      GitHub Pages 自動部署
```

## 隱私與安全性重點

- Gemini API Key 只存在使用者自己裝置的 `localStorage`，不會上傳到任何伺服器。
- Google 登入只申請 `drive.file` 權限，App 只能看到／管理自己建立的檔案。
- 所有 API 呼叫（Gemini、Google Drive）都是瀏覽器直接對 Google 發送，沒有中介伺服器經手資料。
