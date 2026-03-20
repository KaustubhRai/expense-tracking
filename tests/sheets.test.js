const mockGet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockValuesGet = jest.fn();
const mockValuesUpdate = jest.fn();
const mockValuesAppend = jest.fn();
const mockValuesBatchUpdate = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({ mockAuthClient: true })),
    },
    sheets: jest.fn().mockReturnValue({
      spreadsheets: {
        get: mockGet,
        batchUpdate: mockBatchUpdate,
        values: {
          get: mockValuesGet,
          update: mockValuesUpdate,
          append: mockValuesAppend,
          batchUpdate: mockValuesBatchUpdate,
        },
      },
    }),
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  })),
}));

const { getClient, initSheets, appendExpense } = require('../src/sheets');

const SHEET_ID = 'sheet-id-123';
const NUMERIC_SHEET_ID = 42;
const DASHBOARD_SHEET_ID = 99;
const YEAR = '2026';

function makeExpense(overrides = {}) {
  return { date: '2026-03-18', item: 'Milk', category: 'Groceries', amount: 20, ...overrides };
}

// Helper: mock spreadsheets.get to return a year sheet that exists
function mockYearSheetExists() {
  mockGet.mockResolvedValue({
    data: { sheets: [{ properties: { title: YEAR, sheetId: NUMERIC_SHEET_ID } }] },
  });
}

// Helper: mock spreadsheets.get to return no year sheet (needs creation)
function mockYearSheetMissing() {
  mockGet.mockResolvedValue({ data: { sheets: [] } });
  mockBatchUpdate.mockResolvedValue({
    data: { replies: [{ addSheet: { properties: { sheetId: NUMERIC_SHEET_ID } } }] },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValuesUpdate.mockResolvedValue({});
  mockValuesAppend.mockResolvedValue({});
  mockValuesBatchUpdate.mockResolvedValue({});
  mockBatchUpdate.mockResolvedValue({
    data: { replies: [{ addSheet: { properties: { sheetId: NUMERIC_SHEET_ID } } }] },
  });
});

describe('getClient', () => {
  it('creates a JWT auth client from the key file', () => {
    const { google } = require('googleapis');
    getClient('./service-account.json');
    expect(google.auth.JWT).toHaveBeenCalledWith(
      'test@test.iam.gserviceaccount.com',
      null,
      expect.any(String),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  });
});

describe('initSheets', () => {
  it('skips creation when Data and Dashboard already exist', async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: 'Data', sheetId: 10 } },
          { properties: { title: 'Dashboard', sheetId: 11 } },
        ],
      },
    });
    const client = getClient('./service-account.json');
    await initSheets(client, SHEET_ID);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it('creates Data sheet when missing', async () => {
    mockGet.mockResolvedValue({
      data: { sheets: [{ properties: { title: 'Dashboard', sheetId: 11 } }] },
    });
    mockBatchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { sheetId: 10 } } }] },
    });
    const client = getClient('./service-account.json');
    await initSheets(client, SHEET_ID);
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        requests: [expect.objectContaining({
          addSheet: expect.objectContaining({ properties: { title: 'Data' } }),
        })],
      }),
    }));
  });

  it('creates Dashboard sheet and runs setup when missing', async () => {
    mockGet.mockResolvedValue({
      data: { sheets: [{ properties: { title: 'Data', sheetId: 10 } }] },
    });
    mockBatchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { sheetId: DASHBOARD_SHEET_ID } } }] },
    });
    const client = getClient('./service-account.json');
    await initSheets(client, SHEET_ID);

    // Should create the Dashboard sheet
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        requests: [expect.objectContaining({
          addSheet: expect.objectContaining({ properties: { title: 'Dashboard' } }),
        })],
      }),
    }));

    // Should write dashboard values (year label in A1)
    expect(mockValuesBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: SHEET_ID,
      requestBody: expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            range: 'Dashboard!A1:E1',
            values: expect.arrayContaining([expect.arrayContaining(['Year:'])]),
          }),
        ]),
      }),
    }));

    // Should set up month dropdown validation and add charts
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        requests: expect.arrayContaining([
          expect.objectContaining({ setDataValidation: expect.any(Object) }),
          expect.objectContaining({ addChart: expect.any(Object) }),
        ]),
      }),
    }));
  });

  it('creates both sheets when neither exists', async () => {
    mockGet.mockResolvedValue({ data: { sheets: [] } });
    mockBatchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { sheetId: NUMERIC_SHEET_ID } } }] },
    });
    const client = getClient('./service-account.json');
    await initSheets(client, SHEET_ID);
    // batchUpdate called: once for Data, once for Dashboard addSheet, once for dashboard setup
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3);
  });
});

