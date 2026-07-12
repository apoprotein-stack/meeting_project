require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // Gemini Files API 上限 2GB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('尚未設定 GEMINI_API_KEY，請於 .env 補上後重新啟動伺服器');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          time: { type: Type.STRING },
          text: { type: Type.STRING }
        },
        required: ['speaker', 'text']
      }
    },
    summary: { type: Type.STRING },
    decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          owner: { type: Type.STRING }
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

app.post('/api/process-meeting', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請附上音檔' });
  }

  let ai;
  try {
    ai = getGemini();
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: err.message });
  }

  let uploadedFile;
  try {
    uploadedFile = await ai.files.upload({
      file: req.file.path,
      config: { mimeType: req.file.mimetype }
    });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
        { text: PROMPT }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const parsed = JSON.parse(response.text);
    res.json({
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
      summary: parsed.summary || '',
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    });
  } catch (err) {
    console.error('[process-meeting]', err.message);
    res.status(500).json({ error: err.message || '會議錄音處理失敗' });
  } finally {
    fs.unlink(req.file.path, () => {});
    if (uploadedFile?.name) {
      ai.files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`MeetFlow 伺服器已啟動：http://localhost:${PORT}`);
});
