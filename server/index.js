'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('./store');
const { validateSong } = require('./validate');

const ROOT = path.join(__dirname, '..');
const STATIC = {
  '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css',
  '/app.js': 'app.js', '/theme.js': 'theme.js', '/theme-init.js': 'theme-init.js', '/community.js': 'community.js',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const MAX_BODY = 10 * 1024;

function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { tooLarge = true; chunks.length = 0; return; } // keep draining, reply on 'end'
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Body too large'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || 'null')); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function createServer({ store = new Store(), rateLimit = true } = {}) {
  const limitPosts = createRateLimiter(rateLimit ? 10 : Infinity, 60_000);
  const limitActions = createRateLimiter(rateLimit ? 60 : Infinity, 60_000);

  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'self'", "frame-src https://www.youtube.com https://open.spotify.com",
      "img-src 'self' data:", "style-src 'self'", "script-src 'self'", "connect-src 'self'",
    ].join('; '),
  };

  async function handleApi(req, res, url) {
    const ip = req.socket.remoteAddress || 'unknown';
    const clientId = String(req.headers['x-client-id'] || '').slice(0, 64);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','songs',id,action]

    if (parts[1] === 'health' && req.method === 'GET') return send(res, 200, { ok: true });
    if (parts[1] !== 'songs') return send(res, 404, { error: 'Not found' });

    const id = parts[2];
    const action = parts[3];

    // GET /api/songs
    if (!id && req.method === 'GET') {
      const q = url.searchParams;
      return send(res, 200, store.list({
        q: (q.get('q') || '').slice(0, 100), sort: q.get('sort') || 'newest',
        page: q.get('page'), pageSize: q.get('pageSize'), clientId,
      }));
    }

    // POST /api/songs
    if (!id && req.method === 'POST') {
      if (!limitPosts(ip)) return send(res, 429, { error: 'Too many songs shared, try again in a minute' });
      const { value, error } = validateSong(await readJson(req));
      if (error) return send(res, 400, { error });
      return send(res, 201, await store.create(value));
    }

    if (!id) return send(res, 405, { error: 'Method not allowed' });

    // DELETE /api/songs/:id
    if (!action && req.method === 'DELETE') {
      const result = await store.remove(id, String(req.headers['x-edit-token'] || ''));
      if (result === 'not_found') return send(res, 404, { error: 'Song not found' });
      if (result === 'forbidden') return send(res, 403, { error: 'You can only delete songs you shared' });
      return send(res, 200, { ok: true });
    }

    // POST /api/songs/:id/like | /report
    if ((action === 'like' || action === 'report') && req.method === 'POST') {
      if (!clientId) return send(res, 400, { error: 'X-Client-Id header required' });
      if (!limitActions(ip)) return send(res, 429, { error: 'Slow down a little' });
      if (action === 'like') {
        const song = await store.toggleLike(id, clientId);
        return song ? send(res, 200, song) : send(res, 404, { error: 'Song not found' });
      }
      return (await store.report(id, clientId))
        ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Song not found' });
    }

    return send(res, 405, { error: 'Method not allowed' });
  }

  return http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

      const file = STATIC[url.pathname];
      if (!file || req.method !== 'GET') { res.writeHead(404); return res.end('Not found'); }
      const body = await fs.promises.readFile(path.join(ROOT, file));
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Server error' : err.message });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const dataFile = process.env.DATA_FILE || path.join(ROOT, 'data', 'songs.json');
  createServer({ store: new Store(dataFile) }).listen(port, () => {
    console.log(`GaanBox running at http://localhost:${port}`);
  });
}

module.exports = { createServer };
