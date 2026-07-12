// 使用 Google Identity Services 的 OAuth2 Token Client 取得存取權杖，
// 純前端流程（無 client secret），權杖只存在記憶體中，分頁關閉就失效，
// 需要時會再跳出 Google 授權視窗要求使用者同意。
import { CONFIG } from './config.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('無法載入 Google 登入元件，請確認網路連線'));
    document.head.appendChild(script);
  });
}

async function ensureTokenClient() {
  await loadGis();
  if (tokenClient) return tokenClient;

  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
    throw new Error('尚未設定 GOOGLE_CLIENT_ID，請參考 README 設定 js/config.js');
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.DRIVE_SCOPE,
    callback: () => {} // 每次請求時動態覆寫
  });
  return tokenClient;
}

export function isSignedIn() {
  return Boolean(accessToken) && Date.now() < tokenExpiresAt;
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
}

export async function requestAccessToken({ interactive = true } = {}) {
  if (isSignedIn()) return accessToken;

  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      accessToken = response.access_token;
      tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3000) * 1000;
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}
