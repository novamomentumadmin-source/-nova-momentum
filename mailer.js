const ADMIN_NOTIFY = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'novamomentum.admin@gmail.com';
const FROM = process.env.SMTP_FROM || 'Nova Momentum <noreply@novamomentum.com>';

const DEFAULT_SUBJECT = 'Welcome to Nova Momentum';
const DEFAULT_BODY =
  'Welcome to Nova Momentum, {{name}}.\n\n' +
  'Your account is ready.\n\n' +
  'This is the next step:\n' +
  '1. Log in to your dashboard.\n' +
  '2. Choose the plan that matches your start point.\n' +
  '3. Send the plan amount in USDT on Tron (TRC20) only.\n\n' +
  'We set up and manage the agreed operation. You follow progress from your dashboard.\n\n' +
  'If you did not create this account, you can ignore this email.\n\n' +
  'Nova Momentum\nYour Business. Managed For You.';

function canSend() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendMail(to, subject, text) {
  if (!canSend()) {
    console.log('[mail skipped]', subject, 'to', to);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transport.sendMail({ from: FROM, to, subject, text });
  return { sent: true };
}

function fill(template, name) {
  return String(template || DEFAULT_BODY).replace(/\{\{name\}\}/g, name || 'there');
}

async function sendWelcome(user, options) {
  if (!user || !user.email) return { sent: false };
  const subject = (options && options.subject) || DEFAULT_SUBJECT;
  const body = fill((options && options.body) || DEFAULT_BODY, user.fullName);
  return sendMail(user.email, subject, body);
}

async function notifyAdmin(subject, text) {
  return sendMail(ADMIN_NOTIFY, subject, text);
}

module.exports = {
  canSend,
  sendWelcome,
  notifyAdmin,
  DEFAULT_SUBJECT,
  DEFAULT_BODY
};
