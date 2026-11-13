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

test('data persists to disk', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gaanbox-')), 'songs.json');
  const s1 = new Store(file);
  await s1.create({ name: 'X', artist: 'Y', link: 'https://a.b', story: 's', mood: '', author: 'me' });
  const s2 = new Store(file);
  assert.equal(s2.list().total, 1);
});

test('serves theme-init.js so the saved theme can be restored under the CSP', async () => {
  await withServer(async (call) => {
    const res = await call('/theme-init.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /gaanbox-theme/);
  });
});
