import crypto from 'node:crypto';

// Pairing codes: no 0/O or 1/I so they're easy to read off the glasses.
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TTL = 600; // seconds a code stays valid
export const PAIR_COOKIE = 'gm_pair';

export const pairKey = (code) => `gm:pair:${code}`;
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const cleanCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);

export function randomCode() {
  return [...crypto.randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Tokens waiting in the cache are encrypted with GM_SECRET.
function key() {
  const secret = process.env.GM_SECRET;
  if (!secret || secret.length < 24) throw new Error('Set GM_SECRET to at least 24 characters');
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function unseal(value) {
  try {
    const buf = Buffer.from(value, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setCookie(res, name, value, maxAge) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}
