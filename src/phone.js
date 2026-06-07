const { DEFAULT_COUNTRY_CODE } = require('./config');

/**
 * Normalize a raw phone value to a plain digit string with country code.
 * Rules:
 *   00xxx  → strip leading 00 (international dial prefix)
 *   0xxx   → replace leading 0 with default country code
 *   +xxx   → strip + (already handled because we strip all non-digits first)
 *   xxx    → prepend default country code if digits look like a local number
 *            (i.e. do not already start with the country code)
 * Returns null if the result is empty.
 */
function normalizePhone(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1);
  } else if (!digits.startsWith(countryCode)) {
    digits = countryCode + digits;
  }

  return digits || null;
}

/** Build a WhatsApp chat ID from a normalized phone string. */
function toChatId(phone) {
  return `${phone}@c.us`;
}

module.exports = { normalizePhone, toChatId };
