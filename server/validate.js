'use strict';

const MOODS = ['😊 Happy', '😢 Sad', '🔥 Energetic', '🌙 Calm', '💘 Romantic', '🧠 Nostalgic'];
const LIMITS = { name: 100, artist: 100, story: 600, author: 40 };

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

const clean = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// Returns { value } or { error }.
function validateSong(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid JSON body' };

  const story = typeof body.story === 'string' ? body.story.trim() : '';
  const value = {
    name: clean(body.name),
    artist: clean(body.artist),
    link: typeof body.link === 'string' ? body.link.trim() : '',
    story,
    mood: MOODS.includes(body.mood) ? body.mood : '',
    author: clean(body.author) || 'Anonymous',
  };

  if (!value.name || !value.artist || !value.story || !value.link) {
    return { error: 'name, artist, link and story are required' };
  }
  for (const [field, max] of Object.entries(LIMITS)) {
    if (value[field].length > max) return { error: `${field} must be at most ${max} characters` };
  }
  if (!isHttpUrl(value.link) || value.link.length > 500) {
    return { error: 'link must be a valid http(s) URL' };
  }
  return { value };
}

module.exports = { validateSong, isHttpUrl, MOODS, LIMITS };
