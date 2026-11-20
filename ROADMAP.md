# GaanBox Roadmap

- [x] Backend with community feed, likes, reports and API tests
- [x] 1. Design system: CSS variables, modern look, accessible focus states
- [x] 2. Light/dark theme toggle (respect `prefers-color-scheme`)
- [x] 3. Responsive mobile-first pass, sticky header, skeleton loaders, reduced-motion-safe animation
- [x] 4. Refactor front end into native ES modules (`src/`)
- [x] 5. Front-end unit tests for pure logic
- [x] 6. PWA: manifest, icons, service worker (offline "My collection")
- [x] 7. SEO/social meta tags, favicon, 404 page
- [x] 8. SQLite storage via built-in `node:sqlite` (migrate from `songs.json`)
- [x] 9. Accounts: sign up / login (scrypt, signed session cookies)
  - [x] Accounts API: users table, scrypt, signed cookies, tests (#13)
  - [x] Sign-up / login UI and linking shared songs to accounts (#15)
- [ ] 10. Playlists, tags/genres, comments, Song of the day
- [ ] 11. CI (GitHub Actions), Dockerfile, deployment guide, security pass
- [ ] 12. Framework migration to React + Vite + TypeScript (needs `npm install` to work)
- [ ] 13. Ongoing polish: performance, accessibility audit, docs with screenshots
