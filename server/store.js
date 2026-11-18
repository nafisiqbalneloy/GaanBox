'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const REPORT_LIMIT = 3; // songs reported by this many different people are hidden

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artist TEXT NOT NULL,
    link TEXT NOT NULL,
    story TEXT NOT NULL,
    mood TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    token_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    client_hash TEXT NOT NULL,
    PRIMARY KEY (song_id, client_hash)
  );
  CREATE TABLE IF NOT EXISTS reports (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    client_hash TEXT NOT NULL,
    PRIMARY KEY (song_id, client_hash)
  );
  CREATE INDEX IF NOT EXISTS songs_created_idx ON songs(created_at);
`;

// Visible = reported by fewer than REPORT_LIMIT different people.
const VISIBLE = `(SELECT COUNT(*) FROM reports r WHERE r.song_id = s.id) < ${REPORT_LIMIT}`;
const LIKES = '(SELECT COUNT(*) FROM likes l WHERE l.song_id = s.id)';

class Store {
  // file = null keeps everything in memory (used in tests).
  // legacyJson = path of an old songs.json to import once, when the database is empty.
  constructor(file = null, { legacyJson = null } = {}) {
    if (file && file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file || ':memory:');
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.imported = 0;
    if (legacyJson) this.imported = this._importLegacy(legacyJson);
  }

  _importLegacy(jsonFile) {
    if (!fs.existsSync(jsonFile)) return 0;
    if (this.db.prepare('SELECT COUNT(*) AS n FROM songs').get().n > 0) return 0;
    let songs;
    try {
      songs = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    } catch (err) {
      throw new Error(`Could not read ${jsonFile}: ${err.message}`);
    }
    if (!Array.isArray(songs)) return 0;
    const insSong = this.db.prepare(`INSERT OR IGNORE INTO songs
      (id, name, artist, link, story, mood, author, created_at, token_hash) VALUES (?,?,?,?,?,?,?,?,?)`);
    const insLike = this.db.prepare('INSERT OR IGNORE INTO likes (song_id, client_hash) VALUES (?, ?)');
    const insReport = this.db.prepare('INSERT OR IGNORE INTO reports (song_id, client_hash) VALUES (?, ?)');
    let count = 0;
    this._tx(() => {
      for (const s of songs) {
        if (!s || !s.id || !s.name) continue;
        insSong.run(String(s.id), String(s.name), String(s.artist || ''), String(s.link || ''),
          String(s.story || ''), String(s.mood || ''), String(s.author || 'Anonymous'),
          Number(s.createdAt) || Date.now(), String(s.tokenHash || ''));
        for (const h of s.likes || []) insLike.run(String(s.id), String(h));
        for (const h of s.reports || []) insReport.run(String(s.id), String(h));
        count++;
      }
    });
    return count;
  }

  _tx(fn) {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  _public(row, clientId) {
    const likedByMe = clientId
      ? !!this.db.prepare('SELECT 1 FROM likes WHERE song_id = ? AND client_hash = ?').get(row.id, sha256(clientId))
      : false;
    return {
      id: row.id, name: row.name, artist: row.artist, link: row.link, story: row.story,
      mood: row.mood, author: row.author, createdAt: row.created_at,
      likes: row.likes, likedByMe,
    };
  }

  async create(fields) {
    const editToken = crypto.randomBytes(16).toString('hex');
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    this.db.prepare(`INSERT INTO songs (id, name, artist, link, story, mood, author, created_at, token_hash)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, fields.name, fields.artist, fields.link, fields.story,
      fields.mood || '', fields.author, createdAt, sha256(editToken));
    return { song: this._public({ id, ...fields, mood: fields.mood || '', created_at: createdAt, likes: 0 }), editToken };
  }

  list({ q = '', sort = 'newest', page = 1, pageSize = 20, clientId = '' } = {}) {
    const query = q.trim().toLowerCase();
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const current = Math.max(Number(page) || 1, 1);

    const where = [VISIBLE];
    const params = [];
    if (query) {
      where.push('(' + ['name', 'artist', 'story', 'author', 'mood']
        .map(f => `instr(lower(s.${f}), ?) > 0`).join(' OR ') + ')');
      params.push(...Array(5).fill(query));
    }
    const clause = where.join(' AND ');
    const order = sort === 'popular'
      ? `${LIKES} DESC, s.created_at DESC`
      : 's.created_at DESC';

    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM songs s WHERE ${clause}`).get(...params).n;
    const rows = this.db.prepare(`SELECT s.*, ${LIKES} AS likes FROM songs s WHERE ${clause}
      ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, size, (current - 1) * size);
    return { items: rows.map(r => this._public(r, clientId)), total, page: current, pageSize: size };
  }

  _visibleRow(id) {
    return this.db.prepare(`SELECT s.*, ${LIKES} AS likes FROM songs s WHERE s.id = ? AND ${VISIBLE}`).get(id) || null;
  }

  get(id) {
    return this._visibleRow(id);
  }

  async remove(id, editToken) {
    const row = this.db.prepare('SELECT token_hash FROM songs WHERE id = ?').get(id);
    if (!row) return 'not_found';
    if (!editToken || sha256(editToken) !== row.token_hash) return 'forbidden';
    this.db.prepare('DELETE FROM songs WHERE id = ?').run(id);
    return 'ok';
  }

  async toggleLike(id, clientId) {
    if (!this._visibleRow(id)) return null;
    const h = sha256(clientId);
    const removed = this.db.prepare('DELETE FROM likes WHERE song_id = ? AND client_hash = ?').run(id, h);
    if (!removed.changes) this.db.prepare('INSERT INTO likes (song_id, client_hash) VALUES (?, ?)').run(id, h);
    return this._public(this._visibleRow(id), clientId);
  }

  async report(id, clientId) {
    if (!this._visibleRow(id)) return false;
    this.db.prepare('INSERT OR IGNORE INTO reports (song_id, client_hash) VALUES (?, ?)').run(id, sha256(clientId));
    return true;
  }

  close() {
    this.db.close();
  }
}

module.exports = { Store, REPORT_LIMIT };
