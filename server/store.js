'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const REPORT_LIMIT = 3; // songs reported by this many different people are hidden

class Store {
  // file = null keeps everything in memory (used in tests)
  constructor(file = null) {
    this.file = file;
    this.songs = [];
    if (file && fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(parsed)) this.songs = parsed;
      } catch (err) {
        throw new Error(`Could not read ${file}: ${err.message}`);
      }
    }
    this._writing = Promise.resolve();
  }

  _persist() {
    if (!this.file) return Promise.resolve();
    const data = JSON.stringify(this.songs);
    const tmp = `${this.file}.tmp`;
    // serialise writes; write to a temp file then rename so a crash never corrupts data
    this._writing = this._writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, this.file);
    }).catch(err => console.error('Failed to save data:', err.message));
    return this._writing;
  }

  _public(song, clientId) {
    return {
      id: song.id, name: song.name, artist: song.artist, link: song.link, story: song.story,
      mood: song.mood, author: song.author, createdAt: song.createdAt,
      likes: song.likes.length,
      likedByMe: clientId ? song.likes.includes(sha256(clientId)) : false,
    };
  }

  _visible() {
    return this.songs.filter(s => s.reports.length < REPORT_LIMIT);
  }

  async create(fields) {
    const editToken = crypto.randomBytes(16).toString('hex');
    const song = {
      id: crypto.randomUUID(), ...fields, createdAt: Date.now(),
      likes: [], reports: [], tokenHash: sha256(editToken),
    };
    this.songs.push(song);
    await this._persist();
    return { song: this._public(song), editToken };
  }

  list({ q = '', sort = 'newest', page = 1, pageSize = 20, clientId = '' } = {}) {
    const query = q.trim().toLowerCase();
    let items = this._visible().filter(s =>
      !query || [s.name, s.artist, s.story, s.author, s.mood].some(f => f.toLowerCase().includes(query)));

    const sorters = {
      newest: (a, b) => b.createdAt - a.createdAt,
      popular: (a, b) => b.likes.length - a.likes.length || b.createdAt - a.createdAt,
    };
    items = items.sort(sorters[sort] || sorters.newest);

    const total = items.length;
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const current = Math.max(Number(page) || 1, 1);
    const slice = items.slice((current - 1) * size, current * size);
    return { items: slice.map(s => this._public(s, clientId)), total, page: current, pageSize: size };
  }

  get(id) {
    return this._visible().find(s => s.id === id) || null;
  }

  async remove(id, editToken) {
    const song = this.songs.find(s => s.id === id);
    if (!song) return 'not_found';
    if (!editToken || sha256(editToken) !== song.tokenHash) return 'forbidden';
    this.songs = this.songs.filter(s => s.id !== id);
    await this._persist();
    return 'ok';
  }

  async toggleLike(id, clientId) {
    const song = this.get(id);
    if (!song) return null;
    const h = sha256(clientId);
    const i = song.likes.indexOf(h);
    if (i === -1) song.likes.push(h); else song.likes.splice(i, 1);
    await this._persist();
    return this._public(song, clientId);
  }

  async report(id, clientId) {
    const song = this.get(id);
    if (!song) return false;
    const h = sha256(clientId);
    if (!song.reports.includes(h)) song.reports.push(h);
    await this._persist();
    return true;
  }
}

module.exports = { Store, REPORT_LIMIT };
