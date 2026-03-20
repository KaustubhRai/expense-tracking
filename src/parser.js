const CATEGORIES = [
  'Groceries', 'Food & Dining', 'Transport', 'Travel',
  'Health & Medical', 'Fitness', 'Personal Care', 'Shopping',
  'Home & Maintenance', 'Subscriptions', 'Utilities',
  'Education', 'Entertainment', 'Gifts & Donations', 'Other',
];

const SYSTEM_PROMPT_TEMPLATE = `You are an expense parser. The user sends short messages describing purchases.
Today's date is {DATE} (IST).

Extract the expense details and respond with ONLY valid JSON matching this schema — no explanation, no markdown, no extra text:

{
  "isExpense": boolean,
  "item": string | null,
  "category": one of ${JSON.stringify(CATEGORIES)} | null,
  "amount": positive number | null,
  "date": "YYYY-MM-DD" | null
}

Rules:
- If the message is not an expense (e.g. "ok", "done", random text), return { "isExpense": false, "item": null, "category": null, "amount": null, "date": null }.
- For relative dates: "yesterday" = today minus 1 day. Day names (e.g. "monday") = the most recent past occurrence of that day, never today even if today is that day (treat same-day references as last week to avoid ambiguity).
- Amount must be a positive number. If no clear amount is present, set isExpense to false.
- Category must be one of the values listed above. If unsure, use "Other".
- Item should be short and title-cased (e.g. "Milk", "Uber Ride", "Electricity Bill").`;

function buildPrompt(dateStr) {
  return SYSTEM_PROMPT_TEMPLATE.replace('{DATE}', dateStr);
}

function validateResponse(parsed) {
  if (typeof parsed.isExpense !== 'boolean') return false;
  if (!parsed.isExpense) return true;
  if (!parsed.item || typeof parsed.item !== 'string') return false;
  if (!CATEGORIES.includes(parsed.category)) {
    parsed.category = 'Other'; // category is always recoverable; "Other" is a safe fallback
  }
  if (typeof parsed.amount !== 'number' || parsed.amount <= 0) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return false;
  return true;
}

async function parseExpense(messageText, genAI) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    systemInstruction: buildPrompt(today),
  });

  const result = await model.generateContent(messageText);
  const raw = result.response.text().trim();

  // Strip markdown code fences in case model ignores the no-markdown instruction
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

module.exports = { parseExpense, validateResponse, buildPrompt, CATEGORIES };
