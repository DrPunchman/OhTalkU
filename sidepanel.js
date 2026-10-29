/** OhTalkU side panel: settings, visualizer, status and log. */

const $ = (id) => document.getElementById(id);
const EMOJIS = ['🤖','💬','💭','🎮','🎙️','💩','👽','🤬','🤓','👺','🦊','🐶','🐱','🐭','🐹','🐰','🐨','🐯','🦁','🐮','🐷','🐻','🐸','🦄','🗿','💀','🍻','🤘'];
const MAX_LEVEL = 0.1;      // top of the visualizer scale (matches slider max)
const HISTORY = 300;        // gate frames kept on screen (~10 s at 31 frames/s)

const state = { threshold: 0.02, emoji: '🤖', micOn: false, source: 'en' };
const levels = new Array(HISTORY).fill(0);
let port = null;

/* ---------- storage ---------- */
const save = (obj) => chrome.storage.local.set(obj);

/* ---------- visualizer ---------- */
const canvas = $('soundprint');
const g = canvas.getContext('2d');

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const barW = w / HISTORY;
  const tY = h - Math.min(state.threshold / MAX_LEVEL, 1) * h;
  const loud = css('--indigo'), quiet = css('--muted');
  for (let i = 0; i < HISTORY; i++) {
    const bh = Math.min(levels[i] / MAX_LEVEL, 1) * h;
    g.fillStyle = levels[i] >= state.threshold ? loud : quiet;
    g.globalAlpha = levels[i] >= state.threshold ? 1 : 0.45;
    g.fillRect(i * barW, h - bh, Math.max(barW - 0.5, 1), bh);
  }
  g.globalAlpha = 1;
  g.strokeStyle = css('--vermilion');
  g.lineWidth = 1.5;
  g.setLineDash([6, 4]);
  g.beginPath(); g.moveTo(0, tY); g.lineTo(w, tY); g.stroke();
  requestAnimationFrame(draw);
}

function connectLevels() {
  if (port) return;
  port = chrome.runtime.connect({ name: 'levels' });
  port.onMessage.addListener((m) => {
    if (m.type === 'model') return showModel(m);
    levels.push(m.rms); levels.shift();
  });
  port.onDisconnect.addListener(() => { port = null; });
}
function disconnectLevels() {
  if (port) port.disconnect();
  port = null;
  levels.fill(0);
}

/* ---------- threshold ---------- */
function setThreshold(v, persist = true) {
  state.threshold = Math.min(Math.max(v, 0.001), 0.1);
  $('threshold').value = state.threshold;
  $('threshold-out').textContent = state.threshold.toFixed(3);
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'threshold', value: state.threshold }).catch(() => {});
  if (persist) save({ noiseThreshold: state.threshold });
}
$('threshold').addEventListener('input', (e) => setThreshold(parseFloat(e.target.value)));

/* ---------- emoji ---------- */
function setEmoji(e) {
  state.emoji = e;
  $('emoji-current').textContent = e || '–';
  $('emoji-current').title = e ? 'Current prefix' : 'No prefix';
  save({ selectedEmoji: e });
}
const grid = $('emoji-grid');
for (const e of EMOJIS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', 'Use ' + e);
  b.addEventListener('click', () => { setEmoji(e); toggleGrid(false); });
  grid.appendChild(b);
}
function toggleGrid(open) {
  grid.hidden = !open;
  $('emoji-change').setAttribute('aria-expanded', String(open));
}
$('emoji-change').addEventListener('click', () => toggleGrid(grid.hidden));
$('emoji-clear').addEventListener('click', () => { setEmoji(''); toggleGrid(false); });

