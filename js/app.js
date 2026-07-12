import { CONFIG } from './config.js';
import { requestAccessToken, signOut } from './auth.js';
import { ensureAppFolder, saveMeetingToDrive, listMeetingsFromDrive, loadMeetingFromDrive } from './drive.js';
import { processMeetingAudio } from './gemini.js';

const STORAGE_KEYS = {
  apiKey: 'meetflow.geminiApiKey',
  model: 'meetflow.geminiModel'
};

function blankMeeting() {
  return {
    title: '新的會議記錄',
    createdAt: new Date().toISOString(),
    driveFileId: null,
    transcripts: [],
    summaries: [],
    suggestedTasks: [],
    tasks: []
  };
}

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) || '',
  model: localStorage.getItem(STORAGE_KEYS.model) || CONFIG.DEFAULT_GEMINI_MODEL,
  signedIn: false,
  driveMeetings: [],
  current: {
    ...blankMeeting(),
    title: '產品規劃週會（範例）',
    transcripts: [
      { speaker: 'Amy｜PM', time: '14:03', text: '今天先確認新版首頁的發布時程，還有 A/B 測試範圍。' },
      { speaker: 'Leo｜工程', time: '14:08', text: '前端本週四前可以完成，後端 API 還需要一天整合與驗證。' }
    ],
    summaries: [
      { type: 'summary', text: '這是範例內容。上傳你自己的會議錄音，AI 會取代這裡的示範資料。' }
    ],
    tasks: [
      { id: 1, text: '整理 A/B 測試需求', owner: 'Amy', status: 'todo' }
    ]
  }
};

const refs = {
  stats: document.getElementById('stats'),
  transcriptList: document.getElementById('transcriptList'),
  summaryList: document.getElementById('summaryList'),
  actionList: document.getElementById('actionList'),
  meetingList: document.getElementById('meetingList'),
  transcriptSearch: document.getElementById('transcriptSearch'),
  processBtn: document.getElementById('processBtn'),
  processError: document.getElementById('processError'),
  meetingTitle: document.getElementById('meetingTitle'),
  meetingMeta: document.getElementById('meetingMeta'),
  syncNote: document.getElementById('syncNote'),
  accountDot: document.getElementById('accountDot'),
  accountLabel: document.getElementById('accountLabel'),
  signInBtn: document.getElementById('signInBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelInput: document.getElementById('modelInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  newMeetingBtn: document.getElementById('newMeetingBtn'),
  exportBtn: document.getElementById('exportBtn')
};

function statusLabel(status) {
  return status === 'todo' ? '待處理' : status === 'progress' ? '進行中' : '已完成';
}

function showError(el, message) {
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function renderStats() {
  const doneCount = state.current.tasks.filter((t) => t.status === 'done').length;
  const html = [
    ['雲端會議數', state.driveMeetings.length],
    ['逐字稿段落', state.current.transcripts.length],
    ['待辦事項', state.current.tasks.length],
    ['已完成任務', doneCount]
  ].map(([label, value]) => `
    <div class="card stat">
      <small>${label}</small>
      <h3>${value}</h3>
    </div>
  `).join('');
  refs.stats.innerHTML = html;
}

function renderMeetingMeta() {
  const date = new Date(state.current.createdAt);
  refs.meetingMeta.textContent = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderMeetings() {
  if (!state.signedIn) {
    refs.meetingList.innerHTML = '<div class="empty" style="padding:12px 4px;">登入 Google 後會顯示已儲存的會議</div>';
    return;
  }
  if (!state.driveMeetings.length) {
    refs.meetingList.innerHTML = '<div class="empty" style="padding:12px 4px;">還沒有儲存過的會議</div>';
    return;
  }
  refs.meetingList.innerHTML = state.driveMeetings.map((m) => `
    <div class="meeting-chip" data-id="${m.id}">
      <strong>${m.name.replace(/\.json$/, '')}</strong>
      <span>${new Date(m.createdTime).toLocaleDateString('zh-TW')}</span>
    </div>
  `).join('');

  refs.meetingList.querySelectorAll('.meeting-chip').forEach((chip) => {
    chip.addEventListener('click', () => loadMeeting(chip.dataset.id));
  });
}

function renderTranscripts() {
  const keyword = refs.transcriptSearch.value.trim();
  const rows = state.current.transcripts.filter((t) => !keyword || t.text.includes(keyword) || t.speaker.includes(keyword));
  refs.transcriptList.innerHTML = rows.length ? rows.map((t) => `
    <div class="transcript-item">
      <div class="speaker">
        <strong>${t.speaker}</strong>
        <span class="time">${t.time || ''}</span>
      </div>
      <div>${t.text}</div>
    </div>
  `).join('') : '<div class="empty">找不到符合的逐字稿內容</div>';
}

function renderSummaries() {
  const items = state.current.summaries.map((s) => {
    const cls = s.type === 'summary' ? '' : 'success';
    const label = s.type === 'summary' ? '摘要' : '決策';
    return `
      <div class="summary-item">
        <span class="summary-dot ${cls}"></span>
        <div>
          <div class="tag">${label}</div>
          <div>${s.text}</div>
        </div>
      </div>
    `;
  });

  const suggested = state.current.suggestedTasks.map((t, i) => `
    <div class="summary-item suggested-item">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <span class="summary-dot warn"></span>
        <div>
          <div class="tag">建議待辦</div>
          <div>${t.text}（${t.owner}）</div>
        </div>
      </div>
      <button class="btn small secondary" data-add-suggested="${i}">加入待辦</button>
    </div>
  `);

  refs.summaryList.innerHTML = items.concat(suggested).join('') || '<div class="empty">尚未產生摘要</div>';

  refs.summaryList.querySelectorAll('[data-add-suggested]').forEach((btn) => {
    btn.addEventListener('click', () => addSuggestedTask(Number(btn.dataset.addSuggested)));
  });
}

function renderTasks() {
  refs.actionList.innerHTML = state.current.tasks.length ? state.current.tasks.map((t) => `
    <div class="action-item">
      <div>
        <strong>${t.text}</strong>
        <div class="subtle">負責人：${t.owner}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span class="badge ${t.status}">${statusLabel(t.status)}</span>
        <button class="btn secondary" data-cycle="${t.id}">切換狀態</button>
        <button class="btn secondary" data-remove="${t.id}">刪除</button>
      </div>
    </div>
  `).join('') : '<div class="empty">目前沒有待辦事項</div>';

  refs.actionList.querySelectorAll('[data-cycle]').forEach((btn) => {
    btn.addEventListener('click', () => cycleTask(Number(btn.dataset.cycle)));
  });
  refs.actionList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeTask(Number(btn.dataset.remove)));
  });
}

