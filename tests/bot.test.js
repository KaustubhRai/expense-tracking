jest.mock('../src/filters', () => ({ shouldProcess: jest.fn() }));
jest.mock('../src/parser', () => ({ parseExpense: jest.fn() }));
jest.mock('../src/sheets', () => ({ appendExpense: jest.fn() }));
jest.mock('../src/mailer', () => ({ sendAlert: jest.fn() }));
jest.mock('fs', () => ({ appendFileSync: jest.fn() }));

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
  LocalAuth: jest.fn(),
}));

jest.mock('qrcode-terminal', () => ({ generate: jest.fn() }));

const { shouldProcess } = require('../src/filters');
const { parseExpense } = require('../src/parser');
const { appendExpense } = require('../src/sheets');
const fs = require('fs');
const { handleMessage } = require('../src/bot');

const mockConfig = {
  targetGroupJid: 'group@g.us',
  sheetsId: 'sheet-id',
  serviceAccountKeyPath: './service-account.json',
  alertEmail: 'test@example.com',
};

const mockGenAI = {};
const mockSheetsClient = {};

function makeMessage(body = 'milk 20') {
  return { body, reply: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => jest.clearAllMocks());

describe('handleMessage', () => {
  it('does nothing when message is filtered out', async () => {
    shouldProcess.mockReturnValue(false);
    const msg = makeMessage();
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(parseExpense).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('replies with error when Gemini throws', async () => {
    shouldProcess.mockReturnValue(true);
    parseExpense.mockRejectedValue(new Error('API error'));
    const msg = makeMessage();
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(msg.reply).toHaveBeenCalledWith('Something went wrong, please try again.');
  });

  it('does not reply when message is not an expense', async () => {
    shouldProcess.mockReturnValue(true);
    parseExpense.mockResolvedValue({ isExpense: false });
    const msg = makeMessage('ok');
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(msg.reply).not.toHaveBeenCalled();
    expect(appendExpense).not.toHaveBeenCalled();
  });

  it('replies with parse hint when Gemini returns null', async () => {
    shouldProcess.mockReturnValue(true);
    parseExpense.mockResolvedValue(null);
    const msg = makeMessage('hello');
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(msg.reply).toHaveBeenCalledWith(
      "Couldn't parse that, try: item amount (e.g. milk 20)"
    );
  });

  it('appends to sheet and replies with confirmation on success', async () => {
    shouldProcess.mockReturnValue(true);
    parseExpense.mockResolvedValue({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18',
    });
    appendExpense.mockResolvedValue(undefined);
    const msg = makeMessage('milk 20');
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(appendExpense).toHaveBeenCalledWith(
      mockSheetsClient, 'sheet-id',
      expect.objectContaining({ item: 'Milk' }),
      'milk 20'
    );
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Milk'));
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('₹20'));
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Groceries'));
  });

  it('writes to failed.jsonl and replies with local-log message when Sheets fails', async () => {
    shouldProcess.mockReturnValue(true);
    parseExpense.mockResolvedValue({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18',
    });
    appendExpense.mockRejectedValue(new Error('Sheets API error'));
    const msg = makeMessage('milk 20');
    await handleMessage(msg, mockConfig, mockGenAI, mockSheetsClient);
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('failed.jsonl'),
      expect.any(String)
    );
    expect(msg.reply).toHaveBeenCalledWith(
      expect.stringContaining("couldn't reach the Sheet")
    );
  });
});