describe('appendExpense — empty sheet (first entry)', () => {
  it('creates the year sheet and appends month header + blank + row', async () => {
    mockYearSheetMissing();
    mockValuesGet.mockResolvedValue({ data: { values: [] } }); // empty sheet

    const client = getClient('./service-account.json');
    await appendExpense(client, SHEET_ID, makeExpense(), 'milk 20');

    expect(mockValuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: SHEET_ID,
      range: `${YEAR}!A:E`,
      requestBody: {
        values: [['March'], [], ['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']],
      },
    }));
  });

  it('also writes a flat row to the Data sheet', async () => {
    mockYearSheetMissing();
    mockValuesGet.mockResolvedValue({ data: { values: [] } });

    const client = getClient('./service-account.json');
    await appendExpense(client, SHEET_ID, makeExpense(), 'milk 20');

    expect(mockValuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      range: 'Data!A:E',
      requestBody: {
        values: [['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']],
      },
    }));
  });
});

describe('appendExpense — month section already exists', () => {
  it('appends to the end when month is the last section', async () => {
    mockYearSheetExists();
    // Sheet has: March header, blank, one existing row
    mockValuesGet.mockResolvedValue({
      data: { values: [['March'], [''], ['2026-03-15']] },
    });

    const client = getClient('./service-account.json');
    await appendExpense(client, SHEET_ID, makeExpense(), 'milk 20');

    expect(mockValuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: {
        values: [['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']],
      },
    }));
  });

  it('inserts before the next month when section is not last', async () => {
    mockYearSheetExists();
    // Sheet has: March, blank, march row, April, blank, april row
    mockValuesGet.mockResolvedValue({
      data: {
        values: [['March'], [''], ['2026-03-15'], ['April'], [''], ['2026-04-01']],
      },
    });

    const client = getClient('./service-account.json');
    await appendExpense(client, SHEET_ID, makeExpense(), 'milk 20');

    // Should insert 1 row at index 3 (before April)
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        requests: [expect.objectContaining({
          insertDimension: expect.objectContaining({
            range: expect.objectContaining({ startIndex: 3, endIndex: 4 }),
          }),
        })],
      }),
    }));
    expect(mockValuesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      range: `${YEAR}!A4`,
      requestBody: { values: [['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']] },
    }));
  });
});

describe('appendExpense — new month inserted between existing months', () => {
  it('inserts March section before April when only April exists', async () => {
    mockYearSheetExists();
    // Sheet has only April
    mockValuesGet.mockResolvedValue({
      data: { values: [['April'], [''], ['2026-04-01']] },
    });

    const client = getClient('./service-account.json');
    await appendExpense(client, SHEET_ID, makeExpense(), 'milk 20'); // March expense

    // Should insert 3 rows at index 0 (before April)
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        requests: [expect.objectContaining({
          insertDimension: expect.objectContaining({
            range: expect.objectContaining({ startIndex: 0, endIndex: 3 }),
          }),
        })],
      }),
    }));
    // Write March header at row 0
    expect(mockValuesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      range: `${YEAR}!A1`,
      requestBody: { values: [['March']] },
    }));
    // Write expense at row 2 (0-indexed), i.e. A3
    expect(mockValuesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      range: `${YEAR}!A3`,
      requestBody: { values: [['2026-03-18', 'Milk', 'Groceries', 20, 'milk 20']] },
    }));
  });
});
