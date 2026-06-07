const socket = io();

// ── Security helper ───────────────────────────────────────────────────────────
/**
 * Escape a string for safe insertion into HTML.
 * Prevents XSS from user-controlled content (contact names, group names,
 * filenames, server error messages, etc.) that flows through innerHTML.
 */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

// ── Element refs ──────────────────────────────────────────────────────────────
const serverStatus     = document.getElementById('server-status');
const waStateWaiting   = document.getElementById('wa-state-waiting');
const waStateLoading   = document.getElementById('wa-state-loading');
const waStateReady     = document.getElementById('wa-state-ready');
const waStateError     = document.getElementById('wa-state-error');
const qrContainer      = document.getElementById('qr-container');
const waStatus         = document.getElementById('wa-status');
const waConnectedName  = document.getElementById('wa-connected-name');
const waErrorMsg       = document.getElementById('wa-error-msg');

const stepUpload       = document.getElementById('step-upload');
const sheetsPanel      = document.getElementById('sheets-panel');
const sheetsTitle      = document.getElementById('sheets-title');
const sheetsBadge      = document.getElementById('sheets-status-badge');
const sheetsLastSync   = document.getElementById('sheets-last-sync');
const btnSync          = document.getElementById('btn-sync');
const syncSummary      = document.getElementById('sync-summary');
const excelFile        = document.getElementById('excel-file');
const uploadSummary    = document.getElementById('upload-summary');

const stepRecipients   = document.getElementById('step-recipients');
const groupsList       = document.getElementById('groups-list');
const selectedCount    = document.getElementById('selected-count');
const btnSelectAll     = document.getElementById('btn-select-all');
const btnClearAll      = document.getElementById('btn-clear-all');
const recipientsFooter = document.getElementById('step-recipients-footer');
const btnToCompose     = document.getElementById('btn-to-compose');

const stepCompose      = document.getElementById('step-compose');
const messageText      = document.getElementById('message-text');
const mediaFile        = document.getElementById('media-file');
const mediaPreview     = document.getElementById('media-preview');
const btnSend          = document.getElementById('btn-send');
const btnSendCount     = document.getElementById('btn-send-count');
const composeCount     = document.getElementById('compose-recipient-count');

const stepStatus           = document.getElementById('step-status');
const sendOverallProgress  = document.getElementById('send-overall-progress');
const sendProgressFill     = document.getElementById('send-progress-fill');
const sendProgressLabel    = document.getElementById('send-progress-label');
const sendProgress         = document.getElementById('send-progress');
const sendSummary          = document.getElementById('send-summary');
const sendRetryFooter      = document.getElementById('send-retry-footer');
const btnRetryFailed       = document.getElementById('btn-retry-failed');

// ── App state ─────────────────────────────────────────────────────────────────
let allContacts     = [];
let allGroups       = [];
let selectedChatIds = new Set();
let failedChatIds   = [];

// ── Generic helpers ───────────────────────────────────────────────────────────
function showWaState(state) {
  waStateWaiting.classList.toggle('hidden', state !== 'waiting');
  waStateLoading.classList.toggle('hidden', state !== 'loading');
  waStateReady.classList.toggle('hidden',   state !== 'ready');
  waStateError.classList.toggle('hidden',   state !== 'error');
}

function unlockStep(el) { el.classList.remove('hidden'); }
function lockStep(el)   { el.classList.add('hidden'); }

// ── Server connection ─────────────────────────────────────────────────────────
socket.on('connect', () => {
  serverStatus.textContent = 'Server online';
  serverStatus.className = 'badge badge--online';
});

socket.on('disconnect', () => {
  serverStatus.textContent = 'Server offline';
  serverStatus.className = 'badge badge--offline';
});

socket.on('server:ready', ({ sheetsConfigured } = {}) => {
  showWaState('waiting');
  waStatus.textContent = 'Initializing WhatsApp...';
  if (sheetsConfigured) {
    sheetsPanel.classList.remove('hidden');
  }
});

