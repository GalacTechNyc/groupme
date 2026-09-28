import { createApi, AuthError } from './groupme.js';
import { GROUPME_CLIENT_ID, QUICK_REPLIES, POLL_CHAT_MS, POLL_LIST_MS } from './config.js';

const $ = (s) => document.querySelector(s);
const titleEl = $('#title');
const statusEl = $('#status');
const listEl = $('#list');
const chatEl = $('#chat');
const msgsEl = $('#msgs');
const compose = $('#compose');
const quickEl = $('#quick');
const hintEl = $('#hint');
const toastEl = $('#toast');
const tokenInput = $('#tokenInput');

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {}
  },
};

const state = {
  view: 'signin', // signin · chats · chat
  api: null,
  me: null,
  convs: [],
  rows: [],
  idx: 0,
  conv: null,
  messages: [],
  sel: -1, // selected message, or -1 when the reply bar is selected
  barIdx: 0, // 0 = Reply field, 1… = quick replies
  hasMore: false,
  loadingOlder: false,
  lastListAt: 0,
  seen: parseJSON(store.get('gm.seen')) || {}, // conversation key → time of the last message seen
};

function parseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- hint, toast, status ----------

let hintTimer;
function hint(text, isError = false) {
  hintEl.textContent = text;
  hintEl.classList.toggle('err', isError);
  clearTimeout(hintTimer);
  if (isError) hintTimer = setTimeout(updateHint, 4000);
}

function updateHint() {
  hintEl.classList.remove('err');
  if (state.view === 'chat') {
    if (state.sel < 0) {
      hintEl.textContent =
        state.barIdx === 0 ? 'Pinch to type or dictate a reply' : `Pinch to send “${QUICK_REPLIES[state.barIdx - 1]}”`;
    } else if (state.sel === 0 && state.hasMore) hintEl.textContent = 'Swipe ▲ for older messages';
    else hintEl.textContent = 'Pinch to ♥ like · swipe ▼ to reply';
  } else hintEl.textContent = state.rows[state.idx]?.hint || '';
}

let toastTimer;
function toast(html) {
  toastEl.innerHTML = html;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4500);
}

function setOnline(ok) {
  statusEl.textContent = ok ? '' : 'offline';
  statusEl.classList.toggle('bad', !ok);
}

function saveSeen() {
  store.set('gm.seen', JSON.stringify(state.seen));
}

// ---------- formatting ----------

