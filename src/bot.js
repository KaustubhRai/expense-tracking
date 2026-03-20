const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const { shouldProcess } = require('./filters');
const { parseExpense } = require('./parser');
const { appendExpense } = require('./sheets');
const { sendAlert } = require('./mailer');

const FAILED_LOG = path.join(__dirname, '..', 'failed.jsonl');

async function handleMessage(message, config, genAI, sheetsClient) {
  if (!shouldProcess(message, config.targetGroupJid)) return;

  let parsed;
  try {
    parsed = await parseExpense(message.body, genAI);
  } catch (err) {
    console.error('Gemini error:', err.message);
    await message.reply('Something went wrong, please try again.');
    return;
  }

  if (parsed === null) {
    await message.reply("Couldn't parse that, try: item amount (e.g. milk 20)");
    return;
  }

  if (!parsed.isExpense) return;

  const { expenses } = parsed;
  const failed = [];

  for (const exp of expenses) {
    try {
      await appendExpense(sheetsClient, config.sheetsId, exp, message.body);
    } catch (err) {
      console.error('Sheets error:', err.message);
      failed.push(exp);
    }
  }

  if (failed.length === expenses.length) {
    const entry = JSON.stringify({ expenses, raw: message.body, ts: new Date().toISOString() });
    fs.appendFileSync(FAILED_LOG, entry + '\n');
    await message.reply("Logged locally, couldn't reach the Sheet — will need manual entry.");
    return;
  }

  const saved = expenses.filter(e => !failed.includes(e));

  if (saved.length === 1) {
    const exp = saved[0];
    const dateStr = new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    await message.reply(`Got it — ${exp.item} ₹${exp.amount} under ${exp.category}, ${dateStr} ✓`);
  } else {
    const lines = saved.map(exp => {
      const dateStr = new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      return `• ${exp.item} ₹${exp.amount} · ${exp.category} · ${dateStr}`;
    });
    await message.reply(`Got it — logged ${saved.length} items:\n${lines.join('\n')} ✓`);
  }
}

function createClient(config, transport) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  });

  client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with WhatsApp on your phone.');
  });

  client.on('ready', () => {
    console.log('Expense bot is ready and listening.');
  });

  client.on('auth_failure', async msg => {
    const line = `${new Date().toISOString()} - auth_failure: ${msg}\n`;
    fs.appendFileSync('auth-failures.log', line);
    console.error('Auth failure:', msg);
    sendAlert(
      transport, config.alertEmail,
      'Expense Bot: WhatsApp Auth Failed',
      `Auth failed at ${new Date().toISOString()}.\nRecover: ssh into your server and run: pm2 logs expense-bot\nScan the new QR code shown in the logs.`
    ).catch(e => console.error('Failed to send alert email:', e.message));
  });

  client.on('disconnected', async reason => {
    const line = `${new Date().toISOString()} - disconnected: ${reason}\n`;
    fs.appendFileSync('auth-failures.log', line);
    console.error('Disconnected:', reason);
    sendAlert(
      transport, config.alertEmail,
      'Expense Bot: WhatsApp Disconnected',
      `Disconnected at ${new Date().toISOString()}. Reason: ${reason}.\nPM2 will restart automatically. Check pm2 logs if it doesn't recover.`
    ).catch(e => console.error('Failed to send alert email:', e.message));
  });

  return client;
}

module.exports = { handleMessage, createClient };
