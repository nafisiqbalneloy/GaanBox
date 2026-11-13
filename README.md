# 🎶 GaanBox

A small web app where people share their favourite songs **along with the story behind them**. Add a song, an artist, a YouTube or Spotify link and a few lines about why it matters, and it appears in your list.

![HTML](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## ✨ Features
- Add a song with its name, artist, listening link and personal story
- Newest songs appear first
- Songs are saved in the browser with `localStorage`, so they are still there after a refresh
- Simple, responsive layout with no build step or dependencies

## 🚀 Run it

No installation needed. Download the project and open `index.html` in your browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 🗂️ Structure

```
├── index.html   # Page layout and form
├── style.css    # Styling
└── app.js       # Add/save/load songs with localStorage
```

## 🔭 Ideas for next steps
- Delete and edit entries
- Escape user input before rendering it as HTML
- A backend and accounts so songs can be shared between people
- Search and filter by artist
