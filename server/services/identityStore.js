import crypto from 'node:crypto';
import pg from 'pg';

// Server-owned identity tables; never accept a client-generated verification code.
const pool = new pg.Pool({
  connectionString: process.env.CLEARFLOW_AUTH_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL,
  max: 4,
});
export function authConfigured() {
  return Boolean(process.env.CLEARFLOW_AUTH_SECRET?.length >= 32 &&
    (process.env.CLEARFLOW_AUTH_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL));
}
let ready;
export async function prepareAuth() {
  if (!authConfigured()) throw new Error('Authentication not configured');
  if (!ready) ready = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS clearflow_identity (
      id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer', disabled BOOLEAN NOT NULL DEFAULT FALSE)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clearflow_login_challenges (
      email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clearflow_login_sessions (
      digest TEXT PRIMARY KEY, user_id UUID REFERENCES clearflow_identity(id),
      expires TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT FALSE)`);
  })().catch(error => { ready = null; throw error; });
  return ready;
}
const hash = value => crypto.createHmac('sha256', process.env.CLEARFLOW_AUTH_SECRET)
  .update(value).digest('hex');
export async function issueChallenge(email, send) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  await prepareAuth();
  const prior = await pool.query('SELECT created FROM clearflow_login_challenges WHERE email=$1', [email]);
  if (prior.rows[0] && Date.now() - new Date(prior.rows[0].created).getTime() < 60000) return;
  const code = String(crypto.randomInt(100000, 1000000));
  await pool.query(`INSERT INTO clearflow_login_challenges(email,digest,expires)
    VALUES($1,$2,NOW()+INTERVAL '10 minutes')
    ON CONFLICT(email) DO UPDATE SET digest=$2,expires=NOW()+INTERVAL '10 minutes',
    attempts=0,created=NOW()`, [email, hash(email + ':' + code)]);
  try { await send(email, code); }
  catch (error) {
    await pool.query('DELETE FROM clearflow_login_challenges WHERE email=$1 AND digest=$2',
      [email, hash(email + ':' + code)]);
    throw error;
  }
}
export async function exchangeChallenge(email, code) {
  email = String(email || '').trim().toLowerCase();
  if (!/^\d{6}$/.test(String(code))) return null;
  await prepareAuth();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      'SELECT * FROM clearflow_login_challenges WHERE email=$1 FOR UPDATE', [email])).rows[0];
    const supplied = hash(email + ':' + code);
    const valid = row && row.attempts < 5 && new Date(row.expires).getTime() > Date.now() &&
      crypto.timingSafeEqual(Buffer.from(row.digest, 'hex'), Buffer.from(supplied, 'hex'));
    if (!valid) {
      if (row) await client.query('UPDATE clearflow_login_challenges SET attempts=attempts+1 WHERE email=$1', [email]);
      await client.query('COMMIT');
      return null;
    }
    await client.query('DELETE FROM clearflow_login_challenges WHERE email=$1', [email]);
    await client.query('INSERT INTO clearflow_identity(id,email) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',
      [crypto.randomUUID(), email]);
    const user = (await client.query('SELECT * FROM clearflow_identity WHERE email=$1', [email])).rows[0];
    if (user.disabled) { await client.query('COMMIT'); return null; }
    const token = crypto.randomBytes(32).toString('base64url');
    await client.query(`INSERT INTO clearflow_login_sessions(digest,user_id,expires)
      VALUES($1,$2,NOW()+INTERVAL '12 hours')`, [hash(token), user.id]);
    await client.query('COMMIT');
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function lookupSession(token) {
  if (!authConfigured() || !token) return null;
  await prepareAuth();
  const result = await pool.query(`SELECT u.id,u.email,u.role FROM clearflow_login_sessions s
    JOIN clearflow_identity u ON u.id=s.user_id
    WHERE s.digest=$1 AND s.revoked=FALSE AND s.expires>NOW() AND u.disabled=FALSE`, [hash(token)]);
  return result.rows[0] || null;
}
export async function revokeToken(token) {
  if (!authConfigured() || !token) return;
  await prepareAuth();
  await pool.query('UPDATE clearflow_login_sessions SET revoked=TRUE WHERE digest=$1', [hash(token)]);
}
export async function suspendIdentity(userId) {
  await prepareAuth();
  await pool.query('UPDATE clearflow_identity SET disabled=TRUE WHERE id=$1', [userId]);
  await pool.query('UPDATE clearflow_login_sessions SET revoked=TRUE WHERE user_id=$1', [userId]);
}
