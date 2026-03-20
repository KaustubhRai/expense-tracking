const { google } = require('googleapis');
const fs = require('fs');

function getClient(keyPath) {
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

async function appendExpense(authClient, sheetsId, expense, rawMessage) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetsId,
    range: 'Expenses!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[expense.date, expense.item, expense.category, expense.amount, rawMessage]],
    },
  });
}

module.exports = { getClient, appendExpense };
