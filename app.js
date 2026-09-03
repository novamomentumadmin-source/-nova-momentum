/* Nova Momentum — talks to the real server backend */

const API_BASE = ''; // same origin when hosted with server.js

const ADMIN = {
  email: 'novamomentum.admin@gmail.com',
  fullName: 'Site Administrator',
  role: 'admin'
};

const PLANS = {
  launch: { name: 'Launch Starter', price: 100, id: 'launch' },
  essential: { name: 'Essential Launch', price: 500, id: 'essential' },
  foundation: { name: 'Foundation', price: 2000, id: 'foundation' },
  growth: { name: 'Growth', price: 5000, id: 'growth' },
  scale: { name: 'Scale', price: 10000, id: 'scale' },
  professional: { name: 'Professional', price: 15000, id: 'professional' },
  elite: { name: 'Elite', price: 40000, id: 'elite' }
};

function getToken() {
  return localStorage.getItem('nm_token') || '';
}

function getSession() {
  const s = localStorage.getItem('nm_session');
  return s ? JSON.parse(s) : null;
}

function setSession(user, token) {
  if (token) localStorage.setItem('nm_token', token);
  localStorage.setItem('nm_session', JSON.stringify({
    email: user.email,
    fullName: user.fullName,
    role: user.role || 'client',
    plan: user.plan || null,
    id: user.id,
    balance: user.balance || 0,
    pendingBalance: user.pendingBalance || 0,
    status: user.status || 'active'
  }));
}

function clearSession() {
  localStorage.removeItem('nm_session');
  localStorage.removeItem('nm_token');
}

function requireAuth(role) {
  const session = getSession();
  if (!session || !getToken()) {
    window.location.href = role === 'admin' ? 'nm-admin-secure-login.html' : 'login.html';
    return null;
  }
  if (role === 'admin' && session.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return session;
}

async function api(path, options) {
  const opts = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { data = { success: false, message: 'Server error' }; }
  if (!res.ok && !data.message) data.message = 'Request failed';
  return data;
}

function initStorage() {
  /* server is the source of truth */
}

async function handleSignup(formData) {
  const data = await api('/api/signup', { method: 'POST', body: formData });
  if (data.success && data.user) setSession(data.user, data.token);
  return data;
}

async function handleLogin(email, password) {
  const data = await api('/api/login', { method: 'POST', body: { email, password } });
  if (data.success && data.user) setSession(data.user, data.token);
  return Object.assign({ isAdmin: false }, data);
}

async function handleAdminLogin(email, password) {
  const data = await api('/api/admin/login', { method: 'POST', body: { email, password } });
  if (data.success && data.user) setSession(data.user, data.token);
  return data;
}

async function handlePasswordReset(email) {
  return api('/api/password-reset', { method: 'POST', body: { email } });
}

async function updatePassword(email, newPassword) {
  return api('/api/password-reset', { method: 'POST', body: { email, newPassword } });
}

async function getMe() {
  const data = await api('/api/me');
  if (data.success && data.user) setSession(data.user, getToken());
  return data.user || null;
}

async function getUsers() {
  const data = await api('/api/admin/users');
  return data.users || [];
}

async function getDeposits() {
  const data = await api('/api/deposits');
  return data.deposits || [];
}

async function getWithdrawals() {
  const data = await api('/api/withdrawals');
  return data.withdrawals || [];
}

async function getTransactions() {
  const data = await api('/api/transactions');
  return data.transactions || [];
}

async function getActivity() {
  const data = await api('/api/admin/activity');
  return data.activity || [];
}

async function submitDeposit(userId, amount, planId, method, reference) {
  return api('/api/deposits', {
    method: 'POST',
    body: { amount, planId, method, reference }
  });
}

async function submitWithdrawal(userId, amount, method, details) {
  const data = await api('/api/withdrawals', {
    method: 'POST',
    body: { amount, method, details }
  });
  if (data.success && data.user) setSession(data.user, getToken());
  return data;
}

async function approveDeposit(depId) {
  const data = await api('/api/admin/deposits/' + depId + '/approve', { method: 'POST', body: {} });
  return !!data.success;
}

async function rejectDeposit(depId) {
  const data = await api('/api/admin/deposits/' + depId + '/reject', { method: 'POST', body: {} });
  return !!data.success;
}

async function approveWithdrawal(wId) {
  const data = await api('/api/admin/withdrawals/' + wId + '/approve', { method: 'POST', body: {} });
  return !!data.success;
}

async function rejectWithdrawal(wId) {
  const data = await api('/api/admin/withdrawals/' + wId + '/reject', { method: 'POST', body: {} });
  return !!data.success;
}

async function adminUpdateUser(userId, updates) {
  const data = await api('/api/admin/users/' + userId, { method: 'POST', body: updates });
  return !!data.success;
}

async function getUserById(id) {
  if (id === 'admin_001') return { ...ADMIN, id: 'admin_001' };
  const me = getSession();
  if (me && me.id === id) {
    const fresh = await getMe();
    return fresh || me;
  }
  const users = await getUsers();
  return users.find(u => u.id === id);
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function initMobileNav() {
  const toggle = document.querySelector('.mobile-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
}

function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      item.classList.toggle('open');
    });
  });
}

function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initFAQ();
  initHeaderScroll();
  try {
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: location.pathname || '/' })
    }).catch(function() {});
  } catch (e) {}
});

window.getUsers = getUsers;
window.getActivity = getActivity;
window.initStorage = initStorage;
window.getSession = getSession;
window.clearSession = clearSession;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleAdminLogin = handleAdminLogin;
window.handlePasswordReset = handlePasswordReset;
window.updatePassword = updatePassword;
window.adminUpdateUser = adminUpdateUser;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.getUserById = getUserById;
window.getDeposits = getDeposits;
window.getWithdrawals = getWithdrawals;
window.getTransactions = getTransactions;
window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;
window.approveWithdrawal = approveWithdrawal;
window.rejectWithdrawal = rejectWithdrawal;
window.submitDeposit = submitDeposit;
window.submitWithdrawal = submitWithdrawal;
window.getMe = getMe;
window.PLANS = PLANS;
window.ADMIN = ADMIN;
window.requireAuth = requireAuth;
window.api = api;
