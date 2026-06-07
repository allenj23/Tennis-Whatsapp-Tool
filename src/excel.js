const XLSX = require('xlsx');
const { normalizePhone, toChatId } = require('./phone');

// In-memory store — replaced on each successful upload or sync
let _contacts = [];
let _groups = [];

// ── Column alias configuration ────────────────────────────────────────────────
// Extend these arrays to support additional header names without changing logic.
// All values are lowercased; getField() lowercases sheet keys before comparing.

const NAME_HEADERS  = ['name', 'שם הלקוח', 'שם הילד', 'שם'];
const GROUP_HEADERS = ['group', 'שם קבוצה', 'שם הקבוצה'];

/**
 * Phone column definitions.
 * Order determines role priority and labeling.
 * Each entry: { headers: string[], label: string }
 *   label  — Hebrew role shown in the UI (שחקן / אמא / אבא).
 *            Empty string means single generic phone (no role suffix).
 */
const PHONE_COLUMNS = [
  { headers: ['טלפון שחקן'],                    label: 'שחקן' },
  { headers: ['טלפון אמא'],                     label: 'אמא'  },
  { headers: ['טלפון אבא'],                     label: 'אבא'  },
  { headers: ['phone', 'טלפון', 'טלפון נייד'], label: ''     }, // generic
];

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip bidi/zero-width marks and NBSP, collapse whitespace, lowercase.
 * Applied to both sheet keys and candidate aliases so Hebrew headers
 * survive copy-paste and Google Sheets' invisible RTL marks.
 */
function normalizeKey(s) {
  return String(s ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u00a0\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Case-insensitive, bidi-safe header lookup.
 * Tries each candidate name against the row's keys.
 */
function getField(row, candidates) {
  const normCandidates = candidates.map(normalizeKey);
  for (const key of Object.keys(row)) {
    if (normCandidates.includes(normalizeKey(key))) {
      return String(row[key] ?? '').trim();
    }
  }
  return '';
}

// ── buildContacts ─────────────────────────────────────────────────────────────

/**
 * Convert an array of raw row objects (from any source — Excel, Google Sheets)
 * into a validated contact list.
 *
 * Each spreadsheet row can have multiple phone columns (mother / father / player).
 * Each non-empty, valid phone becomes its own contact entry tagged with:
 *   - client     : the original client name (שם הלקוח)
 *   - clientId   : a stable per-row ID so all phones from the same row are grouped
 *   - role       : Hebrew role label (שחקן / אמא / אבא / '' for generic)
 *   - name       : display name = client + role suffix (e.g. "דנה כהן – אמא")
 *
 * The contact shape is additive: name/phone/chatId/group are unchanged so the
 * sender, status view, retry, reconciliation and dedupe/merge code need no edits.
 *
 * @param {object[]} rows
 * @param {{ dedupe?: boolean }} [opts]
 *   dedupe — skip contacts whose chatId was already added (first occurrence wins).
 *            Used when merging rows from multiple tabs. Default: false.
 * @returns {{ contacts: object[], groups: string[], skipped: object[] }}
 */
function buildContacts(rows, { dedupe = false } = {}) {
  const contacts = [];
  const skipped  = [];
  const seenIds  = new Set(); // cross-row dedupe (used only when dedupe=true)

  rows.forEach((row, idx) => {
    const client = getField(row, NAME_HEADERS);
    const group  = getField(row, GROUP_HEADERS) || 'Ungrouped';

    if (!client) {
      skipped.push({ row: idx + 2, name: '', phone: '', reason: 'Missing name' });
      return;
    }

    // Stable per-row identifier so all phones from this row share the same clientId
    const clientId = `r${idx}`;

    // Within-row dedup: avoid adding the same phone number twice from the same row
    // (e.g. mother and father happen to share a number)
    const rowSeen = new Set();

    let rowHasValidPhone = false;
    let rowHasAnyPhone   = false;

    for (const col of PHONE_COLUMNS) {
      const raw = getField(row, col.headers);
      if (!raw) continue;
      rowHasAnyPhone = true;

      const phone = normalizePhone(raw);
      if (!phone) {
        // Invalid number — note it but keep going; another column may still succeed
        continue;
      }

      const chatId = toChatId(phone);

      // Within-row dedupe
      if (rowSeen.has(chatId)) continue;
      rowSeen.add(chatId);

      // Cross-row dedupe (merged-tab mode)
      if (dedupe && seenIds.has(chatId)) continue;
      seenIds.add(chatId);

      rowHasValidPhone = true;

      const displayName = col.label ? `${client} – ${col.label}` : client;

      contacts.push({
        name:     displayName,
        phone,
        chatId,
        group,
        client,   // original name without role suffix
        clientId, // groups all phones from the same row
        role:     col.label,
      });
    }

    // Skip the entire row only for genuine data-quality problems,
    // not for phones dropped purely by cross-row dedupe.
    if (!rowHasAnyPhone) {
      skipped.push({ row: idx + 2, name: client, phone: '', reason: 'Missing phone' });
    } else if (!rowHasValidPhone && !contacts.some((c) => c.clientId === clientId)) {
      skipped.push({ row: idx + 2, name: client, phone: '', reason: 'Invalid phone number' });
    }
  });

  const groups = [...new Set(contacts.map((c) => c.group))].sort();

  _contacts = contacts;
  _groups   = groups;

  return { contacts, groups, skipped };
}

// ── parseBuffer ───────────────────────────────────────────────────────────────

/**
 * Parse an Excel file buffer into a contact list.
 * Delegates row normalisation to buildContacts().
 *
 * @param {Buffer} buffer
 * @returns {{ contacts: object[], groups: string[], skipped: object[] }}
 */
function parseBuffer(buffer) {
  const workbook  = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) throw new Error('The Excel file contains no sheets.');

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) throw new Error('The sheet is empty.');

  return buildContacts(rows);
}

function getContacts() { return _contacts; }
function getGroups()   { return _groups; }

/**
 * Restore the in-memory store directly from a pre-built list.
 * Used by the disk cache on startup.
 */
function setContacts(contacts, groups) {
  _contacts = contacts;
  _groups   = groups;
}

module.exports = { buildContacts, parseBuffer, getContacts, getGroups, setContacts };