/* ---------- language pickers (flags need a custom listbox; <select> can't show images) ---------- */
function createPicker(root, labelId, items, value, onChange) {
  let current = items.find((i) => i.code === value) || items[0];
  let active = 0;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = labelId + '-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-labelledby', labelId + ' ' + btn.id);
  const list = document.createElement('ul');
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', labelId);
  list.tabIndex = -1; list.hidden = true;

  const flagImg = (it) => { const i = document.createElement('img'); i.className = 'flag'; i.src = it.flag; i.alt = ''; return i; };
  const lis = items.map((it, idx) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option'); li.id = labelId + '-opt-' + idx;
    li.append(flagImg(it), Object.assign(document.createElement('span'), { textContent: it.label }));
    li.addEventListener('click', () => { choose(it); setOpen(false); btn.focus(); });
    list.appendChild(li);
    return li;
  });

  function paintButton() {
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: current.label });
    const caret = Object.assign(document.createElement('span'), { className: 'caret', textContent: '▼' });
    caret.setAttribute('aria-hidden', 'true');
    btn.replaceChildren(flagImg(current), name, caret);
    lis.forEach((li, i) => li.setAttribute('aria-selected', String(items[i] === current)));
  }
  function highlight(i) {
    active = (i + items.length) % items.length;
    lis.forEach((li, k) => li.classList.toggle('active', k === active));
    list.setAttribute('aria-activedescendant', lis[active].id);
    lis[active].scrollIntoView({ block: 'nearest' });
  }
  function setOpen(o) {
    list.hidden = !o;
    btn.setAttribute('aria-expanded', String(o));
    if (o) { highlight(items.indexOf(current)); list.focus(); }
  }
  function choose(it) {
    const changed = it !== current;
    current = it; paintButton();
    if (changed) onChange(it.code);
  }

  btn.addEventListener('click', () => setOpen(list.hidden));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
  });
  list.addEventListener('keydown', (e) => {
    const keys = {
      ArrowDown: () => highlight(active + 1), ArrowUp: () => highlight(active - 1),
      Home: () => highlight(0), End: () => highlight(items.length - 1),
      Enter: () => { choose(items[active]); setOpen(false); btn.focus(); },
      ' ': () => { choose(items[active]); setOpen(false); btn.focus(); },
      Escape: () => { setOpen(false); btn.focus(); },
      Tab: () => setOpen(false)
    };
    if (keys[e.key]) { if (e.key !== 'Tab') e.preventDefault(); keys[e.key](); }
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) setOpen(false); });

  paintButton();
  root.append(btn, list);
}

function updateModelHint() {
  $('model-hint').hidden = !(state.source !== 'en' && $('model').value === 'Xenova/whisper-tiny');
}

/* ---------- show/hide sections ---------- */
function setupCollapse(toggleId, bodyId, key, open) {
  const btn = $(toggleId), body = $(bodyId);
  const apply = (o) => {
    body.hidden = !o;
    btn.textContent = o ? 'Hide' : 'Show';
    btn.setAttribute('aria-expanded', String(o));
  };
  apply(open);
  btn.addEventListener('click', () => {
    const o = body.hidden;
    apply(o);
    save({ [key]: o });
  });
}

/* ---------- chat target ---------- */
$('selector').addEventListener('change', (e) => { save({ customSelector: e.target.value.trim() }); pollTarget(); });
$('model').addEventListener('change', (e) => { save({ whisperModel: e.target.value }); updateModelHint(); });
$('auto-send').addEventListener('change', (e) => save({ autoSend: e.target.checked }));

function setTargetStatus(found, text) {
  $('chat-status').classList.toggle('connected', found);
  $('chat-status-text').textContent = text;
}

async function pollTarget() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return setTargetStatus(false, 'No active tab');
    const res = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { type: 'detect' }),
      new Promise((r) => setTimeout(() => r(null), 1000))
    ]);
    if (res && res.found) {
      setTargetStatus(true, 'Connected (' + res.platform + ')');
      if (!$('selector').value && document.activeElement !== $('selector')) {
        $('selector').placeholder = res.selector;
      }
    } else {
      setTargetStatus(false, 'No chat box found on this tab');
    }
  } catch {
    setTargetStatus(false, 'Open YouTube, Twitch or Niconico live chat');
  }
}
setInterval(pollTarget, 2000);
chrome.tabs.onActivated.addListener(pollTarget);