function ago(sec) {
  const d = Date.now() / 1000 - sec;
  if (d < 60) return 'now';
  if (d < 3600) return Math.floor(d / 60) + 'm';
  if (d < 86400) return Math.floor(d / 3600) + 'h';
  const date = new Date(sec * 1000);
  if (d < 6 * 86400) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

const clock = (sec) => new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function initials(name) {
  // Letters only, so emoji in chat names don't turn into broken characters.
  const words = String(name || '').match(/\p{L}[\p{L}\p{N}'’]*/gu) || ['?'];
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

// GroupMe image URLs take a size suffix: .avatar (60px), .preview (~200px), .large
function avatar(url, name, cls = '') {
  const img = url && url.includes('i.groupme.com') ? `<img src="${esc(url)}.avatar" alt="">` : '';
  return `<div class="av ${cls}">${esc(initials(name))}${img}</div>`;
}

// ---------- chats list and sign-in ----------

function signinRows() {
  const rows = [
    {
      ico: '📱',
      title: 'Connect with a code',
      sub: 'Sign in on your phone: no typing on the glasses',
      hint: 'Pinch to get a code',
      run: startPairing,
    },
  ];
  if (GROUPME_CLIENT_ID)
    rows.push({
      ico: '→',
      title: 'Sign in on this device',
      sub: 'For a phone or computer',
      hint: 'Pinch to open GroupMe’s sign-in page',
      run: openSignIn,
    });
  rows.push({ ico: '▶', title: 'Try the demo', sub: 'Fake chats, no account needed', hint: 'Pinch to open the demo', run: () => (location.search = '?demo') });
  rows.push({ kind: 'input', hint: 'Or paste an access token from dev.groupme.com' });
  return rows;
}

function chatRows() {
  const rows = state.convs.map((c) => ({ kind: 'conv', conv: c, hint: 'Swipe ▲▼ to pick a chat · pinch to open' }));
  rows.push({ ico: '⎋', title: 'Sign out', sub: state.me ? `Signed in as ${state.me.name}` : '', hint: 'Pinch to sign out', run: () => signOut() });
  return rows;
}

// GroupMe's sign-in page is on another site. If the browser doesn't leave
// (the glasses don't allow it), point to the code instead.
function openSignIn() {
  let left = false;
  addEventListener('pagehide', () => (left = true), { once: true });
  location.href = `https://oauth.groupme.com/oauth/authorize?client_id=${encodeURIComponent(GROUPME_CLIENT_ID)}`;
  setTimeout(() => {
    if (!left && document.visibilityState === 'visible') hint('Can’t open sign-in here: use Connect with a code', true);
  }, 2500);
}

// ---------- phone pairing ----------
// The glasses get a 6-character code, you enter it at /connect on your phone and
// sign in to GroupMe there, and the glasses pick up the sign-in (see api/pair.js).

async function pairApi(method, query = '', body) {
  const res = await fetch('/api/pair' + query, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Pairing error ${res.status}`), { status: res.status });
  return data;
}

function pairRows() {
  return [
    { kind: 'code', hint: '' },
    { ico: '↻', title: 'New code', sub: '', hint: 'Pinch for a new code', run: startPairing },
    { ico: '←', title: 'Back', sub: '', hint: 'Pinch to go back', run: cancelPairing },
  ];
}

function showPairing(status) {
  state.view = 'pair';
  state.pairStatus = status;
  titleEl.textContent = 'Connect GroupMe';
  chatEl.hidden = true;
  listEl.hidden = false;
  state.rows = pairRows();
  state.idx = 0;
  renderList();
  histPush();
}

async function startPairing() {
  clearPairing();
  showPairing('Making a code…');
  try {
    state.pair = await pairApi('POST');
    store.set('gm.pair', JSON.stringify(state.pair));
    state.pairStatus = 'Waiting for your phone…';
    renderList();
    pollPairing();
  } catch (e) {
    state.pairStatus = `Couldn’t make a code: ${e.message}`;
    renderList();
  }
}

async function pollPairing() {
  clearTimeout(state.pairTimer);
  const pair = state.pair;
  if (!pair || state.view !== 'pair') return;
  if (Date.now() > pair.expiresAt) {
    clearPairing();
    state.pairStatus = 'Code expired: pinch New code';
    return renderList();
  }
  try {
    const q = `?code=${encodeURIComponent(pair.code)}&claim=${encodeURIComponent(pair.claimToken)}`;
    const data = await pairApi('GET', q);
    if (state.pair !== pair) return;
    if (data.ready && data.token) {
      clearPairing();
      store.set('gm.token', data.token);
      state.pairStatus = 'Connected!';
      renderList();
      return start(createApi(data.token));
    }
    renderList(); // refresh the countdown
  } catch (e) {
    if (e.status === 404 || e.status === 403) {
      clearPairing();
      state.pairStatus = 'Code expired: pinch New code';
      return renderList();
    }
  }
  state.pairTimer = setTimeout(pollPairing, 2200);
}

function clearPairing() {
  clearTimeout(state.pairTimer);
  state.pair = null;
  store.set('gm.pair', null);
}

function cancelPairing() {
  clearPairing();
  showSignin();
}

function pairHtml(sel) {
  const pair = state.pair;
  const host = pair ? new URL(pair.connectUrl).host + '/connect' : location.host + '/connect';
  const left = pair ? Math.max(0, Math.ceil((pair.expiresAt - Date.now()) / 60000)) : 0;
  return `<li class="row pair${sel}" data-i="0">
    <div class="pair-code">${esc(pair?.code || '······')}</div>
    <div class="pair-how">On your phone, go to <b>${esc(host)}</b> and enter this code</div>
    <div class="pair-status">${esc(state.pairStatus || '')}${pair ? ` · expires in ${left} min` : ''}</div></li>`;
}

function rowHtml(r, i) {
  const sel = i === state.idx ? ' sel' : '';
  if (r.kind === 'input') return `<li class="row input-row${sel}" data-i="${i}"></li>`;
  if (r.kind === 'code') return pairHtml(sel);
  if (r.kind === 'conv') {
    const c = r.conv;
    const who = c.previewName && c.previewName === state.me?.name ? 'You' : c.previewName;
    const preview = c.kind === 'group' && who ? `${who}: ${c.preview}` : c.preview;
    const unread = c.time > (state.seen[c.key] || 0) ? ' unread' : '';
    return `<li class="row${sel}${unread}" data-i="${i}">${avatar(c.image, c.name)}
      <div class="txt"><b>${esc(c.name)}</b><small>${esc(preview)}</small></div>
      <span class="when">${ago(c.time)}</span></li>`;
  }
  return `<li class="row${r.kind === 'info' ? ' info' : ''}${sel}" data-i="${i}"><span class="ico">${r.ico}</span>
    <div class="txt"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div></li>`;
}

function renderList() {
  state.idx = Math.max(0, Math.min(state.idx, state.rows.length - 1));
  listEl.innerHTML = state.rows.map(rowHtml).join('');
  const inputRow = listEl.querySelector('.input-row');
  if (inputRow) {
    inputRow.appendChild(tokenInput);
    tokenInput.hidden = false;
  }
  const sel = listEl.children[state.idx];
  sel?.scrollIntoView({ block: 'nearest' });
  if (state.rows[state.idx]?.kind === 'input') tokenInput.focus();
  else tokenInput.blur();
  updateHint();
}

function showSignin() {
  state.view = 'signin';
  titleEl.textContent = 'GroupMe';
  chatEl.hidden = true;
  listEl.hidden = false;
  state.rows = signinRows();
  state.idx = 0;
  renderList();
}

function showChats() {
  const key = state.rows[state.idx]?.conv?.key;
  state.view = 'chats';
  titleEl.textContent = 'GroupMe';
  chatEl.hidden = true;
  listEl.hidden = false;
  state.rows = chatRows();
  const i = key ? state.rows.findIndex((r) => r.conv?.key === key) : -1;
  state.idx = i >= 0 ? i : 0;
  renderList();
}

function listKey(e) {
  const r = state.rows[state.idx];
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      state.idx += e.key === 'ArrowDown' ? 1 : -1;
      renderList();
      return;
    case 'Enter':
      if (r?.kind === 'input') {
        if (tokenInput.value.trim()) useToken(tokenInput.value);
        return; // let the glasses open the text composer
      }
      e.preventDefault();
      if (r?.kind === 'conv') openChat(r.conv);
      else r?.run?.();
  }
}

tokenInput.addEventListener('change', () => {
  if (tokenInput.value.trim()) useToken(tokenInput.value);
});

function useToken(value) {
  const token = value.trim();
  tokenInput.value = '';
  if (!/^[A-Za-z0-9]{20,}$/.test(token)) return hint('That doesn’t look like a GroupMe token', true);
  store.set('gm.token', token);
  start(createApi(token));
}

function signOut(message) {
  store.set('gm.token', null);
  state.api = null;
  state.me = null;
  state.convs = [];
  clearTimeout(pollTimer);
  if (new URLSearchParams(location.search).has('demo')) return (location.search = '');
  showSignin();
  if (message) hint(message, true);
}

// ---------- conversation ----------

function openChat(conv) {
  state.view = 'chat';
  state.conv = conv;
  state.messages = [];
  state.sel = -1;
  state.barIdx = 0;
  state.hasMore = false;
  state.seen[conv.key] = conv.time;
  saveSeen();
  titleEl.textContent = conv.name;
  listEl.hidden = true;
  chatEl.hidden = false;
  tokenInput.blur();
  msgsEl.innerHTML = '<li class="more">Loading…</li>';
  renderBar();
  hintEl.textContent = '';
  histPush();
  refreshChat(true);
}

function closeChat() {
  if (state.view !== 'chat') return;
  compose.blur();
  state.conv = null;
  showChats();
  tick(); // pick up anything sent from the chat right away
}

// Merge freshly fetched messages in (new ones, updated likes, confirmed sends).
function merge(fresh, { prepend = false } = {}) {
  const selId = state.sel >= 0 ? state.messages[state.sel]?.id : null;
  const following = state.sel >= 0 && state.sel === state.messages.length - 1;
  const byId = new Map(state.messages.map((m, i) => [m.id, i]));
  const added = [];
  for (const m of fresh) {
    let i = byId.get(m.id);
    if (i == null && m.guid) i = state.messages.findIndex((x) => x.pending && x.guid === m.guid);
    if (i != null && i >= 0) state.messages[i] = m;
    else added.push(m);
  }
  state.messages = prepend ? [...added, ...state.messages] : [...state.messages, ...added];
  state.messages.sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.time - b.time || cmpId(a.id, b.id));
  if (following) state.sel = lastSelectable();
  else if (selId) state.sel = state.messages.findIndex((m) => m.id === selId);
  return added.length;
}

const cmpId = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
const lastSelectable = () => state.messages.length - 1;

async function refreshChat(first = false) {
  const conv = state.conv;
  if (!conv) return;
  const fresh = await state.api.messages(conv).catch((e) => {
    if (first) msgsEl.innerHTML = '<li class="more">Couldn’t load messages</li>';
    throw e;
  });
  if (state.conv !== conv) return;
  merge(fresh);
  if (first) {
    state.hasMore = fresh.length >= 20;
    state.sel = state.messages.length ? lastSelectable() : -1;
  }
  renderChat();
}

async function loadOlder() {
  const oldest = state.messages.find((m) => !m.pending);
  if (!state.hasMore || state.loadingOlder || !oldest) return;
  state.loadingOlder = true;
  const conv = state.conv;
  hint('Loading older messages…');
  try {
    const older = await state.api.messages(conv, oldest.id);
    if (state.conv !== conv) return;
    if (older.length < 20) state.hasMore = false;
    const n = merge(older, { prepend: true });
    state.sel = Math.max(0, n - 1);
    renderChat();
  } catch (e) {
    handleError(e);
  } finally {
    state.loadingOlder = false;
  }
}

function attHtml(m) {
  let out = '';
  for (const a of m.atts) {
    if (a.type === 'image' && a.url) out += `<img class="pic" src="${esc(a.url)}.preview" data-full="${esc(a.url)}" alt="">`;
    else if (a.type === 'video') out += a.preview_url ? `<img class="pic" src="${esc(a.preview_url)}" alt=""><div class="att">🎬 Video</div>` : '<div class="att">🎬 Video</div>';
    else if (a.type === 'location') out += `<div class="att">📍 ${esc(a.name || 'Location')}</div>`;
    else if (a.type === 'poll') out += '<div class="att">📊 Poll</div>';
    else if (a.type === 'file') out += '<div class="att">📎 File</div>';
    else if (a.type === 'reply') {
      const r = state.messages.find((x) => x.id === String(a.reply_id));
      out = `<div class="att">↪ ${r ? esc(`${r.name}: ${r.text}`.slice(0, 60)) : 'Reply'}</div>` + out;
    }
  }
  return out;
}

function msgHtml(m, i) {
  const sel = i === state.sel ? ' sel' : '';
  if (m.system) return `<li class="msg system${sel}">${esc(m.text)}</li>`;
  const mine = m.userId === state.me?.id;
  const liked = m.likes.includes(state.me?.id);
  const cls = `msg${mine ? ' mine' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}${sel}`;
  // GroupMe emoji arrive as U+FFFD placeholders in the text.
  const text = m.text.replace(/�/g, '').trim();
  const likes = m.likes.length ? `<span class="likes${liked ? ' mine' : ''}">♥ ${m.likes.length}</span>` : '';
  return `<li class="${cls}">${avatar(m.avatar, m.name, 'sm')}<div class="body">
    <div class="who">${esc(mine ? 'You' : m.name)}<time>${m.failed ? 'not sent' : m.pending ? 'sending…' : clock(m.time)}</time></div>
    ${text ? `<div class="text">${esc(text)}</div>` : ''}${attHtml(m)}</div>${likes}</li>`;
}

function renderChat() {
  const top = state.hasMore ? '▲ older messages' : state.messages.length ? 'Start of conversation' : 'No messages yet';
  msgsEl.innerHTML = `<li class="more">${top}</li>` + state.messages.map(msgHtml).join('');
  renderBar();
  scrollChat();
  updateHint();
}

function scrollChat() {
  if (state.sel < 0) msgsEl.scrollTop = msgsEl.scrollHeight;
  else if (state.sel === 0) msgsEl.scrollTop = 0;
  else msgsEl.children[state.sel + 1]?.scrollIntoView({ block: 'nearest' });
}

function renderBar() {
  if (!quickEl.children.length) quickEl.innerHTML = QUICK_REPLIES.map((q, i) => `<button data-q="${i}">${esc(q)}</button>`).join('');
  const inBar = state.view === 'chat' && state.sel < 0;
  compose.classList.toggle('sel', inBar && state.barIdx === 0);
  [...quickEl.children].forEach((b, i) => b.classList.toggle('sel', inBar && state.barIdx === i + 1));
  if (inBar && state.barIdx === 0) compose.focus();
  else compose.blur();
  quickEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function selectMessage(i) {
  state.sel = i;
  renderBar();
  msgsEl.querySelectorAll('.msg.sel').forEach((el) => el.classList.remove('sel'));
  msgsEl.children[i + 1]?.classList.add('sel');
  scrollChat();
  updateHint();
}

function selectBar(i) {
  state.sel = -1;
  state.barIdx = Math.max(0, Math.min(i, QUICK_REPLIES.length));
  msgsEl.querySelectorAll('.msg.sel').forEach((el) => el.classList.remove('sel'));
  renderBar();
  scrollChat();
  updateHint();
}

function chatKey(e) {
  const k = e.key;
  if (k === 'Escape' || (k === 'Backspace' && !(document.activeElement === compose && compose.value))) {
    e.preventDefault();
    return backLater(closeChat);
  }
  if (state.sel >= 0) {
    if (k === 'ArrowUp') {
      e.preventDefault();
      if (state.sel > 0) selectMessage(state.sel - 1);
      else loadOlder();
    } else if (k === 'ArrowDown' || k === 'ArrowRight') {
      e.preventDefault();
      if (k === 'ArrowDown' && state.sel < state.messages.length - 1) selectMessage(state.sel + 1);
      else selectBar(0);
    } else if (k === 'Enter') {
      e.preventDefault();
      toggleLike(state.messages[state.sel]);
    }
    return;
  }
  if (k === 'ArrowUp') {
    e.preventDefault();
    if (state.messages.length) selectMessage(lastSelectable());
  } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    selectBar(state.barIdx + (k === 'ArrowRight' ? 1 : -1));
  } else if (k === 'ArrowDown') e.preventDefault();
  else if (k === 'Enter') {
    if (state.barIdx === 0) {
      if (compose.value.trim()) {
        e.preventDefault();
        sendText(compose.value);
      }
      return; // empty: let the glasses open the text composer
    }
    e.preventDefault();
    sendText(QUICK_REPLIES[state.barIdx - 1]);
  }
}

compose.addEventListener('change', () => {
  if (compose.value.trim()) sendText(compose.value);
});

async function sendText(raw) {
  const text = raw.trim();
  compose.value = '';
  if (!text || !state.conv) return;
  const conv = state.conv;
  const guid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pending = {
    id: 'pending:' + guid,
    guid,
    name: state.me.name,
    avatar: null,
    text,
    time: Date.now() / 1000,
    userId: state.me.id,
    likes: [],
    atts: [],
    pending: true,
  };
  state.messages.push(pending);
  renderChat();
  try {
    const sent = await state.api.send(conv, text, guid);
    if (state.conv !== conv) return;
    if (sent) merge([sent]);
    state.seen[conv.key] = Math.max(state.seen[conv.key] || 0, sent?.time || 0);
    saveSeen();
  } catch (e) {
    pending.failed = true;
    handleError(e, 'Message not sent');
  }
  if (state.conv === conv) renderChat();
}

async function toggleLike(m) {
  if (!m || m.pending || m.system) return;
  const me = state.me.id;
  const on = !m.likes.includes(me);
  m.likes = on ? [...m.likes, me] : m.likes.filter((u) => u !== me);
  renderChat();
  try {
    await state.api.like(m, on);
    hint(on ? '♥ Liked' : 'Like removed');
    setTimeout(updateHint, 1500);
  } catch (e) {
    m.likes = on ? m.likes.filter((u) => u !== me) : [...m.likes, me];
    renderChat();
    handleError(e, 'Couldn’t like that');
  }
}

// ---------- refreshing ----------

async function refreshConvs() {
  const prev = new Map(state.convs.map((c) => [c.key, c]));
  const first = !state.lastListAt;
  state.convs = await state.api.conversations();
  state.lastListAt = Date.now();
  for (const c of state.convs) {
    if (!(c.key in state.seen)) state.seen[c.key] = c.time; // don't mark old chats unread on first run
    if (state.conv?.key === c.key) state.seen[c.key] = c.time;
    const p = prev.get(c.key);
    const fromMe = c.previewName === state.me.name;
    if (!first && p && c.time > p.time && !fromMe && state.conv?.key !== c.key) {
      const where = c.kind === 'group' ? ` · ${esc(c.name)}` : '';
      toast(`<b>${esc(c.previewName || c.name)}</b>${where}: ${esc(c.preview)}`);
    }
  }
  saveSeen();
  if (state.view === 'chats') {
    const key = state.rows[state.idx]?.conv?.key;
    state.rows = chatRows();
    const i = key ? state.rows.findIndex((r) => r.conv?.key === key) : -1;
    if (i >= 0) state.idx = i;
    renderList();
  }
}

let pollTimer;
function schedule() {
  clearTimeout(pollTimer);
  if (state.api) pollTimer = setTimeout(tick, state.view === 'chat' ? POLL_CHAT_MS : POLL_LIST_MS);
}

let ticking = false;
async function tick() {
  if (!state.api || ticking) return;
  ticking = true;
  try {
    if (state.view === 'chat') await refreshChat();
    if (state.view !== 'chat' || Date.now() - state.lastListAt >= POLL_LIST_MS) await refreshConvs();
    setOnline(true);
  } catch (e) {
    handleError(e);
  }
  ticking = false;
  schedule();
}

function handleError(e, message) {
  if (e instanceof AuthError) return signOut('Signed out: please sign in again');
  if (e instanceof TypeError) setOnline(false); // network failure
  hint(message || e.message || 'Something went wrong', true);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});

async function start(api) {
  state.api = api;
  state.lastListAt = 0;
  listEl.hidden = false;
  chatEl.hidden = true;
  listEl.innerHTML = '<li class="row info"><div class="txt"><small>Loading your chats…</small></div></li>';
  hintEl.textContent = '';
  try {
    state.me = await api.me();
    await refreshConvs();
    setOnline(true);
    state.idx = 0;
    showChats();
  } catch (e) {
    if (e instanceof AuthError) return signOut('That token didn’t work. Try again');
    setOnline(false);
    listEl.innerHTML = '<li class="row info"><div class="txt"><b>Can’t reach GroupMe</b><small>Retrying…</small></div></li>';
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => start(api), 5000);
    return;
  }
  schedule();
}

// ---------- back gesture ----------
// The glasses may deliver "back" as history navigation rather than Escape.
// While a chat is open the app keeps one spare history entry as a "back trap"
// and handles back itself.

let trapArmed = false;
let lastPopAt = -Infinity;

function histPush() {
  if (trapArmed) return;
  try {
    history.pushState({ gm: 'back-trap' }, '');
    trapArmed = true;
  } catch {}
}

window.addEventListener('popstate', () => {
  lastPopAt = performance.now();
  trapArmed = false;
  if (state.view === 'chat') closeChat();
  else if (state.view === 'pair') cancelPairing();
});

function backLater(fn) {
  const pressedAt = performance.now();
  setTimeout(() => {
    if (lastPopAt < pressedAt - 50) fn();
  }, 80);
}

// ---------- input ----------

document.addEventListener('keydown', (e) => {
  if (state.view === 'chat') return chatKey(e);
  if (state.view === 'pair' && (e.key === 'Escape' || e.key === 'Backspace')) {
    e.preventDefault();
    return backLater(cancelPairing);
  }
  // Keep the caret keys for editing while typing a token on a keyboard.
  if (document.activeElement === tokenInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Backspace')) return;
  listKey(e);
  // Escape at the top level is left alone so the glasses can close the app.
});

document.addEventListener('click', (e) => {
  const row = e.target.closest('#list .row');
  if (row && !e.target.closest('input')) {
    state.idx = +row.dataset.i;
    renderList();
    listKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    return;
  }
  const msg = e.target.closest('#msgs .msg');
  if (msg) {
    const i = [...msgsEl.children].indexOf(msg) - 1;
    if (i === state.sel) toggleLike(state.messages[i]);
    else selectMessage(i);
    return;
  }
  const q = e.target.closest('#quick button');
  if (q) return sendText(QUICK_REPLIES[+q.dataset.q]);
  if (e.target === compose) selectBar(0);
});

// Broken avatars fall back to initials; big image previews fall back to the original.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.full) {
      img.src = img.dataset.full;
      delete img.dataset.full;
    } else img.remove();
  },
  true,
);

// Images change the height of the chat as they load: stay pinned to the bottom.
msgsEl.addEventListener(
  'load',
  () => {
    if (state.sel < 0 || state.sel === state.messages.length - 1) scrollChat();
  },
  true,
);

// ---------- boot ----------

const params = new URLSearchParams(location.search);

// Back from GroupMe's sign-in, the token arrives as ?access_token=. Save it and
// clear it from the address bar. (#access_token= links from an older version work too.)
function tokenFromUrl() {
  const token = params.get('access_token') || new URLSearchParams(location.hash.slice(1)).get('access_token');
  if (!token) return null;
  store.set('gm.token', token);
  history.replaceState(null, '', location.pathname);
  return token;
}

async function boot() {
  const token = tokenFromUrl();
  if (params.has('demo')) {
    const { demoApi } = await import('./demo.js');
    return start(demoApi);
  }
  if (token && params.get('access_token')) {
    // If this phone came here to connect glasses (/connect), hand the sign-in over.
    try {
      const res = await pairApi('PUT', '', { token }).catch((e) => ({ error: e.message }));
      if (res.paired) return location.replace('/connect?paired=1');
      if (res.error) return location.replace(`/connect?auth_error=${encodeURIComponent(res.error)}`);
    } catch {}
  }
  if (store.get('gm.token')) return start(createApi(store.get('gm.token')));
  // Pick up a pairing that was waiting when the app was closed.
  const saved = parseJSON(store.get('gm.pair'));
  if (saved?.code && saved.expiresAt > Date.now()) {
    state.pair = saved;
    showPairing('Waiting for your phone…');
    return pollPairing();
  }
  showSignin();
}

boot();

window.gm = { state }; // handy for debugging in the console
