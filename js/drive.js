// 透過 Google Drive REST API（drive.file 範圍）把會議記錄存進使用者自己的雲端硬碟。
// 這個範圍只能存取「這個 App 建立的檔案」，不會讀取使用者硬碟中其他既有檔案。
import { CONFIG } from './config.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_ID_KEY = 'meetflow.driveFolderId';

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    return data?.error?.message || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function findFolder(token) {
  const q = encodeURIComponent(
    `name='${CONFIG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name)`, {
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token) {
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG.DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = await res.json();
  return data.id;
}

export async function ensureAppFolder(token) {
  const cached = localStorage.getItem(FOLDER_ID_KEY);
  if (cached) return cached;

  const existing = await findFolder(token);
  const folderId = existing || (await createFolder(token));
  localStorage.setItem(FOLDER_ID_KEY, folderId);
  return folderId;
}

export async function saveMeetingToDrive(token, meeting) {
  const folderId = await ensureAppFolder(token);
  const metadata = {
    name: `${meeting.title || '會議記錄'}-${meeting.createdAt}.json`,
    parents: [folderId],
    mimeType: 'application/json'
  };

  const boundary = 'meetflow-' + Math.random().toString(16).slice(2);
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meeting) +
    `\r\n--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json();
}

export async function listMeetingsFromDrive(token) {
  const folderId = await ensureAppFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=50`,
    { headers: authHeaders(token) }
  );
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = await res.json();
  return data.files || [];
}

export async function loadMeetingFromDrive(token, fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json();
}
