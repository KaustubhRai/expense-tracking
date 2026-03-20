require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { loadConfig } = require('./src/config');
const { createClient, handleMessage } = require('./src/bot');
const { getClient: getSheetsClient, initSheets } = require('./src/sheets');
const { startHealthServer } = require('./src/health');
const { createTransport } = require('./src/mailer');

async function main() {
  const config = loadConfig();
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const sheetsClient = getSheetsClient(config.serviceAccountKeyPath);
  const transport = createTransport(config);

  startHealthServer(config.healthPort);

  await initSheets(sheetsClient, config.sheetsId);

  const client = createClient(config, transport);
  client.on('message_create', msg => handleMessage(msg, config, genAI, sheetsClient));

  await client.initialize();
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
