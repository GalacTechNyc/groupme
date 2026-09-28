// The phone enters the glasses' code on /connect and lands here. Remember the code
// in a short-lived cookie, then send the phone to GroupMe's sign-in. GroupMe sends
// it back to the app with ?access_token=…, and the app PUTs that to /api/pair.
import { getCache } from '@vercel/functions';
import { GROUPME_CLIENT_ID } from '../../config.js';
import { TTL, PAIR_COOKIE, pairKey, cleanCode, setCookie, redirect } from '../_lib/util.js';

export default async function handler(req, res) {
  const code = cleanCode(req.query?.pair);
  try {
    const record = code.length === 6 ? await getCache().get(pairKey(code)) : null;
    if (!record || record.status !== 'pending') throw new Error('That code is wrong or expired. Make a new one on your glasses.');
    setCookie(res, PAIR_COOKIE, code, TTL);
    redirect(res, `https://oauth.groupme.com/oauth/authorize?client_id=${encodeURIComponent(GROUPME_CLIENT_ID)}`);
  } catch (e) {
    redirect(res, `/connect?code=${encodeURIComponent(code)}&auth_error=${encodeURIComponent(e.message)}`);
  }
}
