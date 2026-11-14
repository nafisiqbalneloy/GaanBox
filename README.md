# 🎶 GaanBox

A small web app where people share their favourite songs **along with the story behind them**. Add a song, an artist, a YouTube or Spotify link and a few lines about why it matters, then browse, search and play your collection.

![HTML](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## ✨ Features
- **Add songs** with name, artist, link, optional mood and the story behind them
- **Play in the page**: YouTube and Spotify links get an embedded player
- **Edit and delete** any entry
- **Favourites**: mark songs with ♥ and filter to show only those
- **Search** across songs, artists, stories and moods, and **sort** by newest, oldest, song or artist
- **Export / import** your collection as a JSON file (backup or move to another browser)
- Input validation, character counter, empty states and toast messages
- **Community**: share a song from your collection with everyone using the server, browse a shared feed, ♥ like, search, sort by newest or most loved, save a song to your own collection, report inappropriate songs, and remove your own shares
- Your personal collection is saved in the browser with `localStorage`, so it survives refreshes. Songs saved by the first version are migrated automatically.
- Safe rendering: user text is never injected as HTML, and links must be `http(s)`
- **Light / dark theme**: follows your system setting, with a toggle in the header that remembers your choice
- Sticky tabs and shimmering skeleton cards while the community feed loads (animation respects `prefers-reduced-motion`)
- Responsive layout, no build step and no dependencies

## 🚀 Run it

**Personal collection only:** open `index.html` in a browser. Everything is stored in your browser.

**With the Community tab:** run the small Node.js server (Node 18+, **no dependencies to install**):

```bash
npm start
# then visit http://localhost:3000
```

Options (environment variables): `PORT` (default `3000`) and `DATA_FILE` (default `data/songs.json`).

## 🧪 Tests

```bash
npm test
```

Covers validation, sharing/deleting, likes, search and pagination, reporting, rate limiting, oversized or invalid requests, and saving to disk.

## 🔌 API

| Method & path | Purpose |
|---|---|
| `GET /api/songs?q=&sort=newest\|popular&page=&pageSize=` | List shared songs (send `X-Client-Id` to get `likedByMe`) |
| `POST /api/songs` | Share a song. Returns the song and a private `editToken` |
| `DELETE /api/songs/:id` | Remove a song, requires the `X-Edit-Token` header |
| `POST /api/songs/:id/like` | Toggle your like (requires `X-Client-Id`) |
| `POST /api/songs/:id/report` | Report a song. Hidden after 3 different reports |
| `GET /api/health` | Health check |

How it stays safe: all input is validated and length-limited, only `http(s)` links are accepted, request bodies are capped at 10 KB, posting and liking are rate limited per IP, edit tokens and like/report identities are stored only as SHA-256 hashes, writes to the data file are atomic, only the page, stylesheet and the `src/*.js` modules are served, and a Content Security Policy is sent with every page.

There are no accounts: you own a shared song through a token kept in your browser. If you clear your browser data you can no longer remove your shares.

## 🗂️ Structure

```
├── index.html        # Page layout: tabs, form, toolbar, community feed
├── style.css         # Styling (design tokens, dark + light themes)
├── theme-init.js     # Applies the saved theme before first paint (no flash)
├── src/              # Front end as native ES modules (no build step)
│   ├── main.js       # Entry point: wires the modules together
│   ├── helpers.js    # Pure helpers (URL check, embeds, search/sort, normalize) + DOM builder
│   ├── collection.js # My collection: storage, rendering, import/export
│   ├── community.js  # Community tab: talks to the API
│   ├── theme.js      # Light/dark theme toggle
│   └── toast.js      # Toast messages
├── server/
│   ├── index.js      # HTTP server, routing, rate limiting, static files
│   ├── store.js      # JSON-file storage
│   └── validate.js   # Input validation
├── test/api.test.js  # Node test runner
└── package.json
```

## 🔭 Ideas for next steps
- Accounts and sign-in instead of browser-held tokens
- Move storage from a JSON file to SQLite or PostgreSQL for larger traffic
- Deploy it (for example on Render or Railway) so the Community tab is public
- "Song of the day", comments, playlists and tags
