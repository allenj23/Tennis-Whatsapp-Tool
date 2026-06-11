/**
 * Parse training-day values from the sheet "Days" / "ימים" column.
 * Returns ISO weekday numbers: 0=Sunday … 6=Saturday (matches Date.getDay()).
 */

const DAY_TOKENS = [
  { day: 0, aliases: ['sun', 'sunday', 'su', 'א', 'א׳', "א'", 'ראשון', 'יום א', 'יום ראשון'] },
  { day: 1, aliases: ['mon', 'monday', 'mo', 'ב', 'ב׳', "ב'", 'שני', 'יום ב', 'יום שני'] },
  { day: 2, aliases: ['tue', 'tuesday', 'tu', 'ג', 'ג׳', "ג'", 'שלישי', 'יום ג', 'יום שלישי'] },
  { day: 3, aliases: ['wed', 'wednesday', 'we', 'ד', 'ד׳', "ד'", 'רביעי', 'יום ד', 'יום רביעי'] },
  { day: 4, aliases: ['thu', 'thursday', 'th', 'ה', 'ה׳', "ה'", 'חמישי', 'יום ה', 'יום חמישי'] },
  { day: 5, aliases: ['fri', 'friday', 'fr', 'ו', 'ו׳', "ו'", 'שישי', 'יום ו', 'יום שישי'] },
  { day: 6, aliases: ['sat', 'saturday', 'sa', 'ש', 'ש׳', "ש'", 'שבת', 'יום ש', 'יום שבת'] },
];

const ALIAS_TO_DAY = new Map();
for (const { day, aliases } of DAY_TOKENS) {
  for (const a of aliases) {
    ALIAS_TO_DAY.set(normalizeToken(a), day);
  }
}

function normalizeToken(s) {
  return String(s ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u00a0\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitDayField(raw) {
  return String(raw ?? '')
    .split(/[,;/|+\n]+|(?:\s+ו\s+)|(?:\s+and\s+)/i)
    .map((t) => normalizeToken(t))
    .filter(Boolean);
}

/**
 * @param {string} raw  Cell value from Days / ימים column
 * @returns {number[]}  Unique weekday numbers 0–6, sorted
 */
function parseTrainingDays(raw) {
  const out = new Set();
  for (const token of splitDayField(raw)) {
    const day = ALIAS_TO_DAY.get(token);
    if (day !== undefined) out.add(day);
  }
  return [...out].sort((a, b) => a - b);
}

/** @param {number[]} days */
function formatTrainingDaysHe(days) {
  const labels = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  return (days || []).map((d) => labels[d] || '').filter(Boolean).join(', ');
}

module.exports = { parseTrainingDays, formatTrainingDaysHe, DAY_TOKENS };
