const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function empty() {
  return { users: [], deposits: [], withdrawals: [], transactions: [], activity: [], settings: {}, reports: [] };
}

let pool = null;
let usePg = false;

async function init() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    usePg = false;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(empty(), null, 2));
    console.log('Database: local file', DB_FILE);
    return;
  }
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  usePg = true;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      full_name TEXT,
      password_hash TEXT,
      role TEXT DEFAULT 'client',
      plan TEXT,
      balance NUMERIC DEFAULT 0,
      pending_balance NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount NUMERIC,
      plan_id TEXT,
      method TEXT,
      reference TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount NUMERIC,
      method TEXT,
      details TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      amount NUMERIC,
      status TEXT,
      description TEXT,
      ref_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      type TEXT,
      detail TEXT,
      user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount NUMERIC,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database: Postgres connected');
}

function fileLoad() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return empty();
  }
}

function fileSave(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name || row.fullName,
    passwordHash: row.password_hash || row.passwordHash,
    role: row.role,
    plan: row.plan,
    balance: Number(row.balance || 0),
    pendingBalance: Number(row.pending_balance != null ? row.pending_balance : (row.pendingBalance || 0)),
    status: row.status,
    createdAt: row.created_at || row.createdAt
  };
}

function mapDep(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    amount: Number(row.amount),
    planId: row.plan_id || row.planId,
    method: row.method,
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function mapWd(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    amount: Number(row.amount),
    method: row.method,
    details: row.details,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function mapTx(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    type: row.type,
    amount: Number(row.amount),
    status: row.status,
    description: row.description,
    refId: row.ref_id || row.refId,
    createdAt: row.created_at || row.createdAt
  };
}

function mapAct(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    detail: row.detail,
    userId: row.user_id || row.userId,
    createdAt: row.created_at || row.createdAt
  };
}

async function getUsers() {
  if (!usePg) return (fileLoad().users || []).map(mapUser);
  const r = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return r.rows.map(mapUser);
}

async function findUserByEmail(email) {
  if (!usePg) return mapUser((fileLoad().users || []).find(u => u.email === email));
  const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  return mapUser(r.rows[0]);
}

async function findUserByUsername(username) {
  if (!usePg) return mapUser((fileLoad().users || []).find(u => u.username === username));
  const r = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  return mapUser(r.rows[0]);
}

async function findUserById(id) {
  if (!usePg) return mapUser((fileLoad().users || []).find(u => u.id === id));
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
  return mapUser(r.rows[0]);
}

