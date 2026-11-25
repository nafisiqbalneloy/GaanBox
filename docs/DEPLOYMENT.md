# Deployment guide

GaanBox has no npm dependencies, so all it needs is Node 22 or newer.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DATA_FILE` | `data/gaanbox.db` | SQLite database file |
| `SESSION_SECRET` | random per start | Signs login cookies. Set a long random value in production, otherwise everyone is logged out on each restart |
| `PUBLIC_URL` | from the request | Public address used in social-share tags, e.g. `https://gaanbox.example.com` |

## Run directly

```sh
SESSION_SECRET="$(openssl rand -hex 32)" PORT=8080 node server/index.js
```

## Run with Docker

```sh
docker build -t gaanbox .
docker run -d -p 3000:3000 -v gaanbox-data:/data \
  -e SESSION_SECRET="$(openssl rand -hex 32)" gaanbox
```

The `gaanbox-data` volume keeps songs and accounts across container restarts.

## Behind HTTPS

Put the app behind a reverse proxy such as Caddy or nginx that terminates HTTPS and forwards to the port above, and set `PUBLIC_URL` to the public address.

## Backups

Copy the SQLite file (`DATA_FILE`) while the app is stopped, or use `sqlite3 gaanbox.db ".backup backup.db"`.
