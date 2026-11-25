# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting (the "Report a vulnerability" button under the Security tab) or message the maintainer, @nafisiqbalneloy. You will get a reply within a few days.

## What is already in place

- Passwords are hashed with scrypt and per-user salts.
- Login cookies are signed (HMAC) and set `HttpOnly` and `SameSite=Lax`.
- Rate limits on sign-up/login, sharing songs and likes/reports.
- A strict Content-Security-Policy, `nosniff` and no-referrer headers.
- All database access uses prepared statements.

## For deployers

Set a long random `SESSION_SECRET` in production (see `docs/DEPLOYMENT.md`) and serve the app over HTTPS.
