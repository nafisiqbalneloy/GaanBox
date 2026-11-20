'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server/index');
const { Store, REPORT_LIMIT } = require('../server/store');
const { validateSong } = require('../server/validate');

const song = (over = {}) => ({
  name: 'Tumi Robe Nirobe', artist: 'Rabindranath', link: 'https://youtu.be/dQw4w9WgXcQ',
  story: 'Played at my grandfather’s house.', mood: '🌙 Calm', author: 'Neloy', ...over,
});

async function withServer(fn, opts = {}) {
  const server = createServer({ store: new Store(), ...opts });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = 'GET', body, headers = {} } = {}) =>
    fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try { await fn(call, base); } finally { server.close(); server.closeAllConnections?.(); }
}

test('validation rejects bad input', () => {
  assert.ok(validateSong(null).error);
  assert.ok(validateSong(song({ link: 'javascript:alert(1)' })).error);
  assert.ok(validateSong(song({ name: '' })).error);
  assert.ok(validateSong(song({ story: 'x'.repeat(601) })).error);
  assert.equal(validateSong(song({ author: '' })).value.author, 'Anonymous');
  assert.equal(validateSong(song({ mood: 'made up' })).value.mood, '');
});

test('share, list and delete a song', async () => {
  await withServer(async call => {
    const created = await call('/api/songs', { method: 'POST', body: song() });
    assert.equal(created.status, 201);
    const { song: s, editToken } = await created.json();
    assert.ok(editToken);
    assert.equal(s.likes, 0);
    assert.equal('tokenHash' in s, false);

    const list = await (await call('/api/songs')).json();
    assert.equal(list.total, 1);
    assert.equal(list.items[0].name, 'Tumi Robe Nirobe');

    assert.equal((await call(`/api/songs/${s.id}`, { method: 'DELETE' })).status, 403);
    assert.equal((await call(`/api/songs/${s.id}`, { method: 'DELETE', headers: { 'X-Edit-Token': 'wrong' } })).status, 403);
    assert.equal((await call(`/api/songs/${s.id}`, { method: 'DELETE', headers: { 'X-Edit-Token': editToken } })).status, 200);
    assert.equal((await (await call('/api/songs')).json()).total, 0);
    assert.equal((await call(`/api/songs/${s.id}`, { method: 'DELETE', headers: { 'X-Edit-Token': editToken } })).status, 404);
  });
});

test('likes toggle per client and popular sort works', async () => {
  await withServer(async call => {
    const a = (await (await call('/api/songs', { method: 'POST', body: song({ name: 'A' }) })).json()).song;
    const b = (await (await call('/api/songs', { method: 'POST', body: song({ name: 'B' }) })).json()).song;

    assert.equal((await call(`/api/songs/${a.id}/like`, { method: 'POST' })).status, 400);
    let res = await (await call(`/api/songs/${b.id}/like`, { method: 'POST', headers: { 'X-Client-Id': 'u1' } })).json();
    assert.equal(res.likes, 1);
    assert.equal(res.likedByMe, true);
    await call(`/api/songs/${b.id}/like`, { method: 'POST', headers: { 'X-Client-Id': 'u2' } });
    res = await (await call(`/api/songs/${b.id}/like`, { method: 'POST', headers: { 'X-Client-Id': 'u1' } })).json();
    assert.equal(res.likes, 1); // u1 un-liked

    const popular = await (await call('/api/songs?sort=popular', { headers: { 'X-Client-Id': 'u2' } })).json();
    assert.equal(popular.items[0].name, 'B');
    assert.equal(popular.items[0].likedByMe, true);
  });
});

test('search and pagination', async () => {
  await withServer(async call => {
    for (let i = 0; i < 25; i++) {
      await call('/api/songs', { method: 'POST', body: song({ name: `Song ${i}`, artist: i === 7 ? 'Unique Band' : 'Common' }) });
    }
    const p1 = await (await call('/api/songs?pageSize=10&page=1')).json();
    const p3 = await (await call('/api/songs?pageSize=10&page=3')).json();
    assert.equal(p1.items.length, 10);
    assert.equal(p3.items.length, 5);
    assert.equal(p1.total, 25);
    const found = await (await call('/api/songs?q=unique')).json();
    assert.equal(found.total, 1);
  }, { rateLimit: false });
});

test('songs reported by enough people are hidden', async () => {
  await withServer(async call => {
    const s = (await (await call('/api/songs', { method: 'POST', body: song() })).json()).song;
    for (let i = 0; i < REPORT_LIMIT; i++) {
      assert.equal((await call(`/api/songs/${s.id}/report`, { method: 'POST', headers: { 'X-Client-Id': `r${i}` } })).status, 200);
    }
    assert.equal((await (await call('/api/songs')).json()).total, 0);
  });
});

