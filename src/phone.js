const { DEFAULT_COUNTRY_CODE } = require('./config');

/**
 * Minimum total digit length for a normalized phone number (including country code).
 * Rejects bare-zero ("0"→"972") and implausibly short strings ("12"→"97212").
 * The shortest real mobile numbers in widespread use are ~7–8 digits after the
 * country code, so 7 total (country + local) is a safe lower bound.
 */
const MIN_DIGITS = 7;

/**
 * Normalize a raw phone value to a plain digit string with country code.
 *
 * Rules (applied in order):
 *   1. If the raw value (trimmed) starts with '+' the caller explicitly
 *      signalled a full international number — strip non-digits and return
 *      as-is WITHOUT prepending a country code.
 *   2. Strip all non-digit characters.
 *   3. If digits start with '00' → strip the IDD prefix (00972... → 972...).
 *   4. If digits start with '0'  → replace leading 0 with the default country
 *      code  (0501234567 → 972501234567).
 *   5. If digits do not start with the country code → prepend it
 *      (501234567 → 972501234567).
 *   6. Reject the result if it has fewer than MIN_DIGITS digits.
 *
 * Returns null for empty, all-symbol, or too-short inputs.
 */
function normalizePhone(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  const str = String(raw ?? '').trim();
  if (!str) return null;

  // Rule 1: explicit international format — preserve as-is.
  const hasPlus = str.startsWith('+');

  let digits = str.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // Already a full international number; just return the raw digits.
    return digits.length >= MIN_DIGITS ? digits : null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1);
  } else if (!digits.startsWith(countryCode)) {
    digits = countryCode + digits;
  }

  return digits.length >= MIN_DIGITS ? digits : null;
}

/** Build a WhatsApp chat ID from a normalized phone string. */
function toChatId(phone) {
  return `${phone}@c.us`;
}

module.exports = { normalizePhone, toChatId };