// ── WhatsApp events ───────────────────────────────────────────────────────────
socket.on('wa:qr', (dataUrl) => {
  showWaState('waiting');
  waStatus.textContent = 'Scan the QR code with your phone.';
  // dataUrl is generated server-side by the qrcode library — not user input.
  // We still build this safely without string interpolation into other tags.
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'WhatsApp QR code';
  img.width = 220;
  img.height = 220;
  qrContainer.innerHTML = '';
  qrContainer.appendChild(img);
  lockStep(stepUpload);
});

socket.on('wa:authenticated', () => {
  showWaState('loading');
  qrContainer.innerHTML = '';
});

socket.on('wa:ready', ({ name, phone }) => {
  showWaState('ready');
  // textContent is inherently safe — no esc() needed here.
  waConnectedName.textContent = `${name} (+${phone})`;
  unlockStep(stepUpload);
});

socket.on('wa:auth_failure', (msg) => {
  showWaState('error');
  waErrorMsg.textContent = `Authentication failed: ${msg}`;
  qrContainer.innerHTML = '';
  lockStep(stepUpload);
});

socket.on('wa:disconnected', (reason) => {
  showWaState('error');
  waErrorMsg.textContent = `WhatsApp disconnected (${reason}).`;
  qrContainer.innerHTML = '';
  lockStep(stepUpload);
});

// ── Contacts sync (page reload) ───────────────────────────────────────────────
socket.on('contacts:loaded', ({ contacts, groups }) => {
  applyContacts(contacts, groups);
  renderGroupsList();
  unlockStep(stepRecipients);
});

// ── Excel upload ──────────────────────────────────────────────────────────────
excelFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadSummary.innerHTML = '<p class="status-text">Parsing file...</p>';
  lockStep(stepRecipients);
  lockStep(stepCompose);
  lockStep(stepStatus);
  selectedChatIds.clear();

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      // esc() the server error message before injecting into the DOM (R2).
      uploadSummary.innerHTML = `<p class="error-text">${esc(data.error)}</p>`;
      return;
    }

    applyContacts(data.contacts, data.groups);
    renderUploadSummary(data);
    renderGroupsList();

    if (data.contacts.length > 0) {
      unlockStep(stepRecipients);
    } else {
      uploadSummary.innerHTML += '<p class="warn-text">No valid contacts found. Check the file format.</p>';
    }
  } catch {
    uploadSummary.innerHTML = '<p class="error-text">Could not reach the server. Is it running?</p>';
  }
});

function applyContacts(contacts, groups) {
  allContacts = contacts;
  allGroups   = groups;
}

function renderUploadSummary({ contacts, groups, skipped }) {
  // esc() group names — they come from the Excel file (R2).
  const groupTags = groups.map((g) => `<span class="tag">${esc(g)}</span>`).join('');
  const skipNote  = skipped.length > 0
    ? `<p class="warn-text">${skipped.length} row(s) skipped — missing name, phone, or invalid number.</p>`
    : '';

  // contacts.length and groups.length are integers — safe without escaping.
  uploadSummary.innerHTML = `
    <div class="summary-box">
      <p><strong>${contacts.length}</strong> contact(s) loaded &nbsp;·&nbsp;
         <strong>${groups.length}</strong> group(s) found</p>
      <div class="tag-row">${groupTags}</div>
      ${skipNote}
    </div>`;
}

// ── Google Sheets manual sync ─────────────────────────────────────────────────

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  syncSummary.innerHTML = '';
  setSheetsStatus('syncing');

  try {
    const res  = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      syncSummary.innerHTML = `<p class="error-text">${esc(data.error || 'Sync failed.')}</p>`;
      setSheetsStatus('error', data.error || 'Sync failed.');
    }
    // Full result arrives via sync:status + contacts:loaded socket events
  } catch {
    syncSummary.innerHTML = '<p class="error-text">Could not reach the server. Is it running?</p>';
    setSheetsStatus('error', 'No connection');
  } finally {
    btnSync.disabled = false;
  }
});