test('rate limit, bad JSON, oversized body and unknown routes', async () => {
  await withServer(async (call, base) => {
    const bad = await fetch(base + '/api/songs', { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.equal((await call('/api/songs', { method: 'POST', body: song({ story: 'x'.repeat(20000) }) })).status, 413);

    // the two rejected requests above already count towards the limit of 10 per minute
    for (let i = 0; i < 8; i++) assert.equal((await call('/api/songs', { method: 'POST', body: song() })).status, 201);
    assert.equal((await call('/api/songs', { method: 'POST', body: song() })).status, 429);
    assert.equal((await call('/api/nothing')).status, 404);
    assert.equal((await fetch(base + '/server/store.js')).status, 404); // source files are not served
    assert.equal((await fetch(base + '/')).status, 200);
  });
});

test('data persists to disk (SQLite)', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gaanbox-')), 'gaanbox.db');
  const s1 = new Store(file);
  const { song } = await s1.create({ name: 'X', artist: 'Y', link: 'https://a.b', story: 's', mood: '', author: 'me' });
  await s1.toggleLike(song.id, 'client-1');
  s1.close();
  const s2 = new Store(file);
  const res = s2.list({ clientId: 'client-1' });
  assert.equal(res.total, 1);
  assert.equal(res.items[0].likes, 1);
  assert.equal(res.items[0].likedByMe, true);
  s2.close();
});

test('imports a legacy songs.json once', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaanbox-'));
  const json = path.join(dir, 'songs.json');
  const h = s => crypto.createHash('sha256').update(s).digest('hex');
  fs.writeFileSync(json, JSON.stringify([
    { id: 'a1', name: 'Old song', artist: 'Band', link: 'https://a.b', story: 'story', mood: 'calm',
      author: 'me', createdAt: 1000, likes: [h('c1'), h('c2')], reports: [], tokenHash: h('tok') },
    { id: 'a2', name: 'Hidden', artist: 'Band', link: 'https://a.b', story: 'story', mood: '',
      author: 'me', createdAt: 2000, likes: [], reports: [h('1'), h('2'), h('3')], tokenHash: h('tok2') },
  ]));
  const db = path.join(dir, 'gaanbox.db');
  const s1 = new Store(db, { legacyJson: json });
  assert.equal(s1.imported, 2);
  const res = s1.list();
  assert.equal(res.total, 1); // the heavily reported song stays hidden
  assert.equal(res.items[0].likes, 2);
  assert.equal(await s1.remove('a1', 'tok'), 'ok'); // old edit token still works
  s1.close();
  const s2 = new Store(db, { legacyJson: json }); // second start must not re-import
  assert.equal(s2.imported, 0);
  assert.equal(s2.list().total, 0);
  s2.close();
});

test('serves theme-init.js so the saved theme can be restored under the CSP', async () => {
  await withServer(async (call) => {
    const res = await call('/theme-init.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /gaanbox-theme/);
  });
});

test('serves front-end ES modules from src/ and blocks anything else', async () => {
  await withServer(async (call, base) => {
    const ok = await fetch(base + '/src/main.js');
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/src/missing.js')).status, 404);
    assert.equal((await fetch(base + '/src/package.json')).status, 404);
    assert.equal((await fetch(base + '/src/../server/store.js')).status, 404);
    assert.equal((await fetch(base + '/server/store.js')).status, 404);
  });
});

test('serves PWA manifest, service worker and icons', async () => {
  await withServer(async (call) => {
    const m = await call('/manifest.webmanifest');
    assert.equal(m.status, 200);
    assert.match(m.headers.get('content-type'), /manifest\+json/);
    const manifest = await m.json();
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) assert.equal((await call(icon.src)).status, 200, icon.src);
    const sw = await call('/sw.js');
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type'), /javascript/);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.equal((await call('/icons/icon-512.png')).headers.get('content-type'), 'image/png');
  });
});

test('unknown pages get a branded 404, API paths stay JSON', async () => {
  await withServer(async (call, base) => {
    const page = await call('/nope');
    assert.equal(page.status, 404);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /isn't in the box/);
    const api = await call('/api/nope');
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { error: 'Not found' });
    const post = await fetch(base + '/nope', { method: 'POST' });
    assert.equal(post.status, 404);
  });
});

