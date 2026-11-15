import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUrl, getEmbedUrl, filterAndSort, normalizeSong } from '../src/helpers.js';

test('isValidUrl accepts only http(s) URLs', () => {
  assert.equal(isValidUrl('https://example.com/a'), true);
  assert.equal(isValidUrl('http://example.com'), true);
  assert.equal(isValidUrl('javascript:alert(1)'), false);
  assert.equal(isValidUrl('ftp://example.com'), false);
  assert.equal(isValidUrl('not a url'), false);
  assert.equal(isValidUrl(''), false);
});

test('getEmbedUrl handles YouTube link shapes', () => {
  const id = 'dQw4w9WgXcQ';
  const want = `https://www.youtube.com/embed/${id}`;
  assert.equal(getEmbedUrl(`https://www.youtube.com/watch?v=${id}&t=10`), want);
  assert.equal(getEmbedUrl(`https://m.youtube.com/watch?v=${id}`), want);
  assert.equal(getEmbedUrl(`https://music.youtube.com/watch?v=${id}`), want);
  assert.equal(getEmbedUrl(`https://youtu.be/${id}`), want);
  assert.equal(getEmbedUrl(`https://www.youtube.com/shorts/${id}`), want);
  assert.equal(getEmbedUrl(`https://www.youtube.com/embed/${id}`), want);
  assert.equal(getEmbedUrl('https://youtu.be/short'), null);
  assert.equal(getEmbedUrl('https://www.youtube.com/watch?v=bad'), null);
});

test('getEmbedUrl handles Spotify and rejects other hosts', () => {
  assert.equal(
    getEmbedUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'),
    'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'
  );
  assert.equal(getEmbedUrl('https://open.spotify.com/artist/abc'), null);
  assert.equal(getEmbedUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(getEmbedUrl('nonsense'), null);
});

const songs = [
  { name: 'Zebra', artist: 'Alpha', story: 'rainy day', mood: 'Calm', favorite: false, createdAt: 1 },
  { name: 'apple', artist: 'Charlie', story: 'road trip', mood: '', favorite: true, createdAt: 3 },
  { name: 'Mango', artist: 'bravo', story: 'first dance', favorite: true, createdAt: 2 },
];
const names = list => list.map(s => s.name);

test('filterAndSort sorts by each key and defaults to newest', () => {
  assert.deepEqual(names(filterAndSort(songs)), ['apple', 'Mango', 'Zebra']);
  assert.deepEqual(names(filterAndSort(songs, { sort: 'oldest' })), ['Zebra', 'Mango', 'apple']);
  assert.deepEqual(names(filterAndSort(songs, { sort: 'name' })), ['apple', 'Mango', 'Zebra']);
  assert.deepEqual(names(filterAndSort(songs, { sort: 'artist' })), ['Zebra', 'Mango', 'apple']);
  assert.deepEqual(names(filterAndSort(songs, { sort: 'bogus' })), ['apple', 'Mango', 'Zebra']);
});

test('filterAndSort searches name, artist, story and mood; supports favourites', () => {
  assert.deepEqual(names(filterAndSort(songs, { query: '  RAINY ' })), ['Zebra']);
  assert.deepEqual(names(filterAndSort(songs, { query: 'bravo' })), ['Mango']);
  assert.deepEqual(names(filterAndSort(songs, { query: 'calm' })), ['Zebra']);
  assert.deepEqual(names(filterAndSort(songs, { favoritesOnly: true })), ['apple', 'Mango']);
  assert.deepEqual(filterAndSort(songs, { query: 'nothing matches' }), []);
});

test('normalizeSong trims, clamps and fills defaults', () => {
  const s = normalizeSong({ name: ' Song ', artist: ' Me ', link: 'https://x.com/a', story: ' hi ', favorite: 1 });
  assert.equal(s.name, 'Song');
  assert.equal(s.artist, 'Me');
  assert.equal(s.story, 'hi');
  assert.equal(s.favorite, true);
  assert.equal(s.mood, '');
  assert.ok(s.id && typeof s.createdAt === 'number');

  const long = normalizeSong({ name: 'n'.repeat(200), artist: 'a', link: 'https://x.com', story: 's'.repeat(900) });
  assert.equal(long.name.length, 100);
  assert.equal(long.story.length, 600);

  const kept = normalizeSong({ id: 'abc', name: 'n', artist: 'a', link: 'https://x.com', story: 's', createdAt: 42 });
  assert.equal(kept.id, 'abc');
  assert.equal(kept.createdAt, 42);
});

test('normalizeSong rejects invalid input', () => {
  assert.equal(normalizeSong(null), null);
  assert.equal(normalizeSong('str'), null);
  assert.equal(normalizeSong({ name: 'n', artist: 'a', link: 'javascript:1', story: 's' }), null);
  assert.equal(normalizeSong({ name: '', artist: 'a', link: 'https://x.com', story: 's' }), null);
  assert.equal(normalizeSong({ name: 'n', artist: 'a', link: 'https://x.com', story: '  ' }), null);
});
