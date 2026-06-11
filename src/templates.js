/**
 * Message templates — persisted in data/templates.json per install.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILE     = path.join(DATA_DIR, 'templates.json');

const DEFAULTS_VERSION = 3;
const LEGACY_DEFAULT_IDS = new Set(['default-reminder', 'default-update', 'default-payment']);
const V2_DEFAULT_IDS = new Set([
  'scenario-welcome', 'scenario-camp', 'scenario-tournament-reg',
  'scenario-tournament-reminder', 'scenario-cancel', 'scenario-schedule', 'scenario-holiday',
]);

/** urgent first — office picks in seconds */
const DEFAULTS = [
  {
    id:     'scenario-rain',
    icon:   '🌧️',
    urgent: true,
    name:   'ביטול — גשם (כל המועדון)',
    body:   '🌧️ עדכון דחוף ממועדון הטניס\n\nבשל תנאי מזג האוויר — כל האימונים והפעילויות במועדון היום בוטלו.\n\nאין להגיע למגרשים.\n\nנעדכן לגבי מועד חלופי בהקדם האפשר.\n\nסליחה על אי הנוחות,\nמשרד המועדון',
  },
  {
    id:     'scenario-cancel',
    icon:   '❌',
    urgent: true,
    name:   'ביטול אימון היום',
    body:   '❌ עדכון ממשרד המועדון\n\nהאימון המתוכנן להיום בוטל.\n\nנעדכן בהקדם אם ייקבע מועד חלופי.\n\nסליחה על אי הנוחות ותודה על ההבנה.',
  },
  {
    id:     'scenario-schedule',
    icon:   '📅',
    urgent: true,
    name:   'שינוי לוח זמנים',
    body:   '📅 עדכון ממשרד המועדון\n\nחל שינוי בלוח האימונים.\n\nנא לבדוק את השעה והמגרש המעודכנים לפני ההגעה.\n\nלשאלות — פנו למשרד.',
  },
  {
    id:     'scenario-court',
    icon:   '🚧',
    urgent: true,
    name:   'מגרש סגור / תחזוקה',
    body:   '🚧 עדכון ממועדון הטניס\n\nמגרש מספר ___ סגור היום לתחזוקה.\n\nהאימונים יתקיימו במגרש חלופי — פרטים מהמאמן או מהמשרד.\n\nתודה על הסבלנות.',
  },
  {
    id:     'scenario-training-reminder',
    icon:   '🎾',
    name:   'תזכורת אימון מחר',
    body:   '🎾 תזכורת ממועדון הטניס\n\nמחר אימון כרגיל — נא להגיע בזמן, עם ביגוד ונעלי טניס.\n\nנשמח לראות אתכם על המגרש!',
  },
  {
    id:     'scenario-payment',
    icon:   '💳',
    name:   'תזכורת תשלום',
    body:   '💳 שלום ממשרד המועדון\n\nתזכורת ידידותית לגבי תשלום שטרם התקבל.\n\nניתן לסדור תשלום במשרד או בדרכים המקובלות אצלנו.\n\nלשאלות — אנחנו כאן. תודה!',
  },
  {
    id:     'scenario-absence',
    icon:   '👋',
    name:   'חסרים באימון?',
    body:   '👋 שלום,\n\nשמנו לב שלא הגעתם לאימון האחרון.\n\nהכל בסדר? נשמח לשמוע מכם.\n\nאם יש סיבה או צורך לדחות — עדכנו את המשרד.\n\nתודה!',
  },
  {
    id:     'scenario-tournament-reminder',
    icon:   '🏆',
    name:   'תזכורת טורניר',
    body:   '🏆 תזכורת — טורניר המועדון מתקרב!\n\nנא להגיע כ-15 דקות לפני תחילת המשחקים, עם ביגוד ונעלי טניס.\n\nבהצלחה לכולם! 🎾',
  },
  {
    id:     'scenario-tournament-reg',
    icon:   '📝',
    name:   'הרשמה לטורניר',
    body:   '📝 שלום! 🏆\n\nנפתחה ההרשמה לטורניר הטניס הקרוב של המועדון.\n\nההרשמה דרך המשרד — מספר המקומות מוגבל.\n\nלפרטים על קטגוריות ומועדים — פנו אלינו.',
  },
  {
    id:     'scenario-camp',
    icon:   '☀️',
    name:   'הרשמה לקייטנה',
    body:   '☀️ שלום!\n\nההרשמה לקייטנת הקיץ של מועדון הטניס נפתחה!\n\nאימוני טניס, משחקים ופעילויות לפי גילאים.\nמספר המקומות מוגבל — מומלץ להרשם בהקדם.\n\nלפרטים — המשרד.',
  },
  {
    id:     'scenario-deadline',
    icon:   '⏰',
    name:   'דדליין הרשמה',
    body:   '⏰ תזכורת אחרונה!\n\nההרשמה נסגרת בקרוב.\n\nמי שעדיין לא נרשם — נא לפנות למשרד בהקדם.\n\nתודה!',
  },
  {
    id:     'scenario-welcome',
    icon:   '🤝',
    name:   'ברוכים הבאים',
    body:   '🤝 שלום וברוכים הבאים למועדון הטניס!\n\nשמחים שהצטרפתם אלינו. בימים הקרובים תקבלו פרטים על קבוצה, לוח אימונים ותשלומים.\n\nלכל שאלה — המשרד זמין.\nמחכים לראותכם על המגרש! 🎾',
  },
  {
    id:     'scenario-holiday',
    icon:   '🎉',
    name:   'ברכת חג',
    body:   '🎉 שלום וחג שמח!\n\nמשרד מועדון הטניס מאחל לכם ולמשפחותיכם חג נעים, מלא בשמחה ובריאות.\n\nנשמח לראות אתכם שוב על המגרש אחרי החג.\n\nבברכה,\nצוות המועדון',
  },
];

