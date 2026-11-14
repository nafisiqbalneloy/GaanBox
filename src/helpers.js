// Pure helpers and a tiny DOM builder shared by all front-end modules.

export function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Returns an embeddable player URL for YouTube / Spotify links, or null.
export function getEmbedUrl(link) {
  if (!isValidUrl(link)) return null;
  const u = new URL(link);
  const host = u.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    let id = u.searchParams.get('v');
    if (!id) {
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/);
      id = m ? m[1] : null;
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
  }
  return null;
}

export function filterAndSort(songs, { query = '', sort = 'newest', favoritesOnly = false } = {}) {
  const q = query.trim().toLowerCase();
  let out = songs.filter(s => {
    if (favoritesOnly && !s.favorite) return false;
    if (!q) return true;
    return [s.name, s.artist, s.story, s.mood || ''].some(f => f.toLowerCase().includes(q));
  });
  const byText = key => (a, b) => a[key].localeCompare(b[key], undefined, { sensitivity: 'base' });
  const sorters = {
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    name: byText('name'),
    artist: byText('artist'),
  };
  return out.sort(sorters[sort] || sorters.newest);
}

// Accepts songs saved by the first version (no id / createdAt) and imported files.
export function normalizeSong(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const artist = String(raw.artist || '').trim();
  const link = String(raw.link || '').trim();
  const story = String(raw.story || '').trim();
  if (!name || !artist || !story || !isValidUrl(link)) return null;
  return {
    id: String(raw.id || `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`),
    name: name.slice(0, 100),
    artist: artist.slice(0, 100),
    link,
    story: story.slice(0, 600),
    mood: String(raw.mood || ''),
    favorite: Boolean(raw.favorite),
    createdAt: Number(raw.createdAt) || Date.now() - (1000 - index),
  };
}

/** Tiny DOM builder: el('a', { class, text, onclick, href }, ...children) */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children.forEach(c => c && node.appendChild(c));
  return node;
}
