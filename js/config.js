// 這裡的值都是「公開用戶端設定」，不是密鑰，可以放心留在前端程式碼裡。
// 真正的機密（Gemini API Key）由使用者在 App 內輸入，只存在該裝置瀏覽器的 localStorage。
export const CONFIG = {
  // 在 Google Cloud Console 建立的 OAuth 2.0 用戶端 ID（Web application）。
  // 部署前必須換成你自己的值，否則「使用 Google 登入」無法運作。
  // 設定步驟見 README.md。
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',

  // 只要求存取「這個 App 建立的檔案」，不會讀取使用者雲端硬碟的其他內容。
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.file',

  // 會議記錄在 Google Drive 中存放的資料夾名稱。
  DRIVE_FOLDER_NAME: 'MeetFlow 會議記錄',

  // 預設使用的 Gemini 模型，可在 App 設定畫面覆寫。
  DEFAULT_GEMINI_MODEL: 'gemini-2.5-flash'
};