function renderAccount() {
  refs.accountDot.classList.toggle('on', state.signedIn);
  refs.accountLabel.textContent = state.signedIn ? '已連結 Google 雲端硬碟' : '尚未連結 Google 雲端';
  refs.signInBtn.textContent = state.signedIn ? '登出' : '使用 Google 登入';
}

function renderAll() {
  refs.meetingTitle.value = state.current.title;
  renderMeetingMeta();
  renderStats();
  renderMeetings();
  renderTranscripts();
  renderSummaries();
  renderTasks();
  renderAccount();
}

async function refreshDriveMeetings(token) {
  state.driveMeetings = await listMeetingsFromDrive(token);
  renderMeetings();
  renderStats();
}

async function loadMeeting(fileId) {
  try {
    const token = await requestAccessToken();
    const meeting = await loadMeetingFromDrive(token, fileId);
    state.current = { ...blankMeeting(), ...meeting, driveFileId: fileId };
    renderAll();
  } catch (err) {
    alert('讀取會議記錄失敗：' + err.message);
  }
}

async function autoSaveToDrive() {
  if (!state.signedIn) return;
  try {
    const token = await requestAccessToken();
    await saveMeetingToDrive(token, state.current);
    await refreshDriveMeetings(token);
    refs.syncNote.textContent = '已儲存到你的 Google 雲端硬碟。';
  } catch (err) {
    refs.syncNote.textContent = '儲存到 Google 雲端失敗：' + err.message;
  }
}

