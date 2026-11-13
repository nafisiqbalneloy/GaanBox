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
- Everything is saved in the browser with `localStorage`, so it survives refreshes. Songs saved by the first version are migrated automatically.
- Safe rendering: user text is never injected as HTML, and links must be `http(s)`
- Responsive layout, no build step and no dependencies

## 🚀 Run it

Open `index.html` in your browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 🗂️ Structure

```
├── index.html   # Page layout, form, toolbar
├── style.css    # Styling
└── app.js       # Storage, rendering, search/sort, embeds, import/export
```

`app.js` keeps its logic (`getEmbedUrl`, `filterAndSort`, `normalizeSong`, `isValidUrl`) in plain functions, so they can be tested with Node:

```bash
node -e "const a=require('./app.js'); console.log(a.getEmbedUrl('https://youtu.be/dQw4w9WgXcQ'))"
```

## 🔭 Ideas for next steps
- A backend and accounts so songs can be shared between people
- Public "song of the day" page
- Playlists and tags
