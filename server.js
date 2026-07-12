require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 } // Whisper API 上限 25MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('尚未設定 OPENAI_API_KEY，請於 .env 補上後重新啟動伺服器');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('尚未設定 ANTHROPIC_API_KEY，請於 .env 補上後重新啟動伺服器');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請附上音檔' });
  }

  try {
    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'
    });
    res.json({ text: transcription.text });
  } catch (err) {
    console.error('[transcribe]', err.message);
    res.status(500).json({ error: err.message || '語音轉文字失敗' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/summarize', async (req, res) => {
  const { transcript } = req.body || {};
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: '沒有逐字稿內容可供摘要' });
  }

  const system = `你是會議記錄助理。閱讀逐字稿後，只輸出一個 JSON 物件（不要加任何其他文字或 markdown 標記），格式為：
{
  "summary": "1-2 句話的會議重點摘要",
  "decisions": ["決策 1", "決策 2"],
  "actionItems": [{"text": "待辦內容", "owner": "負責人（逐字稿中找不到就填 未指派）"}]
}`;

  try {
    const anthropic = getAnthropic();
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: transcript }]
    });

    const raw = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    let parsed;
    try {
      const jsonText = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      return res.json({ summary: raw, decisions: [], actionItems: [] });
    }

    res.json({
      summary: parsed.summary || '',
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    });
  } catch (err) {
    console.error('[summarize]', err.message);
    res.status(500).json({ error: err.message || 'AI 摘要產生失敗' });
  }
});

app.listen(PORT, () => {
  console.log(`MeetFlow 伺服器已啟動：http://localhost:${PORT}`);
});
