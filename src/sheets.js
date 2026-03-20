const { google } = require('googleapis');
const fs = require('fs');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getClient(keyPath) {
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

// Returns the numeric sheetId for the year tab, creating it if needed.
async function getOrCreateYearSheet(sheets, spreadsheetId, year) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === year);
  if (existing) return existing.properties.sheetId;

  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: year } } }] },
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

// Returns column A values as an array of arrays (may be empty).
async function readColumnA(sheets, spreadsheetId, sheetName) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  });
  return resp.data.values || [];
}

// Inserts `count` blank rows starting at 0-indexed `startIndex`.
async function insertRowsAt(sheets, spreadsheetId, sheetId, startIndex, count) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + count },
          inheritFromBefore: false,
        },
      }],
    },
  });
}

// Writes a single row at 0-indexed rowIndex (converts to 1-indexed for the API).
async function writeValues(sheets, spreadsheetId, sheetName, rowIndex, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

// Appends rows after the last non-empty row in the sheet.
async function appendToEnd(sheets, spreadsheetId, sheetName, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

async function appendExpense(authClient, spreadsheetId, expense, rawMessage) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const expDate = new Date(expense.date + 'T00:00:00');
  const year = expDate.getFullYear().toString();
  const monthIndex = expDate.getMonth();
  const monthName = MONTHS[monthIndex];

  const sheetId = await getOrCreateYearSheet(sheets, spreadsheetId, year);
  const colA = await readColumnA(sheets, spreadsheetId, year);
  const row = [expense.date, expense.item, expense.category, expense.amount, rawMessage];

  // Find if this month's section already exists
  let monthHeaderIdx = -1;
  for (let i = 0; i < colA.length; i++) {
    if (colA[i] && colA[i][0] === monthName) {
      monthHeaderIdx = i;
      break;
    }
  }

  if (monthHeaderIdx === -1) {
    // Month doesn't exist yet — find chronological position
    let insertAt = colA.length;
    for (let i = 0; i < colA.length; i++) {
      const cell = colA[i] && colA[i][0] ? colA[i][0].trim() : '';
      const existingMonthIdx = MONTHS.indexOf(cell);
      if (existingMonthIdx !== -1 && existingMonthIdx > monthIndex) {
        insertAt = i;
        break;
      }
    }

    if (insertAt >= colA.length) {
      // Append at end: month header, blank row, expense row
      await appendToEnd(sheets, spreadsheetId, year, [[monthName], [], row]);
    } else {
      // Insert before a later month: month header + blank + expense (3 rows)
      await insertRowsAt(sheets, spreadsheetId, sheetId, insertAt, 3);
      await writeValues(sheets, spreadsheetId, year, insertAt, [monthName]);
      // insertAt + 1 is left blank
      await writeValues(sheets, spreadsheetId, year, insertAt + 2, row);
    }
  } else {
    // Month section exists — find where it ends (next month header or end of sheet)
    let sectionEnd = colA.length;
    for (let i = monthHeaderIdx + 1; i < colA.length; i++) {
      const cell = colA[i] && colA[i][0] ? colA[i][0].trim() : '';
      if (MONTHS.includes(cell)) {
        sectionEnd = i;
        break;
      }
    }

    if (sectionEnd >= colA.length) {
      // This month is last — append to end of sheet
      await appendToEnd(sheets, spreadsheetId, year, [row]);
    } else {
      // Insert just before the next month header
      await insertRowsAt(sheets, spreadsheetId, sheetId, sectionEnd, 1);
      await writeValues(sheets, spreadsheetId, year, sectionEnd, row);
    }
  }
}

module.exports = { getClient, appendExpense };