refs.processBtn.addEventListener('click', async () => {
  const fileInput = document.getElementById('audioFile');
  const file = fileInput.files[0];
  showError(refs.processError, '');

  if (!state.apiKey) {
    showError(refs.processError, '請先點右上角「Gemini API Key 設定」輸入你的金鑰');
    openSettings();
    return;
  }
  if (!file) {
    showError(refs.processError, '請先選擇音檔');
    return;
  }

  refs.processBtn.disabled = true;
  refs.processBtn.textContent = '分析中...（依錄音長度可能需要一些時間）';

  try {
    const result = await processMeetingAudio(state.apiKey, state.model, file);
    state.current.transcripts = result.transcript.map((t) => ({
      speaker: t.speaker || '未識別',
      time: t.time || '',
      text: t.text
    }));
    state.current.summaries = [
      ...(result.summary ? [{ type: 'summary', text: result.summary }] : []),
      ...result.decisions.map((text) => ({ type: 'decision', text }))
    ];
    state.current.suggestedTasks = result.actionItems.map((item) => ({
      text: item.text,
      owner: item.owner || '未指派'
    }));
    fileInput.value = '';
    renderAll();
    await autoSaveToDrive();
  } catch (err) {
    showError(refs.processError, err.message);
  } finally {
    refs.processBtn.disabled = false;
    refs.processBtn.textContent = '上傳並自動整理（逐字稿＋摘要＋待辦）';
  }
});

document.getElementById('addTaskBtn').addEventListener('click', () => {
  const text = document.getElementById('taskInput').value.trim();
  const owner = document.getElementById('ownerInput').value.trim() || '未指派';
  const status = document.getElementById('statusInput').value;
  if (!text) return alert('請先輸入待辦內容');
  state.current.tasks.unshift({ id: Date.now(), text, owner, status });
  document.getElementById('taskInput').value = '';
  document.getElementById('ownerInput').value = '';
  document.getElementById('statusInput').value = 'todo';
  renderStats();
  renderTasks();
});

refs.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.current, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.current.title || 'meetflow'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

refs.transcriptSearch.addEventListener('input', renderTranscripts);

refs.meetingTitle.addEventListener('change', () => {
  state.current.title = refs.meetingTitle.value.trim() || '未命名會議';
});

refs.newMeetingBtn.addEventListener('click', () => {
  state.current = blankMeeting();
  renderAll();
});

function cycleTask(id) {
  const order = ['todo', 'progress', 'done'];
  state.current.tasks = state.current.tasks.map((t) => {
    if (t.id !== id) return t;
    return { ...t, status: order[(order.indexOf(t.status) + 1) % order.length] };
  });
  renderStats();
  renderTasks();
}

function removeTask(id) {
  state.current.tasks = state.current.tasks.filter((t) => t.id !== id);
  renderStats();
  renderTasks();
}

function addSuggestedTask(index) {
  const suggestion = state.current.suggestedTasks[index];
  if (!suggestion) return;
  state.current.tasks.unshift({ id: Date.now(), text: suggestion.text, owner: suggestion.owner, status: 'todo' });
  state.current.suggestedTasks = state.current.suggestedTasks.filter((_, i) => i !== index);
  renderStats();
  renderTasks();
  renderSummaries();
}

refs.signInBtn.addEventListener('click', async () => {
  if (state.signedIn) {
    signOut();
    state.signedIn = false;
    state.driveMeetings = [];
    renderAccount();
    renderMeetings();
    renderStats();
    return;
  }

  try {
    const token = await requestAccessToken();
    await ensureAppFolder(token);
    state.signedIn = true;
    renderAccount();
    await refreshDriveMeetings(token);
  } catch (err) {
    alert('Google 登入失敗：' + err.message);
  }
});

function openSettings() {
  refs.apiKeyInput.value = state.apiKey;
  refs.modelInput.value = state.model;
  refs.settingsModal.hidden = false;
}

function closeSettings() {
  refs.settingsModal.hidden = true;
}

refs.settingsBtn.addEventListener('click', openSettings);
refs.closeSettingsBtn.addEventListener('click', closeSettings);
refs.settingsModal.addEventListener('click', (e) => {
  if (e.target === refs.settingsModal) closeSettings();
});

refs.saveSettingsBtn.addEventListener('click', () => {
  state.apiKey = refs.apiKeyInput.value.trim();
  state.model = refs.modelInput.value.trim() || CONFIG.DEFAULT_GEMINI_MODEL;
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
  localStorage.setItem(STORAGE_KEYS.model, state.model);
  closeSettings();
});

renderAll();