socket.on('sync:status', ({ status, syncedAt, total, skipped, message, sheetTitle } = {}) => {
  setSheetsStatus(status, message, syncedAt, total, skipped, sheetTitle);
});

function setSheetsStatus(status, message, syncedAt, total, skipped, sheetTitleText) {
  if (sheetTitleText) {
    sheetsTitle.textContent = sheetTitleText;
  }

  if (status === 'syncing') {
    sheetsBadge.textContent    = 'Syncing…';
    sheetsBadge.className      = 'badge badge--sending';
    sheetsLastSync.textContent = '';
    return;
  }
  if (status === 'ok') {
    sheetsBadge.textContent = 'Synced ✓';
    sheetsBadge.className   = 'badge badge--sent';
    const time     = syncedAt ? new Date(syncedAt).toLocaleTimeString() : '';
    const skipNote = skipped > 0 ? ` · ${skipped} skipped` : '';
    sheetsLastSync.textContent = `Last sync: ${time} — ${total} contact(s)${skipNote}`;
    return;
  }
  if (status === 'error') {
    sheetsBadge.textContent    = 'Error';
    sheetsBadge.className      = 'badge badge--failed';
    sheetsLastSync.textContent = message ? `Error: ${message}` : '';
    return;
  }
}

// ── Recipient selection ───────────────────────────────────────────────────────

function renderGroupsList() {
  selectedChatIds.clear();
  groupsList.innerHTML = '';
  lockStep(recipientsFooter);

  allGroups.forEach((group) => {
    const members = allContacts.filter((c) => c.group === group);
    const groupId = `group-${CSS.escape(group)}`;

    const block = document.createElement('div');
    block.className = 'group-block';

    const header = document.createElement('div');
    header.className = 'group-header';
    // esc() group name in text position; CSS.escape used for id/data attrs (R2).
    header.innerHTML = `
      <label class="group-label">
        <input type="checkbox" class="group-checkbox"
               data-group="${esc(group)}" id="${groupId}" />
        <span class="group-name">${esc(group)}</span>
        <span class="group-badge">${members.length}</span>
      </label>
      <button class="btn-toggle" data-group="${esc(group)}" aria-expanded="false">Show</button>`;
    block.appendChild(header);

    const contactsDiv = document.createElement('div');
    contactsDiv.className = 'contacts-list hidden';
    contactsDiv.id = `contacts-${CSS.escape(group)}`;

    members.forEach((contact) => {
      const row = document.createElement('label');
      row.className = 'contact-row';
      // esc() contact name and phone; chatId is server-generated digits + @c.us (R2).
      row.innerHTML = `
        <input type="checkbox" class="contact-checkbox"
               data-chatid="${esc(contact.chatId)}"
               data-group="${esc(group)}" />
        <span class="contact-name">${esc(contact.name)}</span>
        <span class="contact-phone">+${esc(contact.phone)}</span>`;
      contactsDiv.appendChild(row);
    });

    block.appendChild(contactsDiv);
    groupsList.appendChild(block);

    header.querySelector('.btn-toggle').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      contactsDiv.classList.toggle('hidden', isExpanded);
      btn.setAttribute('aria-expanded', String(!isExpanded));
      btn.textContent = isExpanded ? 'Show' : 'Hide';
    });

    header.querySelector('.group-checkbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      contactsDiv.querySelectorAll('.contact-checkbox').forEach((cb) => {
        cb.checked = checked;
        checked ? selectedChatIds.add(cb.dataset.chatid) : selectedChatIds.delete(cb.dataset.chatid);
      });
      updateSelectionUI();
    });
  });

  groupsList.addEventListener('change', (e) => {
    if (!e.target.classList.contains('contact-checkbox')) return;
    const cb = e.target;
    cb.checked ? selectedChatIds.add(cb.dataset.chatid) : selectedChatIds.delete(cb.dataset.chatid);
    syncGroupCheckbox(cb.dataset.group);
    updateSelectionUI();
  });
}