test('social meta tags use an absolute origin and robots.txt blocks the API', async () => {
  await withServer(async (call, base) => {
    const html = await (await call('/')).text();
    assert.ok(html.includes(`<meta property="og:image" content="${base}/icons/og-image.png" />`));
    assert.ok(!html.includes('__ORIGIN__'));
    const robots = await call('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \/api\//);
    const img = await call('/icons/og-image.png');
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
  });
});

test('accounts: sign up, me, log out, log in', async () => {
  await withServer(async call => {
    const bad = await call('/api/auth/signup', { method: 'POST', body: { username: 'ab', password: 'longenough' } });
    assert.equal(bad.status, 400);
    assert.equal((await call('/api/auth/signup', { method: 'POST', body: { username: 'neloy', password: 'short' } })).status, 400);

    const res = await call('/api/auth/signup', { method: 'POST', body: { username: 'Neloy', password: 'correct horse' } });
    assert.equal(res.status, 201);
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    const body = await res.json();
    assert.equal(body.user.username, 'Neloy');
    assert.equal(JSON.stringify(body).includes('password'), false);
    const cookie = setCookie.split(';')[0];

    const me = await call('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.username, 'Neloy');
    assert.equal((await call('/api/auth/me')).status, 401);
    assert.equal((await call('/api/auth/me', { headers: { Cookie: cookie.slice(0, -2) + 'xx' } })).status, 401);

    const dup = await call('/api/auth/signup', { method: 'POST', body: { username: 'NELOY', password: 'another pass' } });
    assert.equal(dup.status, 409);

    const wrong = await call('/api/auth/login', { method: 'POST', body: { username: 'neloy', password: 'nope nope nope' } });
    const unknown = await call('/api/auth/login', { method: 'POST', body: { username: 'ghost', password: 'nope nope nope' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());

    const login = await call('/api/auth/login', { method: 'POST', body: { username: 'neloy', password: 'correct horse' } });
    assert.equal(login.status, 200);
    assert.ok(login.headers.get('set-cookie').startsWith('gb_session='));

    const out = await call('/api/auth/logout', { method: 'POST' });
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  });
});

test('session tokens expire and reject tampering', () => {
  const auth = require('../server/auth');
  const t = auth.createSession('secret', 'u1', 1000);
  assert.deepEqual(auth.readSession('secret', t, 2000), { userId: 'u1' });
  assert.equal(auth.readSession('other', t, 2000), null);
  assert.equal(auth.readSession('secret', t, 1000 + auth.SESSION_TTL_MS + 1), null);
  assert.equal(auth.readSession('secret', 'garbage'), null);
  assert.ok(auth.verifyPassword('pw-12345', auth.hashPassword('pw-12345')));
  assert.equal(auth.verifyPassword('pw-12346', auth.hashPassword('pw-12345')), false);
});

test('songs shared while signed in belong to the account', async () => {
  await withServer(async call => {
    const signup = async name => {
      const r = await call('/api/auth/signup', { method: 'POST', body: { username: name, password: 'correct horse' } });
      return r.headers.get('set-cookie').split(';')[0];
    };
    const alice = await signup('alice');
    const bob = await signup('bob');

    const posted = await call('/api/songs', { method: 'POST', headers: { Cookie: alice }, body: song({ author: 'Spoofed' }) });
    assert.equal(posted.status, 201);
    const { song: shared, editToken } = await posted.json();
    assert.equal(shared.author, 'alice', 'author comes from the account, not the request');
    assert.equal(shared.ownedByMe, true);

    const asAlice = await (await call('/api/songs', { headers: { Cookie: alice } })).json();
    const asBob = await (await call('/api/songs', { headers: { Cookie: bob } })).json();
    const anon = await (await call('/api/songs')).json();
    assert.equal(asAlice.items[0].ownedByMe, true);
    assert.equal(asBob.items[0].ownedByMe, false);
    assert.equal(anon.items[0].ownedByMe, false);

    // Bob and anonymous visitors cannot delete it; Alice can without the edit token.
    assert.equal((await call(`/api/songs/${shared.id}`, { method: 'DELETE', headers: { Cookie: bob } })).status, 403);
    assert.equal((await call(`/api/songs/${shared.id}`, { method: 'DELETE' })).status, 403);
    assert.equal((await call(`/api/songs/${shared.id}`, { method: 'DELETE', headers: { Cookie: alice } })).status, 200);

    // The edit token still works on its own (e.g. after logging in on another device is not required).
    const again = await (await call('/api/songs', { method: 'POST', headers: { Cookie: alice }, body: song() })).json();
    assert.equal((await call(`/api/songs/${again.song.id}`, { method: 'DELETE', headers: { 'X-Edit-Token': again.editToken } })).status, 200);
    assert.ok(editToken);
  });
});

test('existing databases gain the user_id column', () => {
  const { DatabaseSync } = require('node:sqlite');
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-mig-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE songs (id TEXT PRIMARY KEY, name TEXT NOT NULL, artist TEXT NOT NULL, link TEXT NOT NULL,
    story TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '', author TEXT NOT NULL, created_at INTEGER NOT NULL, token_hash TEXT NOT NULL);
    INSERT INTO songs VALUES ('1','n','a','https://x.y','s','','me',1,'h');`);
  old.close();
  const store = new Store(file);
  assert.equal(store.list().items[0].ownedByMe, false);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
