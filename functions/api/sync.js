// Time Ledger sync API — Cloudflare Pages Function at /api/sync
// Needs: a D1 database bound as DB, and a secret SYNC_KEY (Settings → Variables and Secrets).
//
// Data is a set of small items (one per time entry, plan day, habit month, settings).
// Each write carries the device's change time (ct); the newest change wins per item.
// Every stored change gets a server sequence number (st), so devices pull "everything after st N".

const MAX_ITEMS = 300;
const MAX_BODY = 200 * 1024;
const KEY_RE = /^[a-z]{1,8}:[A-Za-z0-9:_\-.]{1,180}$/;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS items (key TEXT PRIMARY KEY, body TEXT, ct INTEGER NOT NULL, st INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS items_st ON items(st)'),
  ]);
  schemaReady = true;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.SYNC_KEY) return json({ error: 'not_configured', message: 'Add a SYNC_KEY secret in the Cloudflare project settings, then redeploy.' }, 503);
  if (!env.DB) return json({ error: 'no_database', message: 'Bind a D1 database as DB in the Cloudflare project settings, then redeploy.' }, 503);

  const auth = request.headers.get('Authorization') || '';
  if (!(await sameSecret(auth, 'Bearer ' + env.SYNC_KEY))) return json({ error: 'unauthorized' }, 401);

  let req;
  try { req = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const items = Array.isArray(req.items) ? req.items : [];
  const since = Number.isFinite(req.since) ? req.since : -1;
  if (items.length > MAX_ITEMS) return json({ error: 'too_many_items', max: MAX_ITEMS }, 400);

  const db = env.DB;
  await ensureSchema(db);

  // 1. apply this device's changes (newer change time wins)
  const stmts = [];
  for (const it of items) {
    if (!it || typeof it.key !== 'string' || !KEY_RE.test(it.key)) return json({ error: 'bad_key', key: String(it && it.key).slice(0, 60) }, 400);
    const ct = Math.floor(Number(it.ct));
    if (!Number.isFinite(ct) || ct < 0) return json({ error: 'bad_ct', key: it.key }, 400);
    const deleted = it.deleted ? 1 : 0;
    const body = deleted ? null : String(it.body ?? '');
    if (body && body.length > MAX_BODY) return json({ error: 'item_too_large', key: it.key }, 413);
    stmts.push(db.prepare(
      `INSERT INTO items (key, body, ct, deleted, st) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(st), 0) + 1 FROM items))
       ON CONFLICT(key) DO UPDATE SET body = excluded.body, ct = excluded.ct, deleted = excluded.deleted, st = excluded.st
       WHERE excluded.ct >= items.ct`
    ).bind(it.key, body, ct, deleted));
  }
  if (stmts.length) await db.batch(stmts);

  // 2. send back everything changed after `since` (skip when since < 0: push only)
  if (since < 0) return json({ ok: true, applied: stmts.length });
  const LIMIT = 1000;
  const { results } = await db.prepare('SELECT key, body, ct, deleted, st FROM items WHERE st > ?1 ORDER BY st LIMIT ?2').bind(since, LIMIT + 1).all();
  const more = results.length > LIMIT;
  const out = more ? results.slice(0, LIMIT) : results;
  return json({ items: out, now: out.length ? out[out.length - 1].st : since, more });
}
