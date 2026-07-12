// 直接從瀏覽器呼叫 Gemini API（Files API + generateContent），
// 使用「使用者自己輸入」的 API Key，因此消耗的是使用者自己的額度。
const API_BASE = 'https://generativelanguage.googleapis.com';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speaker: { type: 'STRING' },
          time: { type: 'STRING' },
          text: { type: 'STRING' }
        },
        required: ['speaker', 'text']
      }
    },
    summary: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'STRING' } },
    actionItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          owner: { type: 'STRING' }
        },
        required: ['text']
      }
    }
  },
  required: ['transcript', 'summary', 'decisions', 'actionItems']
};

const PROMPT = `你是一位專業的會議記錄秘書。請聽這段會議錄音，完成以下任務，並依提供的 JSON schema 輸出：
1. transcript：依發言順序列出逐字稿片段，每段包含講者識別（speaker）、時間戳記（time，格式如 01:23；無法判斷就填空字串）、內容（text）。
2. summary：用繁體中文 1-3 句話摘要會議核心討論主題與最終決議。
3. decisions：條列會議中明確做出的決策。
4. actionItems：擷取明確的行動待辦事項，包含負責人（owner，逐字稿中找不到就填「未指派」）。

全程使用繁體中文。`;

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    return data?.error?.message || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function uploadFile(apiKey, file) {
  const startRes = await fetch(`${API_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': file.type || 'application/octet-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: file.name } })
  });

  if (!startRes.ok) throw new Error(await readErrorMessage(startRes));

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini 未回傳上傳網址，請確認 API Key 是否有效');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0'
    },
    body: file
  });

  if (!uploadRes.ok) throw new Error(await readErrorMessage(uploadRes));

  const { file: uploaded } = await uploadRes.json();
  return waitUntilActive(apiKey, uploaded);
}

async function waitUntilActive(apiKey, file, attempt = 0) {
  if (file.state === 'ACTIVE') return file;
  if (attempt > 20) throw new Error('音檔處理逾時，請稍後再試');

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const res = await fetch(`${API_BASE}/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const updated = await res.json();
  return waitUntilActive(apiKey, updated, attempt + 1);
}

async function deleteFile(apiKey, file) {
  if (!file?.name) return;
  await fetch(`${API_BASE}/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' }).catch(() => {});
}

async function generateMeetingNotes(apiKey, model, file) {
  const res = await fetch(`${API_BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { file_data: { file_uri: file.uri, mime_type: file.mimeType } },
            { text: PROMPT }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    })
  });

  if (!res.ok) throw new Error(await readErrorMessage(res));

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Gemini 沒有回傳內容，請重試');

  const parsed = JSON.parse(text);
  return {
    transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
    summary: parsed.summary || '',
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : []
  };
}

export async function processMeetingAudio(apiKey, model, file) {
  if (!apiKey) throw new Error('請先在設定中輸入 Gemini API Key');

  const uploaded = await uploadFile(apiKey, file);
  try {
    return await generateMeetingNotes(apiKey, model, uploaded);
  } finally {
    deleteFile(apiKey, uploaded);
  }
}
