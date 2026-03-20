const nodemailer = require('nodemailer');

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: 587,
    secure: false,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

async function sendAlert(transport, to, subject, text) {
  await transport.sendMail({
    from: `"Expense Bot Alert" <${to}>`,
    to,
    subject,
    text,
  });
}

module.exports = { createTransport, sendAlert };
