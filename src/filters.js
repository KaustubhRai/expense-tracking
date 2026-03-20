const MAX_MESSAGE_LENGTH = 500;

const BOT_REPLY_PREFIXES = [
  'Got it — ',
  "Couldn't parse that",
  'Something went wrong',
  "Logged locally",
];

function shouldProcess(message, targetGroupJid) {
  if (message.type !== 'chat') return false;
  if (!message.body || message.body.length > MAX_MESSAGE_LENGTH) return false;
  const chatId = message.fromMe ? message.to : message.from;
  if (chatId !== targetGroupJid) return false;
  if (message.fromMe && message.deviceType === 'web') return false;
  if (message.fromMe && BOT_REPLY_PREFIXES.some(p => message.body.startsWith(p))) return false;
  return true;
}

module.exports = { shouldProcess };
