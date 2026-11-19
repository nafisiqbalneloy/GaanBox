'use strict';

const crypto = require('node:crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'gb_session';
const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function validateCredentials(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request' };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) return { error: 'Username must be 3-24 letters, numbers or underscores' };
  if (password.length < 8 || password.length > 200) return { error: 'Password must be 8-200 characters' };
  return { value: { username, password } };
}

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

// Token = base64url(JSON {uid, exp}) + "." + HMAC signature.
function createSession(secret, userId, now = Date.now()) {
  const data = Buffer.from(JSON.stringify({ uid: userId, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

function readSession(secret, token, now = Date.now()) {
  const [data, sig] = String(token || '').split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(data, 'base64url').toString());
    return typeof uid === 'string' && exp > now ? { userId: uid } : null;
  } catch (_) { return null; }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionCookie(token, { secure = false } = {}) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}
const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

module.exports = {
  hashPassword, verifyPassword, validateCredentials, createSession, readSession,
  parseCookies, sessionCookie, clearCookie, COOKIE, SESSION_TTL_MS,
};
