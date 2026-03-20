const mockAppend = jest.fn().mockResolvedValue({});

jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({ mockAuthClient: true })),
    },
    sheets: jest.fn().mockReturnValue({
      spreadsheets: { values: { append: mockAppend } },
    }),
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  })),
}));

const { google } = require('googleapis');
const { getClient, appendExpense } = require('../src/sheets');

beforeEach(() => {
  mockAppend.mockClear();
  google.auth.JWT.mockClear();
});

describe('getClient', () => {
  it('creates a JWT auth client from the key file', () => {
    getClient('./service-account.json');
    expect(google.auth.JWT).toHaveBeenCalledWith(
      'test@test.iam.gserviceaccount.com',
      null,
      expect.any(String),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  });
});

describe('appendExpense', () => {
  it('calls Sheets API with correctly formatted row', async () => {
    const client = getClient('./service-account.json');
    const expense = { date: '2026-03-18', item: 'Milk', category: 'Groceries', amount: 20 };
    await appendExpense(client, 'sheet-id-123', expense, 'milk 20');
    expect(mockAppend).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 'sheet-id-123',
      range: 'Expenses!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']],
      },
    }));
  });
});
