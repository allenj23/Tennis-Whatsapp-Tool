const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseBuffer, buildContacts } = require('../src/excel');
const { makeContactsXlsx, makeXlsxBuffer } = require('./helpers/fixtures');

// ── buildContacts() — unit tests (used by both Excel upload and Sheets sync) ──
describe('buildContacts — shared normalization pipeline', () => {
  test('valid rows produce correct contacts and groups', () => {
    const { contacts, groups, skipped } = buildContacts([
      { Name: 'Alice', Phone: '0501111111', Group: 'Members' },
      { Name: 'Bob',   Phone: '0502222222', Group: 'Staff' },
    ]);
    assert.equal(contacts.length, 2);
    assert.equal(skipped.length, 0);
    assert.deepEqual(groups, ['Members', 'Staff']);
    assert.equal(contacts[0].chatId, '972501111111@c.us');
  });

  test('empty Group falls back to Ungrouped', () => {
    const { contacts } = buildContacts([{ Name: 'A', Phone: '0501234567', Group: '' }]);
    assert.equal(contacts[0].group, 'Ungrouped');
  });

  test('missing name is skipped', () => {
    const { contacts, skipped } = buildContacts([{ Name: '', Phone: '0501234567', Group: 'X' }]);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
  });

  test('invalid phone is skipped', () => {
    const { skipped } = buildContacts([{ Name: 'Bob', Phone: 'N/A', Group: 'X' }]);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Invalid phone number/);
  });

  test('empty row array returns empty result without throwing', () => {
    // This path is guarded upstream (parseBuffer throws on empty), but
    // Google Sheets may return an empty sheet legitimately.
    const { contacts, groups, skipped } = buildContacts([]);
    assert.equal(contacts.length, 0);
    assert.equal(groups.length, 0);
    assert.equal(skipped.length, 0);
  });
});

// ── buildContacts dedupe option (used when merging multiple tabs) ──────────────
describe('buildContacts — dedupe option (multi-tab merge)', () => {
  const kidsRows = [
    { Name: 'Alice', Phone: '0501111111', Group: 'Kids' },
    { Name: 'Bob',   Phone: '0502222222', Group: 'Kids' },
  ];
  const adultsRows = [
    { Name: 'Alice', Phone: '0501111111', Group: 'Adults' }, // duplicate phone
    { Name: 'Carol', Phone: '0503333333', Group: 'Adults' },
  ];
  const merged = [...kidsRows, ...adultsRows];

  test('without dedupe: duplicate chatIds are kept (default behaviour)', () => {
    const { contacts } = buildContacts(merged);
    assert.equal(contacts.length, 4); // Alice appears twice
    assert.equal(contacts.filter((c) => c.phone === '972501111111').length, 2);
  });

  test('with dedupe:true: duplicate chatIds are collapsed — first occurrence wins', () => {
    const { contacts } = buildContacts(merged, { dedupe: true });
    assert.equal(contacts.length, 3); // Alice, Bob, Carol
    const alice = contacts.find((c) => c.name === 'Alice');
    assert.equal(alice.group, 'Kids'); // first tab wins
  });

  test('with dedupe:true: groups reflect only the kept contacts', () => {
    const { groups } = buildContacts(merged, { dedupe: true });
    // Alice kept as Kids, Bob as Kids, Carol as Adults
    assert.deepEqual(groups, ['Adults', 'Kids']);
  });

  test('dedupe:true on rows with no duplicates behaves identically to default', () => {
    const { contacts } = buildContacts(kidsRows, { dedupe: true });
    assert.equal(contacts.length, 2);
  });
});

describe('excel.parseBuffer — happy path (expected PASS)', () => {
  test('parses valid rows into contacts with chatIds', () => {
    const buf = makeContactsXlsx([
      ['Alice', '0501111111', 'Members'],
      ['Bob', '0502222222', 'Members'],
      ['Carol', '0503333333', 'Staff'],
    ]);
    const { contacts, groups, skipped } = parseBuffer(buf);

    assert.equal(contacts.length, 3);
    assert.equal(skipped.length, 0);
    assert.deepEqual(groups, ['Members', 'Staff']); // sorted, deduped
    assert.equal(contacts[0].chatId, '972501111111@c.us');
  });

  test('groups are sorted and de-duplicated', () => {
    const buf = makeContactsXlsx([
      ['A', '0500000001', 'Zebra'],
      ['B', '0500000002', 'Alpha'],
      ['C', '0500000003', 'Alpha'],
    ]);
    const { groups } = parseBuffer(buf);
    assert.deepEqual(groups, ['Alpha', 'Zebra']);
  });

  test('empty Group cell falls back to "Ungrouped"', () => {
    const buf = makeContactsXlsx([['A', '0500000001', '']]);
    const { contacts, groups } = parseBuffer(buf);
    assert.equal(contacts[0].group, 'Ungrouped');
    assert.deepEqual(groups, ['Ungrouped']);
  });
});