async function insertUser(u) {
  if (!usePg) {
    const db = fileLoad();
    db.users.push({
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      passwordHash: u.passwordHash,
      role: u.role,
      plan: u.plan,
      balance: u.balance,
      pendingBalance: u.pendingBalance,
      status: u.status,
      createdAt: u.createdAt
    });
    fileSave(db);
    return;
  }
  await pool.query(
    `INSERT INTO users (id, username, email, full_name, password_hash, role, plan, balance, pending_balance, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [u.id, u.username, u.email, u.fullName, u.passwordHash, u.role, u.plan, u.balance, u.pendingBalance, u.status, u.createdAt]
  );
}

async function saveUser(u) {
  if (!usePg) {
    const db = fileLoad();
    const i = db.users.findIndex(x => x.id === u.id);
    if (i !== -1) {
      db.users[i] = {
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        passwordHash: u.passwordHash,
        role: u.role,
        plan: u.plan,
        balance: u.balance,
        pendingBalance: u.pendingBalance,
        status: u.status,
        createdAt: u.createdAt
      };
      fileSave(db);
    }
    return;
  }
  await pool.query(
    `UPDATE users SET username=$2, email=$3, full_name=$4, password_hash=$5, role=$6, plan=$7,
     balance=$8, pending_balance=$9, status=$10 WHERE id=$1`,
    [u.id, u.username, u.email, u.fullName, u.passwordHash, u.role, u.plan, u.balance, u.pendingBalance, u.status]
  );
}

async function getDeposits(userId) {
  if (!usePg) {
    let list = fileLoad().deposits || [];
    if (userId) list = list.filter(d => d.userId === userId);
    return list.map(mapDep);
  }
  const r = userId
    ? await pool.query('SELECT * FROM deposits WHERE user_id=$1 ORDER BY created_at DESC', [userId])
    : await pool.query('SELECT * FROM deposits ORDER BY created_at DESC');
  return r.rows.map(mapDep);
}

async function findDeposit(id) {
  if (!usePg) return mapDep((fileLoad().deposits || []).find(d => d.id === id));
  const r = await pool.query('SELECT * FROM deposits WHERE id=$1', [id]);
  return mapDep(r.rows[0]);
}

async function insertDeposit(d) {
  if (!usePg) {
    const db = fileLoad();
    db.deposits.push(d);
    fileSave(db);
    return;
  }
  await pool.query(
    `INSERT INTO deposits (id, user_id, amount, plan_id, method, reference, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [d.id, d.userId, d.amount, d.planId, d.method, d.reference, d.status, d.createdAt, d.updatedAt]
  );
}

async function saveDeposit(d) {
  if (!usePg) {
    const db = fileLoad();
    const i = db.deposits.findIndex(x => x.id === d.id);
    if (i !== -1) { db.deposits[i] = d; fileSave(db); }
    return;
  }
  await pool.query(
    `UPDATE deposits SET status=$2, updated_at=$3 WHERE id=$1`,
    [d.id, d.status, d.updatedAt]
  );
}

async function getWithdrawals(userId) {
  if (!usePg) {
    let list = fileLoad().withdrawals || [];
    if (userId) list = list.filter(w => w.userId === userId);
    return list.map(mapWd);
  }
  const r = userId
    ? await pool.query('SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC', [userId])
    : await pool.query('SELECT * FROM withdrawals ORDER BY created_at DESC');
  return r.rows.map(mapWd);
}

async function findWithdrawal(id) {
  if (!usePg) return mapWd((fileLoad().withdrawals || []).find(w => w.id === id));
  const r = await pool.query('SELECT * FROM withdrawals WHERE id=$1', [id]);
  return mapWd(r.rows[0]);
}

async function insertWithdrawal(w) {
  if (!usePg) {
    const db = fileLoad();
    db.withdrawals.push(w);
    fileSave(db);
    return;
  }
  await pool.query(
    `INSERT INTO withdrawals (id, user_id, amount, method, details, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [w.id, w.userId, w.amount, w.method, w.details, w.status, w.createdAt, w.updatedAt]
  );
}

async function saveWithdrawal(w) {
  if (!usePg) {
    const db = fileLoad();
    const i = db.withdrawals.findIndex(x => x.id === w.id);
    if (i !== -1) { db.withdrawals[i] = w; fileSave(db); }
    return;
  }
  await pool.query(
    `UPDATE withdrawals SET status=$2, updated_at=$3 WHERE id=$1`,
    [w.id, w.status, w.updatedAt]
  );
}

async function getTransactions(userId) {
  if (!usePg) {
    let list = fileLoad().transactions || [];
    if (userId) list = list.filter(t => t.userId === userId);
    return list.map(mapTx);
  }
  const r = userId
    ? await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY created_at DESC', [userId])
    : await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
  return r.rows.map(mapTx);
}

async function insertTransaction(t) {
  if (!usePg) {
    const db = fileLoad();
    db.transactions.push(t);
    fileSave(db);
    return;
  }
  await pool.query(
    `INSERT INTO transactions (id, user_id, type, amount, status, description, ref_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [t.id, t.userId, t.type, t.amount, t.status, t.description, t.refId || null, t.createdAt]
  );
}

async function updateTxByRef(refId, status) {
  if (!usePg) {
    const db = fileLoad();
    (db.transactions || []).forEach(t => {
      if (t.refId === refId) t.status = status;
    });
    fileSave(db);
    return;
  }
  await pool.query('UPDATE transactions SET status=$2 WHERE ref_id=$1', [refId, status]);
}

async function getActivity() {
  if (!usePg) return (fileLoad().activity || []).map(mapAct);
  const r = await pool.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 400');
  return r.rows.map(mapAct);
}

async function logActivity(type, detail, userId) {
  const row = {
    id: 'nm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type,
    detail: detail || '',
    userId: userId || null,
    createdAt: new Date().toISOString()
  };
  if (!usePg) {
    const db = fileLoad();
    db.activity = db.activity || [];
    db.activity.unshift(row);
    db.activity = db.activity.slice(0, 400);
    fileSave(db);
    return;
  }
  await pool.query(
    `INSERT INTO activity (id, type, detail, user_id, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [row.id, row.type, row.detail, row.userId, row.createdAt]
  );
}

function mapReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    amount: Number(row.amount || 0),
    note: row.note || '',
    createdAt: row.created_at || row.createdAt
  };
}

async function getReports(userId) {
  if (!usePg) {
    let list = fileLoad().reports || [];
    if (userId) list = list.filter(r => r.userId === userId);
    return list.map(mapReport);
  }
  const r = userId
    ? await pool.query('SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC', [userId])
    : await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
  return r.rows.map(mapReport);
}

async function insertReport(rep) {
  if (!usePg) {
    const dbx = fileLoad();
    dbx.reports = dbx.reports || [];
    dbx.reports.unshift(rep);
    fileSave(dbx);
    return;
  }
  await pool.query(
    `INSERT INTO reports (id, user_id, amount, note, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [rep.id, rep.userId, rep.amount, rep.note, rep.createdAt]
  );
}

async function getSetting(key) {
  if (!usePg) {
    const dbx = fileLoad();
    dbx.settings = dbx.settings || {};
    return dbx.settings[key] || '';
  }
  const r = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return (r.rows[0] && r.rows[0].value) || '';
}

async function setSetting(key, value) {
  if (!usePg) {
    const dbx = fileLoad();
    dbx.settings = dbx.settings || {};
    dbx.settings[key] = value;
    fileSave(dbx);
    return;
  }
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, value]
  );
}

module.exports = {
  init,
  getUsers,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  insertUser,
  saveUser,
  getDeposits,
  findDeposit,
  insertDeposit,
  saveDeposit,
  getWithdrawals,
  findWithdrawal,
  insertWithdrawal,
  saveWithdrawal,
  getTransactions,
  insertTransaction,
  updateTxByRef,
  getActivity,
  logActivity,
  getReports,
  insertReport,
  getSetting,
  setSetting
};
