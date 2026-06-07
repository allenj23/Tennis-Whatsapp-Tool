const XLSX = require('xlsx');
const { normalizePhone, toChatId } = require('./phone');

// In-memory store — replaced on each successful upload or sync
let _contacts = [];
let _groups = [];

/**
 * Case-insensitive header lookup.
 * Tries each candidate name against the row's keys.
 */
function getField(row, candidates) {
  for (const key of Object.keys(row)) {
    if (candidates.includes(key.trim().toLowerCase())) {
      return String(row[key] ?? '').trim();
    }
  }
  return '';
}

/**
 * Convert an array of raw row objects (from any source — Excel, Google Sheets)
 * into a validated contact list.
 *
 * This is the shared normalization path used by both:
 *   - parseBuffer()       (Excel upload)
 *   - sheets.fetchRows()  (Google Sheets sync, Phase 1.2)
 *
 * @param {object[]} rows  Each row must have Name/Phone/Group keys (case-insensitive).
 * @returns {{ contacts: object[], groups: string[], skipped: object[] }}
 */
function buildContacts(rows) {
  const contacts = [];
  const skipped  = [];

  rows.forEach((row, idx) => {
    const name     = getField(row, ['name']);
    const rawPhone = getField(row, ['phone']);
    const group    = getField(row, ['group']) || 'Ungrouped';

    if (!name || !rawPhone) {
      skipped.push({ row: idx + 2, name, phone: rawPhone, reason: 'Missing name or phone' });
      return;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      skipped.push({ row: idx + 2, name, phone: rawPhone, reason: 'Invalid phone number' });
      return;
    }

    contacts.push({ name, phone, chatId: toChatId(phone), group });
  });

  const groups = [...new Set(contacts.map((c) => c.group))].sort();

  // Commit to the in-memory store
  _contacts = contacts;
  _groups   = groups;

  return { contacts, groups, skipped };
}

/**
 * Parse an Excel file buffer into a contact list.
 * Delegates row normalisation to buildContacts().
 *
 * @param {Buffer} buffer
 * @returns {{ contacts: object[], groups: string[], skipped: object[] }}
 */
function parseBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('The Excel file contains no sheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error('The sheet is empty.');
  }

  return buildContacts(rows);
}

function getContacts() { return _contacts; }
function getGroups()   { return _groups; }

module.exports = { buildContacts, parseBuffer, getContacts, getGroups };
