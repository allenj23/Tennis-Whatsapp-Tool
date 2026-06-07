const socket = io();

// ── Element refs ──────────────────────────────────────────────────────────────
const serverStatus    = document.getElementById('server-status');
const waStateWaiting  = document.getElementById('wa-state-waiting');
const waStateLoading  = document.getElementById('wa-state-loading');
const waStateReady    = document.getElementById('wa-state-ready');
const qrContainer     = document.getElementById('qr-container');
const waStatus        = document.getElementById('wa-status');
const waConnectedName = document.getElementById('wa-connected-name');

const stepUpload      = document.getElementById('step-upload');
const excelFile       = document.getElementById('excel-file');
const uploadSummary   = document.getElementById('upload-summary');

const stepRecipients  = document.getElementById('step-recipients');

// ── App state ─────────────────────────────────────────────────────────────────
let allContacts = [];   // [{name, phone, chatId, group}]
let allGroups   = [];   // [string]

// ── Helpers ───────────────────────────────────────────────────────────────────
function showWaState(state) {
  waStateWaiting.classList.toggle('hidden', state !== 'waiting');
  waStateLoading.classList.toggle('hidden', state !== 'loading');
  waStateReady.classList.toggle('hidden',   state !== 'ready');
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

socket.on('server:ready', () => {
  showWaState('waiting');
  waStatus.textContent = 'Initializing WhatsApp...';
});

// ── WhatsApp events ───────────────────────────────────────────────────────────
socket.on('wa:qr', (dataUrl) => {
  showWaState('waiting');
  waStatus.textContent = 'Scan the QR code with your phone.';
  qrContainer.innerHTML = `<img src="${dataUrl}" alt="WhatsApp QR code" width="220" height="220" />`;
  lockStep(stepUpload);
});

socket.on('wa:authenticated', () => {
  showWaState('loading');
  qrContainer.innerHTML = '';
});

socket.on('wa:ready', ({ name, phone }) => {
  showWaState('ready');
  waConnectedName.textContent = `${name} (+${phone})`;
  unlockStep(stepUpload);
});

socket.on('wa:auth_failure', (msg) => {
  showWaState('waiting');
  waStatus.textContent = `Authentication failed: ${msg}. Reload the page to try again.`;
  qrContainer.innerHTML = '';
  lockStep(stepUpload);
});

socket.on('wa:disconnected', (reason) => {
  showWaState('waiting');
  waStatus.textContent = `Disconnected (${reason}). Reload the page to reconnect.`;
  qrContainer.innerHTML = '';
  lockStep(stepUpload);
});

// ── Contacts sync (page reload while contacts already loaded on server) ────────
socket.on('contacts:loaded', ({ contacts, groups }) => {
  applyContacts(contacts, groups);
});

// ── Excel upload ──────────────────────────────────────────────────────────────
excelFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadSummary.innerHTML = '<p class="status-text">Parsing file...</p>';
  lockStep(stepRecipients);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      uploadSummary.innerHTML = `<p class="error-text">${data.error}</p>`;
      return;
    }

    applyContacts(data.contacts, data.groups);
    renderUploadSummary(data);

    if (data.contacts.length > 0) {
      unlockStep(stepRecipients);
    }
  } catch {
    uploadSummary.innerHTML = '<p class="error-text">Upload failed. Please try again.</p>';
  }
});

function applyContacts(contacts, groups) {
  allContacts = contacts;
  allGroups = groups;
}

function renderUploadSummary({ contacts, groups, skipped }) {
  const groupTags = groups.map((g) => `<span class="tag">${g}</span>`).join('');
  const skipNote = skipped.length > 0
    ? `<p class="warn-text">${skipped.length} row(s) skipped — missing or invalid data.</p>`
    : '';

  uploadSummary.innerHTML = `
    <div class="summary-box">
      <p><strong>${contacts.length}</strong> contact(s) loaded &nbsp;·&nbsp;
         <strong>${groups.length}</strong> group(s) found</p>
      <div class="tag-row">${groupTags}</div>
      ${skipNote}
    </div>`;
}
