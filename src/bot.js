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

  try {
    await appendExpense(sheetsClient, config.sheetsId, parsed, message.body);
  } catch (err) {
    console.error('Sheets error:', err.message);
    const entry = JSON.stringify({ ...parsed, raw: message.body, ts: new Date().toISOString() });
    fs.appendFileSync(FAILED_LOG, entry + '\n');
    await message.reply("Logged locally, couldn't reach the Sheet — will need manual entry.");
    return;
  }

  const dateObj = new Date(parsed.date + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  await message.reply(`Got it — ${parsed.item} ₹${parsed.amount} under ${parsed.category}, ${dateStr} ✓`);
}

function createClient(config, transport) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
