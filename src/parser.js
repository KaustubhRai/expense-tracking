const CATEGORIES = [
  'Groceries', 'Food & Dining', 'Transport', 'Travel',
  'Health & Medical', 'Fitness', 'Personal Care', 'Shopping',
  'Home & Maintenance', 'Subscriptions', 'Utilities',
  'Education', 'Entertainment', 'Gifts & Donations', 'Other',
];

const SYSTEM_PROMPT_TEMPLATE = `You are an expense parser for a personal finance tracker. The user sends WhatsApp messages describing purchases.
Today's date is {DATE} (IST, YYYY-MM-DD format). Current year is {YEAR}.

Respond with ONLY valid JSON — no explanation, no markdown, no extra text:
{
  "isExpense": boolean,
  "expenses": [
    {
      "item": string,
      "category": one of ${JSON.stringify(CATEGORIES)},
      "amount": positive number,
      "date": "YYYY-MM-DD"
    }
  ]
}

RULES:

1. NOT AN EXPENSE
   If the message is not about a purchase, return: { "isExpense": false, "expenses": [] }
   Examples: "ok", "done", "hi", random text without amounts.

2. SINGLE ITEM
   "milk 50" → [{ item: "Milk", category: "Groceries", amount: 50, date: today }]

3. MULTIPLE ITEMS WITH INDIVIDUAL AMOUNTS → one expense object per item
   "coffee 80 snack 100" → two expenses: Coffee ₹80, Snack ₹100
   "uber 230 lunch 150 medicine 400" → three separate expenses
   Each item gets its own row.

4. MULTIPLE ITEMS WITH ONE TOTAL → one combined expense
   "coffee snack 180" → one expense: item = "Coffee & Snack", amount = 180
   "coffee milk biscuits apple 450" → one expense: item = "Groceries" (or best short combined name), amount = 450
   When only a single total is given for multiple items, do NOT try to split — keep as one row.

5. DATE — extract from message if present, otherwise use today {DATE}
   Supported formats:
   - "19 march", "march 19", "19 Mar", "Mar 19" → {YEAR}-03-19
   - "19/3", "19-3" → {YEAR}-03-19
   - "yesterday" → one day before today
   - Day names like "monday" → most recent past occurrence of that day (never today unless today matches and it was clearly meant as past)
   - If the extracted date would be more than 1 day in the future, use the previous year instead
   - Apply the date to ALL items in the message when a single date is mentioned

6. AMOUNTS
   - Must be positive numbers. If no clear amount, return isExpense: false.
   - Handle Indian formats: "1,500" → 1500, "1.5k" → 1500

7. CATEGORIES — pick the best fit from the list. If unsure, use "Other".

8. ITEM NAMES — short and title-cased (e.g. "Milk", "Uber Ride", "Netflix", "Electricity Bill").`;

function buildPrompt(dateStr) {
  const year = dateStr.slice(0, 4);
  return SYSTEM_PROMPT_TEMPLATE.replace(/{DATE}/g, dateStr).replace(/{YEAR}/g, year);
}

function validateExpense(exp) {
  if (!exp.item || typeof exp.item !== 'string') return false;
  if (!CATEGORIES.includes(exp.category)) exp.category = 'Other';
  if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp.date)) return false;
  return true;
}

function validateResponse(parsed) {
  if (typeof parsed.isExpense !== 'boolean') return false;
  if (!parsed.isExpense) return true;
  if (!Array.isArray(parsed.expenses) || parsed.expenses.length === 0) return false;
  return parsed.expenses.every(validateExpense);
}

async function parseExpense(messageText, genAI) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    systemInstruction: buildPrompt(today),
  });

  const result = await model.generateContent(messageText);
  const raw = result.response.text().trim();

  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!validateResponse(parsed)) return null;
  return parsed;
}

module.exports = { parseExpense, validateResponse, validateExpense, buildPrompt, CATEGORIES };
