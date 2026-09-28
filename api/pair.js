// Phone pairing, like X Glass:
//   POST            glasses ask for a code (and a secret claim token)
//   GET ?code&claim glasses poll; once the phone has signed in they get the token (once)
//   PUT {token}     the phone, back from GroupMe sign-in, hands over its token for the
//                   code in its gm_pair cookie (set by /api/auth/start)
import crypto from 'node:crypto';
import { getCache } from '@vercel/functions';
import { TTL, PAIR_COOKIE, pairKey, hash, cleanCode, randomCode, seal, unseal, readCookie, setCookie, json } from './_lib/util.js';

export default async function handler(req, res) {
  try {
    const cache = getCache();

    if (req.method === 'POST') {
      let code;
      for (let i = 0; i < 5 && !code; i++) {
        const candidate = randomCode();
        if (!(await cache.get(pairKey(candidate)))) code = candidate;
      }
      if (!code) return json(res, 503, { error: 'Could not make a code. Try again.' });
      const claimToken = crypto.randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + TTL * 1000;
      await cache.set(pairKey(code), { status: 'pending', claimHash: hash(claimToken), expiresAt }, { ttl: TTL });
      const proto = req.headers['x-forwarded-proto'] || 'https';
      return json(res, 200, { code, claimToken, expiresAt, connectUrl: `${proto}://${req.headers.host}/connect` });
    }

    if (req.method === 'GET') {
      const code = cleanCode(req.query?.code);
      const claim = String(req.query?.claim || '');
      if (!code || !claim) return json(res, 400, { error: 'code and claim are required' });
      const record = await cache.get(pairKey(code));
      if (!record) return json(res, 404, { error: 'That code expired. Make a new one.' });
      if (record.claimHash !== hash(claim)) return json(res, 403, { error: 'Wrong claim for this code' });
      if (record.status !== 'ready') return json(res, 200, { ready: false, expiresAt: record.expiresAt });
      const sealed = unseal(record.sealed);
      if (!sealed?.token) return json(res, 500, { error: 'Could not open the sign-in. Make a new code.' });
      await cache.delete(pairKey(code)); // hand the token over once
      return json(res, 200, { ready: true, token: sealed.token, user: record.user || null });
    }

    if (req.method === 'PUT') {
      const code = cleanCode(readCookie(req, PAIR_COOKIE));
      if (!code) return json(res, 200, { paired: false }); // an ordinary sign-in, not a pairing
      setCookie(res, PAIR_COOKIE, '', 0);
      const record = await cache.get(pairKey(code));
      if (!record || record.status !== 'pending')
        return json(res, 410, { paired: false, error: 'That code expired. Make a new one on your glasses.' });
      const token = String((typeof req.body === 'string' ? JSON.parse(req.body) : req.body)?.token || '');
      if (!/^[A-Za-z0-9]{20,}$/.test(token)) return json(res, 400, { paired: false, error: 'Missing GroupMe token' });
      // Only pass on a token GroupMe accepts.
      const me = await fetch('https://api.groupme.com/v3/users/me', { headers: { 'X-Access-Token': token } });
      if (!me.ok) return json(res, 401, { paired: false, error: 'GroupMe didn’t accept that sign-in' });
      const user = (await me.json()).response;
      const ttl = Math.max(30, Math.floor((record.expiresAt - Date.now()) / 1000));
      await cache.set(pairKey(code), { ...record, status: 'ready', sealed: seal({ token }), user: { name: user?.name || '' } }, { ttl });
      return json(res, 200, { paired: true, user: { name: user?.name || '' } });
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'Pairing failed' });
  }
}
