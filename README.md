# Letterboxd Watchlist Picker

Single-page web app that picks a random film from a public Letterboxd watchlist with Genre/Decade/Min Rating filters.

## Setup

1. Copy `.env.example` to `.env.local` and fill in `TMDB_API_KEY`.
2. `npm install`
3. `npm run dev`

## Deploy (Vercel)

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add a Vercel KV store to the project (Storage → Create → KV) — env vars are wired automatically.
4. Add `TMDB_API_KEY` to Project Settings → Environment Variables.
5. Deploy.

## Tests

```bash
npm run test       # Vitest
npm run test:e2e   # Playwright
npm run typecheck
```
