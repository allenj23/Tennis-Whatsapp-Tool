const XLSX = require('xlsx');

/**
 * Build an .xlsx file buffer from an array-of-arrays (AOA).
 * Caller controls headers and rows exactly — used to simulate
 * well-formed, malformed, and hostile spreadsheets.
 *
 * @param {any[][]} aoa  e.g. [['Name','Phone','Group'], ['Alice','0501234567','A']]
 * @param {object}  [opts]
 * @param {string}  [opts.sheetName='Contacts']
 * @param {boolean} [opts.noSheets=false]  produce a workbook with zero sheets
 * @returns {Buffer}
 */
function makeXlsxBuffer(aoa, opts = {}) {
  const { sheetName = 'Contacts', noSheets = false } = opts;
  const wb = XLSX.utils.book_new();

  if (!noSheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** A standard valid header row. */
const HEADER = ['Name', 'Phone', 'Group'];

/** Build a fixture buffer with the standard header + given data rows. */
function makeContactsXlsx(dataRows, opts = {}) {
  return makeXlsxBuffer([HEADER, ...dataRows], opts);
}

module.exports = { makeXlsxBuffer, makeContactsXlsx, HEADER };