function _read() {
  try {
    if (!fs.existsSync(FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(parsed.templates)) return null;
    return { templates: parsed.templates, version: parsed.defaultsVersion || 1 };
  } catch {
    return null;
  }
}

function _write(templates, version = DEFAULTS_VERSION) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    FILE,
    JSON.stringify({ defaultsVersion: version, templates }, null, 2),
    'utf8'
  );
}

function _isLegacyDefaultsOnly(templates) {
  return templates.length === LEGACY_DEFAULT_IDS.size
    && templates.every((t) => LEGACY_DEFAULT_IDS.has(t.id));
}

function _isV2DefaultsOnly(templates) {
  return templates.length === V2_DEFAULT_IDS.size
    && templates.every((t) => V2_DEFAULT_IDS.has(t.id));
}

function _shouldRefreshDefaults(stored) {
  if (!stored) return true;
  if (stored.version < DEFAULTS_VERSION && _isLegacyDefaultsOnly(stored.templates)) return true;
  if (stored.version < DEFAULTS_VERSION && _isV2DefaultsOnly(stored.templates)) return true;
  return false;
}

function _ensureLoaded() {
  const stored = _read();

  if (_shouldRefreshDefaults(stored)) {
    const list = DEFAULTS.map((t) => ({ ...t }));
    _write(list);
    return list;
  }

  if (stored.version < DEFAULTS_VERSION) {
    _write(stored.templates, DEFAULTS_VERSION);
  }

  return stored.templates;
}

function getAll() {
  return _ensureLoaded();
}

function add({ name, body, icon = '💬' }) {
  const trimmedName = String(name || '').trim();
  const trimmedBody = String(body || '').trim();
  if (!trimmedName) throw new Error('Template name is required.');
  if (!trimmedBody) throw new Error('Template message is required.');

  const list = _ensureLoaded();
  const entry = {
    id:   crypto.randomBytes(6).toString('hex'),
    icon: String(icon || '💬').trim() || '💬',
    name: trimmedName,
    body: trimmedBody,
  };
  list.push(entry);
  _write(list);
  return entry;
}

function remove(id) {
  const list = _ensureLoaded();
  const idx  = list.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error('Template not found.');
  list.splice(idx, 1);
  _write(list);
  return list;
}

module.exports = { getAll, add, remove };
