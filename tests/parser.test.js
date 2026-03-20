const { validateResponse, validateExpense, buildPrompt, parseExpense, CATEGORIES } = require('../src/parser');

describe('validateExpense', () => {
  const valid = { item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18' };

  it('returns true for a valid expense', () => {
    expect(validateExpense({ ...valid })).toBe(true);
  });

  it('returns false when item is missing', () => {
    expect(validateExpense({ ...valid, item: null })).toBe(false);
  });

  it('returns false when amount is zero or negative', () => {
    expect(validateExpense({ ...valid, amount: 0 })).toBe(false);
    expect(validateExpense({ ...valid, amount: -5 })).toBe(false);
  });

  it('returns false when date format is invalid', () => {
    expect(validateExpense({ ...valid, date: '18-03-2026' })).toBe(false);
  });

  it('overrides unknown category with Other', () => {
    const exp = { ...valid, category: 'Unknown' };
    expect(validateExpense(exp)).toBe(true);
    expect(exp.category).toBe('Other');
  });
});

describe('validateResponse', () => {
  it('returns true for a valid single expense', () => {
    expect(validateResponse({
      isExpense: true,
      expenses: [{ item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18' }],
    })).toBe(true);
  });

  it('returns true for multiple valid expenses', () => {
    expect(validateResponse({
      isExpense: true,
      expenses: [
        { item: 'Coffee', category: 'Food & Dining', amount: 80, date: '2026-03-18' },
        { item: 'Snack', category: 'Food & Dining', amount: 100, date: '2026-03-18' },
      ],
    })).toBe(true);
  });

  it('returns true for a non-expense', () => {
    expect(validateResponse({ isExpense: false, expenses: [] })).toBe(true);
  });

  it('returns false when isExpense is not a boolean', () => {
    expect(validateResponse({ isExpense: 'yes', expenses: [] })).toBe(false);
  });

  it('returns false when expenses array is missing or empty on isExpense:true', () => {
    expect(validateResponse({ isExpense: true, expenses: [] })).toBe(false);
    expect(validateResponse({ isExpense: true })).toBe(false);
  });

  it('returns false when any expense in array is invalid', () => {
    expect(validateResponse({
      isExpense: true,
      expenses: [
        { item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18' },
        { item: 'Coffee', category: 'Food & Dining', amount: null, date: '2026-03-18' },
      ],
    })).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('injects the date and year into the prompt', () => {
    const prompt = buildPrompt('2026-03-18');
    expect(prompt).toContain('2026-03-18');
    expect(prompt).toContain('2026');
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

  it('returns parsed expense for a single valid Gemini response', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: true,
      expenses: [{ item: 'Milk', category: 'Groceries', amount: 20, date: '2026-03-18' }],
    });
    const result = await parseExpense('milk 20', mockGenAI);
    expect(result).toMatchObject({ isExpense: true });
    expect(result.expenses[0]).toMatchObject({ item: 'Milk', amount: 20 });
  });

  it('returns multiple expenses for multi-item response', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: true,
      expenses: [
        { item: 'Coffee', category: 'Food & Dining', amount: 80, date: '2026-03-18' },
        { item: 'Snack', category: 'Food & Dining', amount: 100, date: '2026-03-18' },
      ],
    });
    const result = await parseExpense('coffee 80 snack 100', mockGenAI);
    expect(result.expenses).toHaveLength(2);
    expect(result.expenses[0].item).toBe('Coffee');
    expect(result.expenses[1].item).toBe('Snack');
  });

  it('returns object with isExpense false for non-expense message', async () => {
    const mockGenAI = makeMockGenAI({ isExpense: false, expenses: [] });
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
            text: () => '```json\n{"isExpense":true,"expenses":[{"item":"Milk","category":"Groceries","amount":20,"date":"2026-03-18"}]}\n```',
          },
        }),
      }),
    };
    const result = await parseExpense('milk 20', mockGenAI);
    expect(result).not.toBeNull();
    expect(result.expenses[0].item).toBe('Milk');
  });

  it('returns null when validation fails (missing amount)', async () => {
    const mockGenAI = makeMockGenAI({
      isExpense: true,
      expenses: [{ item: 'Milk', category: 'Groceries', amount: null, date: '2026-03-18' }],
    });
    const result = await parseExpense('milk', mockGenAI);
    expect(result).toBeNull();
  });
});