/* ---------- model status ---------- */
function showModel(m) {
  const status = $('model-status'), bar = $('model-progress');
  status.className = 'status';
  status.hidden = m.state === 'idle';
  bar.hidden = m.state !== 'loading';
  if (m.state === 'loading') {
    bar.value = m.progress || 0;
    $('model-status-text').textContent = m.progress
      ? 'Downloading speech model… ' + Math.round(m.progress * 100) + '% (first run only)'
      : 'Loading speech model…';
  } else if (m.state === 'ready') {
    status.classList.add('ready');
    $('model-status-text').textContent = 'Speech model ready (runs on this device)';
  } else if (m.state === 'error') {
    status.classList.add('failed');
    $('model-status-text').textContent = 'Speech model failed to load';
  }
}

/* ---------- log & errors ---------- */
function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

function addLog({ original, output, injected }) {
  const list = $('log');
  list.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const out = document.createElement('span');
  out.textContent = output;
  const orig = document.createElement('span');
  orig.className = 'orig'; orig.textContent = original;
  li.append(time, out, orig);
  if (!injected) {
    const w = document.createElement('span');
    w.className = 'warn'; w.textContent = 'Not posted: no chat box found.';
    li.append(w);
  }
  list.prepend(li);
  while (list.children.length > 50) list.lastChild.remove();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'log') addLog(msg);
  if (msg.type === 'status') {
    showError(msg.message);
    if (msg.level === 'fatal') setMic(false);
  }
});

/* ---------- mic ---------- */
function setMic(on) {
  state.micOn = on;
  $('mic').setAttribute('aria-pressed', String(on));
  $('mic').textContent = on ? 'Mic on: tap to stop' : 'Mic off: tap to start';
  if (!on) {
    disconnectLevels();
    chrome.runtime.sendMessage({ type: 'stop-mic' }).catch(() => {});
  }
}

$('mic').addEventListener('click', async () => {
  showError('');
  if (state.micOn) return setMic(false);
  try {
    // Prompts for permission on the extension origin; the offscreen doc inherits it.
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    return showError('Microphone access is needed. Allow it in the tab that just opened, then try again.');
  }
  const res = await chrome.runtime.sendMessage({ type: 'start-mic' });
  if (!res || !res.ok) return showError('Could not start the mic' + (res && res.error ? ': ' + res.error : '.'));
  setMic(true);
  connectLevels();
});

/* ---------- init ---------- */
(async function init() {
  const cfg = await chrome.storage.local.get({
    noiseThreshold: 0.02, selectedEmoji: '🤖', customSelector: '',
    sourceLanguage: 'en-US', autoSend: false, whisperModel: 'Xenova/whisper-tiny', micOn: false, targetLanguage: 'ja',
    emojiOpen: true, chatOpen: true
  });
  setThreshold(cfg.noiseThreshold, false);
  setEmoji(cfg.selectedEmoji);
  $('selector').value = cfg.customSelector;
  $('auto-send').checked = cfg.autoSend;
  $('model').value = cfg.whisperModel;
  const speakItems = LANGUAGES.filter((l) => l.speak);
  const source = speakItems.find((l) => l.code === String(cfg.sourceLanguage).split('-')[0]) ? String(cfg.sourceLanguage).split('-')[0] : 'en';
  const target = LANGUAGES.find((l) => l.code === cfg.targetLanguage) ? cfg.targetLanguage : 'ja';
  state.source = source;
  createPicker($('speak-picker'), 'speak-lbl', speakItems, source, (code) => {
    state.source = code;
    save({ sourceLanguage: code });
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'language', value: code }).catch(() => {});
    updateModelHint();
  });
  createPicker($('post-picker'), 'post-lbl', LANGUAGES, target, (code) => save({ targetLanguage: code }));
  updateModelHint();
  setupCollapse('emoji-toggle', 'emoji-body', 'emojiOpen', cfg.emojiOpen);
  setupCollapse('chat-toggle', 'chat-body', 'chatOpen', cfg.chatOpen);
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (cfg.micOn && ctxs.length) { setMic(true); connectLevels(); } else { setMic(false); }
  pollTarget();
  requestAnimationFrame(draw);
})();
