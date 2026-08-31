const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const mailer = require('./mailer');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-nova-momentum-secret';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'novamomentum.admin@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
const USDT_WALLET_ENV = process.env.USDT_WALLET || '';
const USDT_NETWORK = process.env.USDT_NETWORK || 'TRC20';
const visitHits = new Map();

const PLANS = {
  essential: { name: 'Essential Launch', price: 500, id: 'essential' },
  foundation: { name: 'Foundation', price: 2000, id: 'foundation' },
  growth: { name: 'Growth', price: 5000, id: 'growth' },
  scale: { name: 'Scale', price: 10000, id: 'scale' },
  professional: { name: 'Professional', price: 15000, id: 'professional' },
  elite: { name: 'Elite', price: 40000, id: 'elite' }
};

function nid() {
  return 'nm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    plan: u.plan,
    balance: Number(u.balance || 0),
    pendingBalance: Number(u.pendingBalance || 0),
    status: u.status || 'active',
    createdAt: u.createdAt
  };
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Please log in.' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.auth = payload;
      if (requiredRole === 'admin' && payload.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin only.' });
      }
      next();
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
  };
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'nova-momentum', time: new Date().toISOString() });
});

app.get('/api/config', wrap(async (req, res) => {
  const saved = await db.getSetting('usdt_wallet');
  res.json({
    success: true,
    usdtWallet: saved || USDT_WALLET_ENV || '',
    usdtNetwork: USDT_NETWORK,
    plans: PLANS
  });
}));

app.post('/api/visit', wrap(async (req, res) => {
  const page = String((req.body || {}).page || 'site').slice(0, 80);
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = ip + '|' + page;
  const now = Date.now();
  const last = visitHits.get(key) || 0;
  if (now - last < 30 * 60 * 1000) {
    return res.json({ success: true, throttled: true });
  }
  visitHits.set(key, now);
  await db.logActivity('visit', 'Visit: ' + page + (ip ? ' from ' + ip : ''), null);
  if (String(process.env.NOTIFY_VISITS || '') === 'true') {
    mailer.notifyAdmin('Nova Momentum visit', 'Someone opened: ' + page).catch(() => {});
  }
  res.json({ success: true });
}));

app.get('/api/plans', (req, res) => res.json({ success: true, plans: PLANS }));

app.post('/api/signup', wrap(async (req, res) => {
  const { username, email, fullName, password, confirmPassword } = req.body || {};
  const mail = String(email || '').toLowerCase().trim();
  const userName = String(username || '').trim().toLowerCase();
  const name = String(fullName || '').trim();
  if (!userName || !mail || !name || !password) {
    return res.status(400).json({ success: false, message: 'Fill in all required fields.' });
  }
  if (mail === ADMIN_EMAIL) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }
  if (confirmPassword && password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }
  if (await db.findUserByEmail(mail)) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
  }
  if (await db.findUserByUsername(userName)) {
    return res.status(400).json({ success: false, message: 'Username is already taken.' });
  }
  const user = {
    id: nid(),
    username: userName,
    email: mail,
    fullName: name,
    passwordHash: bcrypt.hashSync(String(password), 10),
    role: 'client',
    plan: null,
    balance: 0,
    pendingBalance: 0,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  await db.insertUser(user);
  await db.logActivity('register', name + ' (' + mail + ') registered', user.id);
  const welcomeSubject = (await db.getSetting('welcome_subject')) || mailer.DEFAULT_SUBJECT;
  const welcomeBody = (await db.getSetting('welcome_body')) || mailer.DEFAULT_BODY;
  mailer.sendWelcome(user, { subject: welcomeSubject, body: welcomeBody }).catch(() => {});
  mailer.notifyAdmin('New Nova Momentum registration', name + ' registered with ' + mail).catch(() => {});
  res.json({ success: true, token: signToken(user), user: publicUser(user) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const mail = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');
  if (mail === ADMIN_EMAIL) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  const user = await db.findUserByEmail(mail);
  if (!user || !bcrypt.compareSync(password, user.passwordHash || '')) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, message: 'This account is suspended.' });
  }
  await db.logActivity('login', user.fullName + ' (' + user.email + ') logged in', user.id);
  mailer.notifyAdmin('Nova Momentum login', user.fullName + ' logged in (' + user.email + ')').catch(() => {});
  res.json({ success: true, token: signToken(user), user: publicUser(user) });
}));

