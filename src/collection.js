import { isValidUrl, getEmbedUrl, filterAndSort, normalizeSong, el } from './helpers.js';
import { showToast } from './toast.js';

const STORAGE_KEY = 'songs';

function loadSongs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSong).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function saveSongs(songs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch (_) {
    showToast('Could not save: browser storage is full or blocked.');
  }
}

/* ---------- UI ---------- */

/** Wires up the "My collection" tab. `onShare(song)` is called by the Share button. */
export function initCollection({ onShare }) {
  let songs = [];
  let editingId = null;
  let favoritesOnly = false;
  const expanded = new Set();

  const $ = id => document.getElementById(id);
  const els = {
    form: $('song-form'), title: $('form-title'), name: $('song-name'), artist: $('song-artist'),
    link: $('song-link'), mood: $('song-mood'), story: $('song-story'), count: $('char-count'),
    error: $('form-error'), submit: $('submit-btn'), cancel: $('cancel-edit'),
    search: $('search'), sort: $('sort'), favBtn: $('fav-filter'),
    total: $('count'), list: $('song-list'), exportBtn: $('export-btn'), importFile: $('import-file'),
  };

  function render() {
    const visible = filterAndSort(songs, {
      query: els.search.value, sort: els.sort.value, favoritesOnly,
    });
    els.list.replaceChildren();

    els.total.textContent = songs.length
      ? `Showing ${visible.length} of ${songs.length} song${songs.length === 1 ? '' : 's'}`
      : '';

    if (!visible.length) {
      els.list.appendChild(el('p', {
        class: 'empty',
        text: songs.length ? 'No songs match your search.' : 'No songs yet. Add the first one above 🎧',
      }));
      return;
    }

    visible.forEach(song => els.list.appendChild(renderSong(song)));
  }

  function renderSong(song) {
    const embed = getEmbedUrl(song.link);
    const isOpen = expanded.has(song.id);

    const head = el('div', { class: 'song-head' },
      el('h3', { text: `${song.name} — ${song.artist}` }),
      el('button', {
        class: 'icon' + (song.favorite ? ' active' : ''),
        type: 'button', 'aria-label': song.favorite ? 'Remove from favorites' : 'Add to favorites',
        title: 'Favorite', text: song.favorite ? '♥' : '♡',
        onclick: () => toggleFavorite(song.id),
      })
    );

    const meta = el('div', { class: 'meta' });
    if (song.mood) meta.appendChild(el('span', { class: 'badge', text: song.mood }));
    meta.appendChild(el('span', { class: 'date', text: new Date(song.createdAt).toLocaleDateString() }));

    const actions = el('div', { class: 'actions' },
      el('a', { href: song.link, target: '_blank', rel: 'noopener noreferrer', text: 'Listen 🎧' }),
      embed ? el('button', {
        class: 'link-btn', type: 'button', text: isOpen ? 'Hide player' : '▶ Play here',
        onclick: () => { isOpen ? expanded.delete(song.id) : expanded.add(song.id); render(); },
      }) : null,
      el('button', {
        class: 'link-btn', type: 'button', text: '🌍 Share',
        onclick: () => onShare(song),
      }),
      el('button', { class: 'link-btn', type: 'button', text: 'Edit', onclick: () => startEdit(song.id) }),
      el('button', { class: 'link-btn danger', type: 'button', text: 'Delete', onclick: () => removeSong(song.id) })
    );

    const card = el('div', { class: 'song' }, head, meta, el('p', { class: 'story', text: song.story }), actions);

    if (embed && isOpen) {
      card.appendChild(el('iframe', {
        class: 'player', src: embed, loading: 'lazy', title: `${song.name} player`,
        allow: 'autoplay; encrypted-media; clipboard-write; picture-in-picture', allowfullscreen: '',
      }));
    }
    return card;
  }

  /* ----- actions ----- */

  function toggleFavorite(id) {
    const s = songs.find(x => x.id === id);
    if (!s) return;
    s.favorite = !s.favorite;
    saveSongs(songs);
    render();
  }

  function removeSong(id) {
    const s = songs.find(x => x.id === id);
    if (!s || !confirm(`Delete "${s.name}"?`)) return;
    songs = songs.filter(x => x.id !== id);
    expanded.delete(id);
    if (editingId === id) resetForm();
    saveSongs(songs);
    render();
    showToast('Song deleted.');
  }

  function startEdit(id) {
    const s = songs.find(x => x.id === id);
    if (!s) return;
    editingId = id;
    els.name.value = s.name; els.artist.value = s.artist; els.link.value = s.link;
    els.mood.value = s.mood; els.story.value = s.story;
    els.title.textContent = 'Edit song';
    els.submit.textContent = 'Save changes';
    els.cancel.hidden = false;
    updateCount();
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.name.focus();
  }

  function resetForm() {
    editingId = null;
    els.form.reset();
    els.title.textContent = 'Add a song';
    els.submit.textContent = 'Add Song';
    els.cancel.hidden = true;
    els.error.textContent = '';
    updateCount();
  }

  function updateCount() {
    els.count.textContent = els.story.value.length;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const data = {
      name: els.name.value.trim(), artist: els.artist.value.trim(),
      link: els.link.value.trim(), story: els.story.value.trim(), mood: els.mood.value,
    };

    if (!data.name || !data.artist || !data.link || !data.story) {
      els.error.textContent = 'Please fill in all the fields.';
      return;
    }
    if (!isValidUrl(data.link)) {
      els.error.textContent = 'Please enter a valid link starting with http:// or https://';
      els.link.focus();
      return;
    }
    els.error.textContent = '';

    if (editingId) {
      const s = songs.find(x => x.id === editingId);
      Object.assign(s, data);
      showToast('Song updated ✏️');
    } else {
      songs.push(normalizeSong({ ...data, id: `${Date.now()}`, createdAt: Date.now() }));
      showToast('Thank you hooman! 💙');
    }
    saveSongs(songs);
    resetForm();
    render();
  }

  function exportSongs() {
    const blob = new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'gaanbox-songs.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importSongs(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('not a list');
        const incoming = parsed.map(normalizeSong).filter(Boolean);
        const seen = new Set(songs.map(s => s.id));
        const fresh = incoming.filter(s => !seen.has(s.id));
        songs = songs.concat(fresh);
        saveSongs(songs);
        render();
        showToast(`Imported ${fresh.length} song${fresh.length === 1 ? '' : 's'}.`);
      } catch (_) {
        showToast('That file is not a valid GaanBox export.');
      }
    };
    reader.readAsText(file);
  }

  /* ----- wiring ----- */

  els.form.addEventListener('submit', handleSubmit);
  els.cancel.addEventListener('click', resetForm);
  els.story.addEventListener('input', updateCount);
  els.search.addEventListener('input', render);
  els.sort.addEventListener('change', render);
  els.favBtn.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    els.favBtn.setAttribute('aria-pressed', String(favoritesOnly));
    els.favBtn.classList.toggle('active', favoritesOnly);
    render();
  });
  els.exportBtn.addEventListener('click', exportSongs);
  els.importFile.addEventListener('change', e => {
    if (e.target.files[0]) importSongs(e.target.files[0]);
    e.target.value = '';
  });

  songs = loadSongs();
  saveSongs(songs); // migrate songs from the first version to the new format
  render();

  return { refresh() { songs = loadSongs(); render(); } };
}
