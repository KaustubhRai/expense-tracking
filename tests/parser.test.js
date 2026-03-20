const { validateResponse, buildPrompt, parseExpense, CATEGORIES } = require('../src/parser');

describe('validateResponse', () => {
  it('returns true for a valid expense', () => {
    const result = validateResponse({
      isExpense: true,
      item: 'Milk',
      category: 'Groceries',
      amount: 20,
      date: '2026-03-18',
    });
    expect(result).toBe(true);
  });

  it('returns true for a non-expense', () => {
    expect(validateResponse({
      isExpense: false,
      item: null,
      category: null,
      amount: null,
      date: null,
    })).toBe(true);
  });

  it('returns false when isExpense is not a boolean', () => {
    expect(validateResponse({ isExpense: 'yes' })).toBe(false);
  });

  it('returns false when amount is null', () => {
    expect(validateResponse({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: null, date: '2026-03-18',
    })).toBe(false);
  });

  it('returns false when amount is negative', () => {
    expect(validateResponse({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: -5, date: '2026-03-18',
    })).toBe(false);
  });

  it('returns false when amount is zero', () => {
    expect(validateResponse({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: 0, date: '2026-03-18',
    })).toBe(false);
  });

  it('returns false when item is missing', () => {
    expect(validateResponse({
      isExpense: true, item: null, category: 'Groceries', amount: 20, date: '2026-03-18',
    })).toBe(false);
  });

  it('overrides unknown category with Other', () => {
    const response = {
      isExpense: true, item: 'X', category: 'Unknown Category', amount: 10, date: '2026-03-18',
    };
    const valid = validateResponse(response);
    expect(valid).toBe(true);
    expect(response.category).toBe('Other');
  });

  it('returns false when date format is invalid', () => {
    expect(validateResponse({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: 20, date: '18-03-2026',
    })).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('injects the date into the prompt', () => {
    const prompt = buildPrompt('2026-03-18');
    expect(prompt).toContain('2026-03-18');
  });

  it('includes all 15 categories', () => {
    const prompt = buildPrompt('2026-03-18');
    CATEGORIES.forEach(cat => expect(prompt).toContain(cat));
  });
});

describe('parseExpense', () => {
  function makeMockGenAI(responseJson) {
    return {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => JSON.stringify(responseJson) },
        }),
      }),
    };
  }

  it('returns parsed expense for a valid Gemini response', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18',
    });
    const result = await parseExpense('milk 20', mockGenAI);
    expect(result).toMatchObject({ isExpense: true, item: 'Milk', amount: 20 });
  });

  it('returns object with isExpense false for non-expense message', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: false, item: null, category: null, amount: null, date: null,
    });
    const result = await parseExpense('ok', mockGenAI);
    expect(result).toMatchObject({ isExpense: false });
  });

  it('returns null when Gemini returns malformed JSON', async () => {
    const mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'not json at all' },
        }),
      }),
    };
    const result = await parseExpense('milk 20', mockGenAI);
    expect(result).toBeNull();
  });

  it('strips markdown code fences from Gemini response', async () => {
    const mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => '```json\n{"isExpense":true,"item":"Milk","category":"Groceries","amount":20,"date":"2026-03-18"}\n```',
          },
        }),
      }),
    };
    const result = await parseExpense('milk 20', mockGenAI);
    expect(result).not.toBeNull();
    expect(result.item).toBe('Milk');
  });

  it('returns null when validation fails (missing amount)', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: true, item: 'Milk', category: 'Groceries', amount: null, date: '2026-03-18',
    });
    const result = await parseExpense('milk', mockGenAI);
    expect(result).toBeNull();
  });
});
