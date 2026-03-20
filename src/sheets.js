const { google } = require('googleapis');
const fs = require('fs');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORIES = [
  'Groceries', 'Food & Dining', 'Transport', 'Travel',
  'Health & Medical', 'Fitness', 'Personal Care', 'Shopping',
  'Home & Maintenance', 'Subscriptions', 'Utilities',
  'Education', 'Entertainment', 'Gifts & Donations', 'Other',
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

// Creates a new sheet tab and returns its numeric sheetId.
async function createSheet(sheets, spreadsheetId, title) {
  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

// Returns the numeric sheetId for the year tab, creating it if needed.
async function getOrCreateYearSheet(sheets, spreadsheetId, year) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === year);
  if (existing) return existing.properties.sheetId;
  return createSheet(sheets, spreadsheetId, year);
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

// Writes static layout, SUMPRODUCT formulas, dropdown validation, and charts to the Dashboard sheet.
async function setupDashboard(sheets, spreadsheetId, dashboardSheetId) {
  const currentYear = new Date().getFullYear();

  const MONTH_LIST = '{"January","February","March","April","May","June","July","August","September","October","November","December"}';

  function monthlyFormula(monthNum) {
    return `=IFERROR(SUMPRODUCT((LEN(Data!$A$1:$A$10000)=10)*(VALUE(LEFT(Data!$A$1:$A$10000,4))=$B$1)*(VALUE(MID(Data!$A$1:$A$10000,6,2))=${monthNum})*Data!$D$1:$D$10000),0)`;
  }

  function categoryFormula(cellRef) {
    return `=IFERROR(IF($E$1="All",SUMPRODUCT((LEN(Data!$A$1:$A$10000)=10)*(VALUE(LEFT(Data!$A$1:$A$10000,4))=$B$1)*(Data!$C$1:$C$10000=${cellRef})*Data!$D$1:$D$10000),SUMPRODUCT((LEN(Data!$A$1:$A$10000)=10)*(VALUE(LEFT(Data!$A$1:$A$10000,4))=$B$1)*(VALUE(MID(Data!$A$1:$A$10000,6,2))=MATCH($E$1,${MONTH_LIST},0))*(Data!$C$1:$C$10000=${cellRef})*Data!$D$1:$D$10000)),0)`;
  }

  const monthRows = MONTHS.map((month, i) => [month, monthlyFormula(i + 1)]);
  const categoryRows = CATEGORIES.map((cat, i) => [cat, categoryFormula(`D${i + 5}`)]);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'Dashboard!A1:E1',
          values: [['Year:', currentYear, '', 'Month:', 'All']],
        },
        {
          range: 'Dashboard!A3:E4',
          values: [
            ['MONTHLY SPENDING', '', '', 'CATEGORY BREAKDOWN', ''],
            ['Month', 'Total (₹)', '', 'Category', 'Amount (₹)'],
          ],
        },
        {
          range: 'Dashboard!A5:B16',
          values: monthRows,
        },
        {
          range: 'Dashboard!D5:E19',
          values: categoryRows,
        },
      ],
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Month dropdown in E1
        {
          setDataValidation: {
            range: {
              sheetId: dashboardSheetId,
              startRowIndex: 0, endRowIndex: 1,
              startColumnIndex: 4, endColumnIndex: 5,
            },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: 'All' },
                  ...MONTHS.map(m => ({ userEnteredValue: m })),
                ],
              },
              showCustomUi: true,
              strict: true,
            },
          },
        },
        // Monthly column chart (anchored at A21)
        {
          addChart: {
            chart: {
              spec: {
                title: 'Monthly Spending',
                basicChart: {
                  chartType: 'COLUMN',
                  legendPosition: 'NO_LEGEND',
                  axis: [
                    { position: 'BOTTOM_AXIS', title: 'Month' },
                    { position: 'LEFT_AXIS', title: 'Amount (₹)' },
                  ],
                  domains: [{
                    domain: {
                      sourceRange: {
                        sources: [{
                          sheetId: dashboardSheetId,
                          startRowIndex: 4, endRowIndex: 16,
                          startColumnIndex: 0, endColumnIndex: 1,
                        }],
                      },
                    },
                  }],
                  series: [{
                    series: {
                      sourceRange: {
                        sources: [{
                          sheetId: dashboardSheetId,
                          startRowIndex: 4, endRowIndex: 16,
                          startColumnIndex: 1, endColumnIndex: 2,
                        }],
                      },
                    },
                    targetAxis: 'LEFT_AXIS',
                  }],
                  headerCount: 0,
                },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId: dashboardSheetId, rowIndex: 20, columnIndex: 0 },
                  widthPixels: 500,
                  heightPixels: 320,
                },
              },
            },
          },
        },
        // Category pie chart (anchored at D21)
        {
          addChart: {
            chart: {
              spec: {
                title: 'Category Breakdown',
                pieChart: {
                  legendPosition: 'RIGHT_LEGEND',
                  threeDimensional: false,
                  domain: {
                    sourceRange: {
                      sources: [{
                        sheetId: dashboardSheetId,
                        startRowIndex: 4, endRowIndex: 19,
                        startColumnIndex: 3, endColumnIndex: 4,
                      }],
                    },
                  },
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId: dashboardSheetId,
                        startRowIndex: 4, endRowIndex: 19,
                        startColumnIndex: 4, endColumnIndex: 5,
                      }],
                    },
                  },
                },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId: dashboardSheetId, rowIndex: 20, columnIndex: 3 },
                  widthPixels: 500,
                  heightPixels: 320,
                },
              },
            },
          },
        },
      ],
    },
  });
}

// Called once at startup: ensures Data and Dashboard sheets exist.
async function initSheets(authClient, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = meta.data.sheets.map(s => s.properties.title);

  if (!existingTitles.includes('Data')) {
    await createSheet(sheets, spreadsheetId, 'Data');
  }

  if (!existingTitles.includes('Dashboard')) {
    const dashboardSheetId = await createSheet(sheets, spreadsheetId, 'Dashboard');
    await setupDashboard(sheets, spreadsheetId, dashboardSheetId);
  }
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

  // Also write flat row to Data sheet for Dashboard formulas
  await appendToEnd(sheets, spreadsheetId, 'Data', [row]);
}

module.exports = { getClient, initSheets, appendExpense };
