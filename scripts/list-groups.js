require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'list-groups' }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above to authenticate.');
});

client.on('ready', () => {
  console.log('\n✅ Ready! Now send any message from your Expenses WhatsApp group.');
  console.log('The JID will be printed here. Then press Ctrl+C.\n');
});

client.on('message', msg => {
  if (msg.from.endsWith('@g.us')) {
    console.log('---');
    console.log(`JID:  ${msg.from}`);
    console.log(`From: ${msg._data.senderPn || msg.author || 'you'}`);
    console.log(`Text: ${msg.body}`);
    console.log('---');
    console.log(`\nPaste this into .env: TARGET_GROUP_JID=${msg.from}\n`);
  } else {
    console.log(`(Direct message from ${msg.from} — not a group, ignoring)`);
  }
});

client.initialize().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