function syncGroupCheckbox(group) {
  const groupCb   = groupsList.querySelector(`.group-checkbox[data-group="${group}"]`);
  const memberCbs = groupsList.querySelectorAll(`.contact-checkbox[data-group="${group}"]`);
  const total     = memberCbs.length;
  const checked   = [...memberCbs].filter((c) => c.checked).length;
  groupCb.checked       = checked === total;
  groupCb.indeterminate = checked > 0 && checked < total;
}

function updateSelectionUI() {
  const n = selectedChatIds.size;
  selectedCount.textContent = `${n} recipient${n !== 1 ? 's' : ''} selected`;
  n > 0 ? unlockStep(recipientsFooter) : lockStep(recipientsFooter);
}

btnSelectAll.addEventListener('click', () => {
  allContacts.forEach((c) => selectedChatIds.add(c.chatId));
  groupsList.querySelectorAll('.contact-checkbox').forEach((cb) => { cb.checked = true; });
  groupsList.querySelectorAll('.group-checkbox').forEach((cb) => {
    cb.checked = true;
    cb.indeterminate = false;
  });
  updateSelectionUI();
});

btnClearAll.addEventListener('click', () => {
  selectedChatIds.clear();
  groupsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
    cb.indeterminate = false;
  });
  updateSelectionUI();
});

btnToCompose.addEventListener('click', () => {
  unlockStep(stepCompose);
  updateComposeHeader();
  stepCompose.scrollIntoView({ behavior: 'smooth' });
});

// ── Compose ───────────────────────────────────────────────────────────────────

function updateComposeHeader() {
  const n = selectedChatIds.size;
  composeCount.textContent = `Sending to ${n} recipient${n !== 1 ? 's' : ''}`;
  btnSendCount.textContent = n;
  validateSendButton();
}

function validateSendButton() {
  const hasRecipients = selectedChatIds.size > 0;
  const hasContent    = messageText.value.trim().length > 0 || mediaFile.files.length > 0;
  btnSend.disabled    = !(hasRecipients && hasContent);
}

messageText.addEventListener('input', validateSendButton);

mediaFile.addEventListener('change', () => {
  mediaPreview.innerHTML = '';
  const file = mediaFile.files[0];
  if (!file) { validateSendButton(); return; }

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.alt = 'Preview';
      img.className = 'media-thumb';
      mediaPreview.appendChild(img);
    };
    reader.readAsDataURL(file);
  } else {
    // esc() the filename — user-chosen file names are untrusted (R2).
    mediaPreview.innerHTML = `<div class="file-attachment">📎 <span>${esc(file.name)}</span></div>`;
  }
  validateSendButton();
});

btnSend.addEventListener('click', async () => {
  if (btnSend.disabled) return;

  const chatIds = [...selectedChatIds];
  const message = messageText.value.trim();

  const formData = new FormData();
  formData.append('message', message);
  formData.append('chatIds', JSON.stringify(chatIds));
  if (mediaFile.files[0]) formData.append('media', mediaFile.files[0]);

  btnSend.disabled = true;
  sendSummary.innerHTML = '';
  lockStep(sendRetryFooter);
  failedChatIds = [];

  unlockStep(stepStatus);
  renderStatusShell(chatIds);
  stepStatus.scrollIntoView({ behavior: 'smooth' });

  try {
    const res = await fetch('/api/send', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // esc() server error message before injecting into DOM (R2).
      sendSummary.innerHTML = `<p class="error-text">${esc(data.error || 'Failed to start send.')}</p>`;
      btnSend.disabled = false;
    }
  } catch {
    sendSummary.innerHTML = '<p class="error-text">Could not reach the server. Is it running?</p>';
    btnSend.disabled = false;
  }
});