describe('excel.parseBuffer — header handling (expected PASS)', () => {
  test('headers are case-insensitive and whitespace-tolerant', () => {
    const buf = makeXlsxBuffer([
      [' NAME ', 'phone', 'GrOuP'],
      ['Dave', '0504444444', 'VIP'],
    ]);
    const { contacts } = parseBuffer(buf);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, 'Dave');
    assert.equal(contacts[0].group, 'VIP');
  });

  test('extra/unknown columns are ignored', () => {
    const buf = makeXlsxBuffer([
      ['Name', 'Phone', 'Group', 'Email', 'Notes'],
      ['Eve', '0505555555', 'Members', 'eve@x.com', 'hello'],
    ]);
    const { contacts } = parseBuffer(buf);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, 'Eve');
  });

  test('phone stored as a numeric cell is coerced to string', () => {
    const buf = makeXlsxBuffer([
      ['Name', 'Phone', 'Group'],
      ['Num', 972509999999, 'Members'], // numeric, not string
    ]);
    const { contacts, skipped } = parseBuffer(buf);
    assert.equal(skipped.length, 0);
    assert.equal(contacts[0].chatId, '972509999999@c.us');
  });
});

describe('excel.parseBuffer — invalid rows are skipped (expected PASS)', () => {
  test('missing name is skipped with reason', () => {
    const buf = makeContactsXlsx([['', '0501234567', 'Members']]);
    const { contacts, skipped } = parseBuffer(buf);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Missing name/);
  });

  test('missing phone is skipped', () => {
    const buf = makeContactsXlsx([['NoPhone', '', 'Members']]);
    const { contacts, skipped } = parseBuffer(buf);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
  });

  test('whitespace-only name is treated as empty and skipped', () => {
    const buf = makeContactsXlsx([['   ', '0501234567', 'Members']]);
    const { skipped } = parseBuffer(buf);
    assert.equal(skipped.length, 1);
  });

  test('phone with no digits is skipped as invalid', () => {
    const buf = makeContactsXlsx([['Junk', 'N/A', 'Members']]);
    const { contacts, skipped } = parseBuffer(buf);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Invalid phone number/);
  });

  test('valid + invalid mixed: keeps valid, reports skipped row number', () => {
    const buf = makeContactsXlsx([
      ['Good', '0501234567', 'Members'], // row 2
      ['', '0500000000', 'Members'],      // row 3 skipped
      ['Also Good', '0507654321', 'Staff'], // row 4
    ]);
    const { contacts, skipped } = parseBuffer(buf);
    assert.equal(contacts.length, 2);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].row, 3);
  });
});

describe('excel.parseBuffer — structural failures (expected PASS)', () => {
  test('empty sheet (header only, no rows) throws', () => {
    const buf = makeXlsxBuffer([['Name', 'Phone', 'Group']]);
    assert.throws(() => parseBuffer(buf), /empty/i);
  });

  // Note: the `!sheetName` guard in parseBuffer is defensive only — SheetJS
  // cannot write (nor would an upload contain) a zero-sheet workbook, so that
  // path is intentionally not exercised here.

  test('completely non-xlsx garbage buffer throws (not silently accepted)', () => {
    const garbage = Buffer.from('this is not a spreadsheet at all');
    assert.throws(() => parseBuffer(garbage));
  });
});

