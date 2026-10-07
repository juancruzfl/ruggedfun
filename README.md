# ruggedfun.xyz

A play-money memecoin launchpad simulator. See [docs/plan.md](docs/plan.md).

## Setup

```bash
npm install
cp .env.example .env
npm run db:up        # Postgres via docker compose
npm run db:migrate
```

## Run

```bash
npm run dev:engine   # launches tokens, ticks prices, serves Socket.io on :3001
npm run dev:web      # Next.js site on http://localhost:3000
npm run smoke        # in another terminal: connect and print what the engine sends
npm run e2e:trading  # with engine + web running: sign up, buy, sell, and check the error paths
npm run watch:trades # with the engine running: bot trade rate, buy share, callouts
npm run sim:report   # simulate 1,000 tokens and print the fate distribution
npm test
npm run typecheck
```

## Layout

| Path | What |
|---|---|
| `packages/sim` | Fate rolling, price paths, bonding curve. Pure and deterministic. |
| `packages/shared` | Types and Socket.io event contracts shared by engine and web. |
| `packages/db` | Drizzle schema and migrations. |
| `apps/engine` | Long-running market worker + Socket.io server. |
| `apps/web` | Next.js site: onboarding, wallet, front page, search, token page + trading. |