// ── Status view ───────────────────────────────────────────────────────────────

function renderStatusShell(chatIds) {
  sendSummary.innerHTML = '';
  sendProgressFill.style.width = '0%';
  sendProgressLabel.textContent = `0 / ${chatIds.length}`;
  unlockStep(sendOverallProgress);

  sendProgress.innerHTML = '';
  chatIds.forEach((chatId) => {
    const contact = allContacts.find((c) => c.chatId === chatId);
    const name    = contact ? contact.name : chatId;
    sendProgress.appendChild(makeStatusRow(chatId, name, 'pending'));
  });
}

function makeStatusRow(chatId, name, status, error) {
  const row = document.createElement('div');
  row.className = 'status-row';
  row.dataset.chatid = chatId;
  // esc() name — comes from Excel file (R2).
  row.innerHTML = `
    <span class="status-name">${esc(name)}</span>
    ${renderStatusBadge(status, error)}`;
  return row;
}

function renderStatusBadge(status, error) {
  // esc() the error message used as a tooltip title attribute (R2).
  const title = error ? ` title="${esc(error)}"` : '';
  if (status === 'pending') return `<span class="badge badge--pending">Pending</span>`;
  if (status === 'sending') return `<span class="badge badge--sending">Sending…</span>`;
  if (status === 'sent')    return `<span class="badge badge--sent">Sent ✓</span>`;
  if (status === 'failed')  return `<span class="badge badge--failed"${title}>Failed ✗</span>`;
  return '';
}

function updateStatusRow(chatId, status, error) {
  const row = sendProgress.querySelector(`.status-row[data-chatid="${chatId}"]`);
  if (!row) return;
  const badge = row.querySelector('.badge');
  const newBadge = renderStatusBadge(status, error);
  if (badge) badge.outerHTML = newBadge;
  else row.insertAdjacentHTML('beforeend', newBadge);
}

// ── Socket: live send progress ────────────────────────────────────────────────

socket.on('send:progress', ({ chatId, name, status, index, total, error }) => {
  updateStatusRow(chatId, status, error);

  if (status === 'sent' || status === 'failed') {
    if (status === 'failed') failedChatIds.push(chatId);
    const done = sendProgress.querySelectorAll('.badge--sent, .badge--failed').length;
    const pct  = Math.round((done / total) * 100);
    sendProgressFill.style.width = `${pct}%`;
    sendProgressLabel.textContent = `${done} / ${total}`;
  }
});

socket.on('send:done', ({ total, sent, failed }) => {
  sendProgressFill.style.width = '100%';
  sendProgressLabel.textContent = `${total} / ${total}`;

  const failNote = failed > 0
    ? ` &nbsp;·&nbsp; <span class="warn-text">${failed} failed</span>`
    : '';
  sendSummary.innerHTML = `
    <div class="summary-box">
      <p>Done &nbsp;·&nbsp; <strong>${sent}</strong> sent${failNote}</p>
    </div>`;

  if (failedChatIds.length > 0) unlockStep(sendRetryFooter);
  btnSend.disabled = false;
});

// ── Retry failed ──────────────────────────────────────────────────────────────

btnRetryFailed.addEventListener('click', () => {
  if (failedChatIds.length === 0) return;

  selectedChatIds = new Set(failedChatIds);
  failedChatIds   = [];

  groupsList.querySelectorAll('.contact-checkbox').forEach((cb) => {
    cb.checked = selectedChatIds.has(cb.dataset.chatid);
  });
  allGroups.forEach((g) => syncGroupCheckbox(g));
  updateSelectionUI();
  updateComposeHeader();

  lockStep(stepStatus);
  stepCompose.scrollIntoView({ behavior: 'smooth' });
});