// ── Hebrew columns + multi-phone expansion ────────────────────────────────────
describe('buildContacts — Hebrew column names', () => {
  test('שם הלקוח and שם קבוצה are recognised as name and group', () => {
    const rows = [{ 'שם הלקוח': 'דנה כהן', 'טלפון שחקן': '0501111111', 'שם קבוצה': 'ג׳וניורים' }];
    const { contacts, groups } = buildContacts(rows);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].client, 'דנה כהן');
    assert.equal(contacts[0].group,  'ג׳וניורים');
    assert.deepEqual(groups, ['ג׳וניורים']);
  });

  test('multi-phone row expands into one contact per non-empty phone column', () => {
    const rows = [{
      'שם הלקוח': 'דנה כהן',
      'טלפון שחקן': '0501111111',
      'טלפון אמא':  '0502222222',
      'טלפון אבא':  '0503333333',
      'שם קבוצה':   'ג׳וניורים',
    }];
    const { contacts } = buildContacts(rows);
    assert.equal(contacts.length, 3);
    const roles = contacts.map((c) => c.role);
    assert.deepEqual(roles, ['שחקן', 'אמא', 'אבא']);
  });

  test('display name is "client – role" for named roles', () => {
    const rows = [{
      'שם הלקוח': 'דנה כהן',
      'טלפון אמא': '0502222222',
      'שם קבוצה':  'ג׳וניורים',
    }];
    const { contacts } = buildContacts(rows);
    assert.equal(contacts[0].name, 'דנה כהן – אמא');
  });

  test('generic phone column produces contact with client name as-is (no role suffix)', () => {
    const rows = [{ 'שם הלקוח': 'ישראל ישראלי', 'טלפון': '0504444444', 'שם קבוצה': 'כדורגל' }];
    const { contacts } = buildContacts(rows);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].name, 'ישראל ישראלי');
    assert.equal(contacts[0].role, '');
  });

  test('all contacts from a row share the same clientId', () => {
    const rows = [{
      'שם הלקוח': 'ביאטריס לוי',
      'טלפון שחקן': '0501111111',
      'טלפון אמא':  '0502222222',
      'שם קבוצה':   'מחזור א׳',
    }];
    const { contacts } = buildContacts(rows);
    const ids = [...new Set(contacts.map((c) => c.clientId))];
    assert.equal(ids.length, 1, 'all phones from a row share one clientId');
  });

  test('within-row dedupe: identical phone in two columns is added only once', () => {
    const rows = [{
      'שם הלקוח': 'דוד דוד',
      'טלפון שחקן': '0501111111',
      'טלפון אמא':  '0501111111', // same number as player
      'שם קבוצה':   'ותיקים',
    }];
    const { contacts, skipped } = buildContacts(rows);
    assert.equal(contacts.length, 1, 'duplicate phone within row collapsed to 1');
    assert.equal(skipped.length, 0, 'within-row dedupe is not reported as a skip');
  });

  test('row with no phone columns at all is skipped with "Missing phone"', () => {
    const rows = [{ 'שם הלקוח': 'ללא טלפון', 'שם קבוצה': 'ותיקים' }];
    const { contacts, skipped } = buildContacts(rows);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Missing phone/);
  });

  test('missing name column is skipped with "Missing name"', () => {
    const rows = [{ 'טלפון שחקן': '0501111111', 'שם קבוצה': 'ותיקים' }];
    const { contacts, skipped } = buildContacts(rows);
    assert.equal(contacts.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Missing name/);
  });

  test('group falls back to Ungrouped when שם קבוצה is absent', () => {
    const rows = [{ 'שם הלקוח': 'משה', 'טלפון שחקן': '0501111111' }];
    const { contacts } = buildContacts(rows);
    assert.equal(contacts[0].group, 'Ungrouped');
  });

  test('multiple clients in different teams are grouped correctly', () => {
    const rows = [
      { 'שם הלקוח': 'אלה',  'טלפון שחקן': '0501111111', 'שם קבוצה': 'ג׳וניורים' },
      { 'שם הלקוח': 'בר',   'טלפון שחקן': '0502222222', 'שם קבוצה': 'ותיקים'   },
      { 'שם הלקוח': 'גל',   'טלפון שחקן': '0503333333', 'שם קבוצה': 'ג׳וניורים' },
    ];
    const { contacts, groups } = buildContacts(rows);
    assert.equal(contacts.length, 3);
    assert.deepEqual(groups, ['ג׳וניורים', 'ותיקים']);
    assert.equal(contacts.filter((c) => c.group === 'ג׳וניורים').length, 2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DATA-QUALITY OBSERVATIONS — document risky-but-current behaviour.
// These PASS (they assert what the code actually does today) and exist to make
// the behaviour explicit and regression-locked. Commentary flags the risk.
// ───────────────────────────────────────────────────────────────────────────
describe('excel.parseBuffer — data-quality observations (expected PASS)', () => {
  test('duplicate phone numbers produce duplicate contacts (no dedupe at parse)', () => {
    const buf = makeContactsXlsx([
      ['Alice', '0501234567', 'Members'],
      ['Alice Again', '0501234567', 'Staff'], // same number, different name+group
    ]);
    const { contacts } = parseBuffer(buf);
    // RISK: two contacts share one chatId. Dedupe only happens later in the UI Set.
    assert.equal(contacts.length, 2);
    assert.equal(contacts[0].chatId, contacts[1].chatId);
  });

  test('contact name is NOT sanitized — raw HTML flows through to the UI layer', () => {
    const buf = makeContactsXlsx([
      ['<img src=x onerror=alert(1)>', '0501234567', 'Members'],
    ]);
    const { contacts } = parseBuffer(buf);
    // RISK: app.js renders name via innerHTML -> stored XSS from a hostile sheet.
    assert.equal(contacts[0].name, '<img src=x onerror=alert(1)>');
  });

  test('only the FIRST worksheet is read; later sheets are ignored', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Phone', 'Group']]), 'First');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Name', 'Phone', 'Group'], ['Hidden', '0501234567', 'X']]),
      'Second'
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    // RISK: contacts on a second tab are silently dropped (first sheet is empty -> throws).
    assert.throws(() => parseBuffer(buf), /empty/i);
  });
});