app.post('/api/admin/login', wrap(async (req, res) => {
  const mail = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');
  if (mail !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }
  const admin = { id: 'admin_001', email: ADMIN_EMAIL, fullName: 'Site Administrator', role: 'admin', plan: null, balance: 0 };
  await db.logActivity('admin_login', 'Admin logged in');
  res.json({ success: true, token: signToken(admin), user: admin });
}));

app.post('/api/password-reset', wrap(async (req, res) => {
  const mail = String((req.body || {}).email || '').toLowerCase().trim();
  const newPassword = String((req.body || {}).newPassword || '');
  if (mail === ADMIN_EMAIL) {
    return res.json({ success: true, message: 'If an account exists, reset instructions were sent.' });
  }
  const user = await db.findUserByEmail(mail);
  if (!user) {
    return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  }
  if (newPassword) {
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.saveUser(user);
    await db.logActivity('password_reset', 'Password updated for ' + mail, user.id);
    return res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  }
  res.json({ success: true, allowReset: true, email: mail, message: 'Account found. Set a new password below.' });
}));

app.get('/api/me', auth(), wrap(async (req, res) => {
  if (req.auth.role === 'admin') {
    return res.json({
      success: true,
      user: { id: 'admin_001', email: ADMIN_EMAIL, fullName: 'Site Administrator', role: 'admin', plan: null, balance: 0, pendingBalance: 0, status: 'active' }
    });
  }
  const user = await db.findUserById(req.auth.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({ success: true, user: publicUser(user) });
}));

app.post('/api/deposits', auth(), wrap(async (req, res) => {
  if (req.auth.role === 'admin') {
    return res.status(400).json({ success: false, message: 'Use the admin panel to manage deposits.' });
  }
  const { amount, planId, method, reference } = req.body || {};
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ success: false, message: 'Select a valid plan.' });
  const payAmount = Number(amount || plan.price);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount.' });
  const user = await db.findUserById(req.auth.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  const dep = {
    id: nid(),
    userId: req.auth.id,
    amount: payAmount,
    planId,
    method: method || 'USDT',
    reference: String(reference || ''),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.insertDeposit(dep);
  await db.insertTransaction({
    id: nid(), userId: req.auth.id, type: 'deposit', amount: payAmount, status: 'pending',
    description: 'Deposit for ' + plan.name, refId: dep.id, createdAt: new Date().toISOString()
  });
  user.pendingBalance = Number(user.pendingBalance || 0) + payAmount;
  await db.saveUser(user);
  await db.logActivity('deposit', 'Deposit submitted: $' + payAmount + ' ' + plan.name, req.auth.id);
  res.json({ success: true, deposit: dep });
}));

app.get('/api/deposits', auth(), wrap(async (req, res) => {
  const list = req.auth.role === 'admin' ? await db.getDeposits() : await db.getDeposits(req.auth.id);
  res.json({ success: true, deposits: list });
}));

app.post('/api/withdrawals', auth(), wrap(async (req, res) => {
  if (req.auth.role === 'admin') {
    return res.status(400).json({ success: false, message: 'Admin cannot request a client withdrawal.' });
  }
  const amount = Number((req.body || {}).amount);
  const method = String((req.body || {}).method || 'USDT');
  const details = String((req.body || {}).details || '');
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Enter a valid amount.' });
  const user = await db.findUserById(req.auth.id);
  if (!user || Number(user.balance || 0) < amount) {
    return res.status(400).json({ success: false, message: 'Insufficient available balance.' });
  }
  const w = {
    id: nid(), userId: req.auth.id, amount, method, details, status: 'pending',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  user.balance = Number(user.balance || 0) - amount;
  user.pendingBalance = Number(user.pendingBalance || 0) + amount;
  await db.saveUser(user);
  await db.insertWithdrawal(w);
  await db.insertTransaction({
    id: nid(), userId: req.auth.id, type: 'withdrawal', amount, status: 'pending',
    description: 'Payout request', refId: w.id, createdAt: new Date().toISOString()
  });
  await db.logActivity('withdrawal', 'Withdrawal requested: $' + amount, req.auth.id);
  res.json({ success: true, withdrawal: w, user: publicUser(user) });
}));

app.get('/api/withdrawals', auth(), wrap(async (req, res) => {
  const list = req.auth.role === 'admin' ? await db.getWithdrawals() : await db.getWithdrawals(req.auth.id);
  res.json({ success: true, withdrawals: list });
}));

app.get('/api/transactions', auth(), wrap(async (req, res) => {
  const list = req.auth.role === 'admin' ? await db.getTransactions() : await db.getTransactions(req.auth.id);
  res.json({ success: true, transactions: list });
}));

app.get('/api/admin/users', auth('admin'), wrap(async (req, res) => {
  res.json({ success: true, users: (await db.getUsers()).map(publicUser) });
}));

app.get('/api/admin/activity', auth('admin'), wrap(async (req, res) => {
  res.json({ success: true, activity: await db.getActivity() });
}));

app.get('/api/admin/welcome-email', auth('admin'), wrap(async (req, res) => {
  res.json({
    success: true,
    subject: (await db.getSetting('welcome_subject')) || mailer.DEFAULT_SUBJECT,
    body: (await db.getSetting('welcome_body')) || mailer.DEFAULT_BODY,
    mailReady: mailer.canSend()
  });
}));

app.post('/api/admin/welcome-email', auth('admin'), wrap(async (req, res) => {
  const subject = String((req.body || {}).subject || mailer.DEFAULT_SUBJECT);
  const body = String((req.body || {}).body || mailer.DEFAULT_BODY);
  await db.setSetting('welcome_subject', subject);
  await db.setSetting('welcome_body', body);
  await db.logActivity('admin_edit', 'Admin updated welcome email');
  res.json({ success: true });
}));

app.post('/api/admin/wallet', auth('admin'), wrap(async (req, res) => {
  const wallet = String((req.body || {}).usdtWallet || '').trim();
  await db.setSetting('usdt_wallet', wallet);
  await db.logActivity('admin_edit', 'Admin updated USDT on Tron wallet');
  res.json({ success: true, usdtWallet: wallet, usdtNetwork: USDT_NETWORK });
}));

app.get('/api/reports', auth(), wrap(async (req, res) => {
  const list = req.auth.role === 'admin' ? await db.getReports() : await db.getReports(req.auth.id);
  res.json({ success: true, reports: list });
}));

app.post('/api/admin/reports', auth('admin'), wrap(async (req, res) => {
  const userId = String((req.body || {}).userId || '');
  const amount = Number((req.body || {}).amount);
  const note = String((req.body || {}).note || 'Revenue generated');
  const addToBalance = (req.body || {}).addToBalance !== false;
  if (!userId || !amount) {
    return res.status(400).json({ success: false, message: 'Choose a client and enter an amount.' });
  }
  const user = await db.findUserById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  const rep = {
    id: nid(),
    userId,
    amount,
    note,
    createdAt: new Date().toISOString()
  };
  await db.insertReport(rep);
  if (addToBalance) {
    user.balance = Number(user.balance || 0) + amount;
    await db.saveUser(user);
  }
  await db.insertTransaction({
    id: nid(),
    userId,
    type: 'report',
    amount,
    status: 'completed',
    description: note,
    refId: rep.id,
    createdAt: new Date().toISOString()
  });
  await db.logActivity('report', 'Reported $' + amount + ' for ' + user.email + ' — ' + note, userId);
  res.json({ success: true, report: rep, user: publicUser(user) });
}));

app.post('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  const user = await db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  const updates = req.body || {};
  if (updates.balance !== undefined) user.balance = Number(updates.balance) || 0;
  if (updates.pendingBalance !== undefined) user.pendingBalance = Number(updates.pendingBalance) || 0;
  if (updates.plan !== undefined) user.plan = updates.plan || null;
  if (updates.status !== undefined) user.status = updates.status;
  if (updates.fullName) user.fullName = String(updates.fullName);
  if (updates.newPassword) {
    if (String(updates.newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    user.passwordHash = bcrypt.hashSync(String(updates.newPassword), 10);
  }
  await db.saveUser(user);
  await db.logActivity('admin_edit', 'Admin updated user ' + user.email, user.id);
  res.json({ success: true, user: publicUser(user) });
}));

app.post('/api/admin/deposits/:id/approve', auth('admin'), wrap(async (req, res) => {
  const dep = await db.findDeposit(req.params.id);
  if (!dep) return res.status(404).json({ success: false, message: 'Deposit not found.' });
  if (dep.status !== 'approved') {
    dep.status = 'approved';
    dep.updatedAt = new Date().toISOString();
    await db.saveDeposit(dep);
    const user = await db.findUserById(dep.userId);
    if (user) {
      user.balance = Number(user.balance || 0) + Number(dep.amount);
      user.pendingBalance = Math.max(0, Number(user.pendingBalance || 0) - Number(dep.amount));
      if (dep.planId) user.plan = dep.planId;
      await db.saveUser(user);
    }
    await db.updateTxByRef(dep.id, 'completed');
    await db.logActivity('deposit_approved', 'Approved deposit $' + dep.amount, dep.userId);
  }
  res.json({ success: true, deposit: dep });
}));

app.post('/api/admin/deposits/:id/reject', auth('admin'), wrap(async (req, res) => {
  const dep = await db.findDeposit(req.params.id);
  if (!dep) return res.status(404).json({ success: false, message: 'Deposit not found.' });
  dep.status = 'rejected';
  dep.updatedAt = new Date().toISOString();
  await db.saveDeposit(dep);
  const user = await db.findUserById(dep.userId);
  if (user) {
    user.pendingBalance = Math.max(0, Number(user.pendingBalance || 0) - Number(dep.amount));
    await db.saveUser(user);
  }
  await db.updateTxByRef(dep.id, 'rejected');
  await db.logActivity('deposit_rejected', 'Rejected deposit $' + dep.amount, dep.userId);
  res.json({ success: true, deposit: dep });
}));

app.post('/api/admin/withdrawals/:id/approve', auth('admin'), wrap(async (req, res) => {
  const w = await db.findWithdrawal(req.params.id);
  if (!w) return res.status(404).json({ success: false, message: 'Withdrawal not found.' });
  w.status = 'approved';
  w.updatedAt = new Date().toISOString();
  await db.saveWithdrawal(w);
  const user = await db.findUserById(w.userId);
  if (user) {
    user.pendingBalance = Math.max(0, Number(user.pendingBalance || 0) - Number(w.amount));
    await db.saveUser(user);
  }
  await db.updateTxByRef(w.id, 'completed');
  await db.logActivity('withdrawal_approved', 'Approved withdrawal $' + w.amount, w.userId);
  res.json({ success: true, withdrawal: w });
}));

app.post('/api/admin/withdrawals/:id/reject', auth('admin'), wrap(async (req, res) => {
  const w = await db.findWithdrawal(req.params.id);
  if (!w) return res.status(404).json({ success: false, message: 'Withdrawal not found.' });
  w.status = 'rejected';
  w.updatedAt = new Date().toISOString();
  await db.saveWithdrawal(w);
  const user = await db.findUserById(w.userId);
  if (user) {
    user.balance = Number(user.balance || 0) + Number(w.amount);
    user.pendingBalance = Math.max(0, Number(user.pendingBalance || 0) - Number(w.amount));
    await db.saveUser(user);
  }
  await db.updateTxByRef(w.id, 'rejected');
  await db.logActivity('withdrawal_rejected', 'Rejected withdrawal $' + w.amount, w.userId);
  res.json({ success: true, withdrawal: w });
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const clean = req.path.replace(/\/$/, '') || '/index';
  const name = clean.endsWith('.html') ? clean.slice(1) : clean.slice(1) + '.html';
  const file = path.join(__dirname, name);
  if (fs.existsSync(file)) return res.sendFile(file);
  if (req.path === '/' ) return res.sendFile(path.join(__dirname, 'index.html'));
  next();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error.' });
});

db.init().then(() => {
  app.listen(PORT, () => console.log('Nova Momentum running on port ' + PORT));
}).catch((e) => {
  console.error('Failed to start database', e);
  process.exit(1);
});
