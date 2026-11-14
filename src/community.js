import { getEmbedUrl, el } from './helpers.js';
import { showToast } from './toast.js';

/* Community feed: talks to the GaanBox server (see server/index.js). */
/** `onSavedToMine()` is called after a community song is copied into My collection. */
export function initCommunity({ onSavedToMine } = {}) {
  const TOKENS_KEY = 'gaanbox_tokens';   // id -> edit token, for songs I shared
  const CLIENT_KEY = 'gaanbox_client';   // anonymous id used for likes/reports
  const AUTHOR_KEY = 'gaanbox_author';
  const PAGE_SIZE = 10;

  const $ = id => document.getElementById(id);
  const store = {
    get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked */ } },
  };

  let clientId = store.get(CLIENT_KEY, null);
  if (!clientId) {
    clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    store.set(CLIENT_KEY, clientId);
  }

  let page = 1;
  let total = 0;
  let loaded = [];
  let loading = false;
  const expanded = new Set();

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId, ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  /* ---------- tabs ---------- */

  function showTab(name) {
    const community = name === 'community';
    $('tab-mine').hidden = community;
    $('tab-community').hidden = !community;
    $('tab-btn-mine').classList.toggle('active', !community);
    $('tab-btn-community').classList.toggle('active', community);
    $('tab-btn-mine').setAttribute('aria-selected', String(!community));
    $('tab-btn-community').setAttribute('aria-selected', String(community));
    if (community) reload();
  }

  /* ---------- feed ---------- */

  async function reload() {
    page = 1;
    loaded = [];
    await loadPage();
  }

  function showSkeletons(count = 3) {
    const list = $('c-list');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(...Array.from({ length: count }, () => el('div', { class: 'song skeleton', 'aria-hidden': 'true' },
      el('div', { class: 'sk-line sk-title' }), el('div', { class: 'sk-line sk-sub' }),
      el('div', { class: 'sk-line' }), el('div', { class: 'sk-line sk-short' }))));
  }

  async function loadPage() {
    if (loading) return;
    loading = true;
    $('c-status').textContent = 'Loading…';
    if (!loaded.length) showSkeletons();
    try {
      const params = new URLSearchParams({
        q: $('c-search').value, sort: $('c-sort').value, page: String(page), pageSize: String(PAGE_SIZE),
      });
      const data = await api(`/api/songs?${params}`);
      total = data.total;
      loaded = loaded.concat(data.items);
      render();
    } catch (err) {
      $('c-list').replaceChildren(el('p', {
        class: 'empty',
        text: location.protocol === 'file:'
          ? 'The community needs the GaanBox server. Run "npm start" and open http://localhost:3000.'
          : `Could not load the community: ${err.message}`,
      }));
      $('c-status').textContent = '';
      $('c-more').hidden = true;
    } finally {
      loading = false;
      $('c-list').removeAttribute('aria-busy');
    }
  }

  function render() {
    const list = $('c-list');
    list.replaceChildren();
    $('c-status').textContent = total ? `${total} shared song${total === 1 ? '' : 's'}` : '';
    if (!loaded.length) {
      list.appendChild(el('p', { class: 'empty', text: 'Nothing here yet. Be the first to share a song 🎧' }));
    }
    loaded.forEach(song => list.appendChild(card(song)));
    $('c-more').hidden = loaded.length >= total;
  }

  function card(song) {
    const tokens = store.get(TOKENS_KEY, {});
    const mine = Boolean(tokens[song.id]);
    const embed = getEmbedUrl(song.link);
    const open = expanded.has(song.id);

    const likeBtn = el('button', {
      class: 'icon' + (song.likedByMe ? ' active' : ''), type: 'button',
      'aria-label': song.likedByMe ? 'Unlike' : 'Like', title: 'Like',
      text: `${song.likedByMe ? '♥' : '♡'} ${song.likes}`,
      onclick: () => like(song),
    });

    const meta = el('div', { class: 'meta' });
    if (song.mood) meta.appendChild(el('span', { class: 'badge', text: song.mood }));
    meta.appendChild(el('span', { text: `shared by ${song.author}` }));
    meta.appendChild(el('span', { class: 'date', text: new Date(song.createdAt).toLocaleDateString() }));

    const actions = el('div', { class: 'actions' },
      el('a', { href: song.link, target: '_blank', rel: 'noopener noreferrer', text: 'Listen 🎧' }),
      embed ? el('button', {
        class: 'link-btn', type: 'button', text: open ? 'Hide player' : '▶ Play here',
        onclick: () => { open ? expanded.delete(song.id) : expanded.add(song.id); render(); },
      }) : null,
      el('button', { class: 'link-btn', type: 'button', text: '＋ Save to mine', onclick: () => saveToMine(song) }),
      mine
        ? el('button', { class: 'link-btn danger', type: 'button', text: 'Remove my share', onclick: () => unshare(song) })
        : el('button', { class: 'link-btn', type: 'button', text: 'Report', onclick: () => report(song) })
    );

    const node = el('div', { class: 'song' },
      el('div', { class: 'song-head' }, el('h3', { text: `${song.name} — ${song.artist}` }), likeBtn),
      meta, el('p', { class: 'story', text: song.story }), actions);

    if (embed && open) {
      node.appendChild(el('iframe', {
        class: 'player', src: embed, loading: 'lazy', title: `${song.name} player`,
        allow: 'autoplay; encrypted-media; clipboard-write; picture-in-picture', allowfullscreen: '',
      }));
    }
    return node;
  }

  /* ---------- actions ---------- */

  async function like(song) {
    try {
      const updated = await api(`/api/songs/${song.id}/like`, { method: 'POST' });
      Object.assign(song, updated);
      render();
    } catch (err) { showToast(err.message); }
  }

  async function report(song) {
    if (!confirm('Report this song as inappropriate?')) return;
    try {
      await api(`/api/songs/${song.id}/report`, { method: 'POST' });
      showToast('Thanks, we will take a look.');
    } catch (err) { showToast(err.message); }
  }

  async function unshare(song) {
    const tokens = store.get(TOKENS_KEY, {});
    if (!confirm('Remove this song from the community? It stays in your collection.')) return;
    try {
      await api(`/api/songs/${song.id}`, { method: 'DELETE', headers: { 'X-Edit-Token': tokens[song.id] } });
      delete tokens[song.id];
      store.set(TOKENS_KEY, tokens);
      loaded = loaded.filter(s => s.id !== song.id);
      total = Math.max(0, total - 1);
      render();
      showToast('Removed from the community.');
    } catch (err) { showToast(err.message); }
  }

  function saveToMine(song) {
    const mine = store.get('songs', []);
    if (mine.some(s => s.link === song.link && s.name === song.name)) {
      showToast('Already in your collection.');
      return;
    }
    mine.push({
      id: `${Date.now()}`, name: song.name, artist: song.artist, link: song.link,
      story: song.story, mood: song.mood, favorite: false, createdAt: Date.now(),
    });
    store.set('songs', mine);
    showToast('Saved to your collection 💙');
    if (onSavedToMine) onSavedToMine();
  }

  // Called by the "Share" button in My collection
  async function shareToCommunity(song) {
    let author = store.get(AUTHOR_KEY, '');
    if (!author) {
      author = (prompt('What name should we show with your song? (leave empty for Anonymous)') || '').trim();
      if (author) store.set(AUTHOR_KEY, author);
    }
    try {
      const { song: shared, editToken } = await api('/api/songs', {
        method: 'POST',
        body: JSON.stringify({ name: song.name, artist: song.artist, link: song.link, story: song.story, mood: song.mood, author }),
      });
      const tokens = store.get(TOKENS_KEY, {});
      tokens[shared.id] = editToken;
      store.set(TOKENS_KEY, tokens);
      showToast('Shared with the community 🌍');
    } catch (err) {
      showToast(location.protocol === 'file:' ? 'Run "npm start" to share songs.' : err.message);
    }
  }

  /* ---------- wiring ---------- */

  $('tab-btn-mine').addEventListener('click', () => showTab('mine'));
  $('tab-btn-community').addEventListener('click', () => showTab('community'));
  $('c-sort').addEventListener('change', reload);
  $('c-more').addEventListener('click', () => { page += 1; loadPage(); });
  let timer;
  $('c-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 300); });

  return { shareToCommunity };
}
