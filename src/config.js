require('dotenv').config();

const REQUIRED_KEYS = [
  'GEMINI_API_KEY',
  'GOOGLE_SHEETS_ID',
  'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  'TARGET_GROUP_JID',
  'ALERT_EMAIL',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
];

function loadConfig() {
  const missing = REQUIRED_KEYS.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    sheetsId: process.env.GOOGLE_SHEETS_ID,
    serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    targetGroupJid: process.env.TARGET_GROUP_JID,
    alertEmail: process.env.ALERT_EMAIL,
    smtpHost: process.env.SMTP_HOST,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    healthPort: parseInt(process.env.HEALTH_PORT || '3000', 10),
  };
}

module.exports = { loadConfig };
