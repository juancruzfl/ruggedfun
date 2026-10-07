# ruggedfun.xyz — Project Plan

A play-money memecoin launchpad simulator. Tokens launch constantly, and each one is assigned a hidden fate
(rug, slow death, survive, or moon) with probabilities based on real memecoin statistics. Users get a mock
wallet, trade fake SOL, and compete on a leaderboard.

> **All data is fake.** No real money, no real chain, no cashable value. Footer disclaimer on every page:
> "Simulation only. Not financial advice. Nothing here has real value."

---

## 1. Goals & Non-Goals

### Goals (v1)
- Username onboarding → mock wallet created automatically
- Front page modeled on real launchpads: search bar (top), left nav, trending section, hot callouts (bottom)
- Realistic token lifecycles driven by real-world fate probabilities
- Buy/sell tokens from three entry points: front-page token widget, live feed, search
- Live feed of trades (real users + simulated bot traders)
- Leaderboard shared across all users

### Non-Goals (v1)
- **Token launcher**: the nav item is shown but disabled ("Coming soon")
- Real wallets, real chains, real money, payments of any kind
- Auth beyond a username (no passwords/email in v1)
- Mobile apps (responsive web only)

---

## 2. Tech Stack

The leaderboard and live feed have to be **shared across users**, so the market runs on the server and
every user sees the same tokens and prices.

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript** | Routing, SSR for token pages, easy Vercel deploy |
| Styling | **Tailwind CSS v4** | Fast to build a dense, dark launchpad UI (hand-rolled components so far; add shadcn/ui if they get heavy) |
| Charts | **TradingView `lightweight-charts`** | Free, real candlestick look |
| Client state | **Zustand** | Live prices, wallet, UI state |
| Realtime | **Socket.io** (WebSockets) | Push price ticks + trade feed to all clients |
| Simulation worker | **Node.js + TypeScript** (long-running process) | Launches tokens, advances prices, runs bot traders |
| Database | **Postgres** (Supabase or Neon) | Users, wallets, positions, trades, tokens, leaderboard |
| Hot cache | **Redis** (optional, phase 2+) | Live prices of active tokens, pub/sub fan-out |
| ORM | **Drizzle** or Prisma | Typed schema + migrations |
| Hosting | Vercel (frontend) + Railway/Fly.io (worker + socket server) | Vercel can't run long-lived processes |
| Monorepo | **npm workspaces** | Share types and simulation code between web and worker (pnpm not installed; easy to switch later) |

### Repo layout
```
ruggedfun/
├── apps/
│   ├── web/            # Next.js frontend
│   └── engine/         # Simulation worker + Socket.io server
├── packages/
│   ├── sim/            # Pure price/fate generation (seeded, deterministic, unit-tested)
│   ├── db/             # Drizzle schema, migrations, queries
│   └── shared/         # Shared types, constants, socket event contracts
└── docs/
    └── plan.md
```

---

## 3. Simulation Engine

### 3.1 Fate table (tunable config in `packages/sim/config.ts`)

Starting values are based on public pump.fun stats (~1% graduation rate; most launches show
pump-and-dump/rug behavior). **Check these against current sources before launch** and keep them in
config so they're easy to tune.

| Fate | Probability | Price behavior |
|---|---|---|
| `rug` | ~20% | Small pump, then a -95% to -99% drop in one candle at a random time |
| `slow_death` | ~75% | Brief pump, then bleeds toward ~0 over minutes to hours |
| `survive` | ~4% | Choppy, ends between 0.5x and 2x |
| `moon` | ~1% | Peak multiple drawn from a Pareto (power-law) distribution, can reach 100x+ |

### 3.2 Price generation
- On launch: roll the fate, generate `seed` and fate params (`rugAt`, `peakMultiple`, `volatility`, `lifespan`)
- Each tick (1s): `price *= exp(drift(fate, t) + vol * gaussian(rng))`, plus jump events (rug)
- Seeded RNG (`seedrandom`), so a token's path can be regenerated from its seed
- **The fate and seed never leave the server.** Clients only receive prices.

### 3.3 Price impact from user trades
- Each token has a virtual **bonding curve** (constant product, like pump.fun) holding fake SOL/token reserves
- User buys/sells move the price along the curve, then the fate-driven drift keeps going on top of that
- A rug drains the fake liquidity: sells after a rug fill at ~0

### 3.4 Token launches
- The engine launches a new token every **5–20s** (random)
- Name/ticker generated from word lists (animals, memes, celebrity-adjacent nonsense, suffixes like "INU", "AI", "CAT")
- Image: DiceBear avatar seeded by ticker (later: pre-generated image pool)
- Fake metadata: creator handle, description, socials icons (non-functional)

### 3.5 Bot traders
- Simulated traders buy/sell to make the market feel alive
- Bot activity follows the fate: heavy buying early, then a dev wallet dump on a rug
- Bot trades go into the live feed with generated handles (shown with a small "bot" tag, or not, depending on taste)

### 3.6 Lifecycle
- Token states: `live` → `rugged` | `dead` | `graduated`
- Dead/rugged tokens drop off the front page after N minutes but stay searchable
- Candles for tokens dead more than 24h get pruned (can be regenerated from the seed if needed)

---

### 3.7 Engine implementation notes (milestone 2)
- **Price = fate multiple × bonding-curve spot price.** The fate path moves the multiple; player and bot
  trades (milestones 5–6) move the curve, so their impact stacks on top of the fate.
- **Clock-driven:** each token's tick = seconds since `created_at`, so timer drift and restarts don't skew paths.
- **Restarts:** live tokens are reloaded and replayed from their seed + fate. The fate is always rolled
  (even when forced) so a token's path depends only on its seed and fate.
- **Candles:** 5s and 1m candles are stored (flushed every 5s). 1s candles are not stored; clients
  build them from `token:tick`. 5s candles are pruned a day after a token ends, 1m after a week.
- **Statuses:** `live` → `rugged` at the rug tick, `graduated` when price crosses the graduation price,
  otherwise the fate's end status when the sim finishes. `ended_at` marks when a token stops trading.
- **Bootstrap:** on an empty database, the engine creates `BOOTSTRAP_TOKENS` backdated tokens so the site isn't empty.
- **Snapshot event:** clients get every still-trading token on connect (added to the realtime contract below).

## 4. User Flow

### 4.1 First visit / onboarding
1. User opens the site → full-screen modal: **"Pick a username"**
2. Validation: 3–16 chars, `[a-zA-Z0-9_]`, blocklist, unique ignoring case (rules in `packages/shared`, used by both client and server)
3. On submit:
   - Create the `user` row
   - Create the **mock wallet**: fake address (`Rug...` + random base58) with a starting balance (e.g. **10 SOL**)
   - Return a session token stored in an httpOnly cookie (`rf_session`, 1 year). Only its sha256 hash is stored.
   - The layout reads the session on the server, so the page renders signed-in with no loading flash
4. Modal closes and a short "Wallet created — 10 SOL loaded" toast appears
5. Returning users are recognized by the cookie. If the cookie is lost, the account is gone. That's acceptable for v1.

### 4.2 Optional wallet features
- "Get more SOL" faucet: refill to 10 SOL if balance < 0.1 SOL, max once per hour (keeps broke users playing)
- Wallet panel: balance, open positions, PnL, trade history

---

## 5. Front Page Layout

Modeled on pump.fun / similar launchpads. Dark theme, dense, lots of motion.

```
┌───────────────────────────────────────────────────────────────────────┐
│ 💊 ruggedfun  Home  Live Feed  Leaderboard  Launch·SOON  [🔍 Search…] [wallet] │  ← Top bar + nav
├───────────────────────────────────────────────────────────────────────┤
│  🔥 TRENDING                                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│  │token │ │token │ │token │ │token │ │token │ │token │  →            │
│  │card  │ │card  │ │card  │ │card  │ │card  │ │card  │               │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘               │
│                                                                       │
│  NEW LAUNCHES / ALL TOKENS (grid, sortable)                           │
│  [card] [card] [card] [card]                                          │
│  [card] [card] [card] [card]                                          │
├───────────────────────────────────────────────────────────────────────┤
│ 🌶 HOT: $PEPEAI +840% • xX_deg_Xx just aped 5 SOL into $MOONCAT •     │  ← Hot callouts
│ 💀 $DOGWIF2 RUGGED -98% • $BONKER graduated! • ...  (scrolling ticker) │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.1 Top bar
- **Search**: fuzzy match on token name and ticker (`$` prefix optional), dropdown of results with
  image, ticker, price, 5m change. Enter or click → token page.
- Wallet chip: username, SOL balance, click → wallet panel

### 5.2 Navigation (in the top bar)
- Home · **Live Feed** · **Leaderboard** · **Token Launcher** (visible but disabled, "SOON" badge)
- Active page gets a green underline on the bar's bottom edge
- Narrower screens drop extras first: link icons and the username below 1280px, the wordmark on tablets
- Phones: links move to a bottom tab bar above the callout ticker
- (Was a left sidebar until it was moved into the top bar.)

### 5.3 Trending section
- Horizontal carousel of the top ~10 tokens by a trending score
  (e.g. 5m volume × buyer count × price change, with a recency boost)
- **Token card/widget**: image, name, `$TICKER`, market cap, 5m % change (green/red), mini sparkline,
  bonding-curve progress bar, **[Buy]** quick button
- Clicking the card opens the token page. Clicking **[Buy]** opens the quick-buy modal.

### 5.4 Token grid
- Tabs: **New** | **About to graduate** | **Top market cap** | **Rugged 💀** (a graveyard tab adds to the fun)
- Same card component as trending, updates live

### 5.5 Hot callouts (bottom)
- Scrolling ticker of events: big pumps, big buys, rugs, graduations, leaderboard changes
- Each item is clickable → token page or user profile

---

### 5.6 Front page implementation notes (milestone 4)
- Market caps are shown in dollars using a fixed fake rate (`SOL_USD = 150` in `packages/shared`): launch ≈ $4.2K, graduation ≈ $62K.
- The engine sends each token's 5m change and a 5-minute sparkline (one sample per 10s); the browser keeps sampling after that.
- Trending uses momentum + size with an age decay (`trendingScore` in `packages/shared`). Once trades exist, switch it to 5m volume × unique buyers.
- The New / Graduating / Top tabs are built in the browser from the live snapshot. Only the Rugged tab and search hit the database.
- Card [Buy] buttons currently open the token page. Milestone 5 turns them into the quick-buy modal.

## 6. Buying & Selling

### 6.1 Three entry points
1. **Front-page token widget** → [Buy] quick-buy modal, or click the card → token page
2. **Live feed**: each trade row ("degen42 bought 2 SOL of $CATAI") has a [Buy] button next to the token
3. **Search** → pick a result → token page

### 6.2 Token page (`/token/[ticker]`)
- Candlestick chart (1s / 5s / 1m intervals)
- Stats: price, market cap, holders, volume, bonding-curve progress, age
- **Trade panel**: Buy/Sell tabs, SOL amount input, presets (0.1 / 0.5 / 1 / max), estimated tokens out,
  slippage note
- Token-specific trade feed
- Holder list (fake + real users)

### 6.3 Quick-buy modal
- Lightweight version of the trade panel for buying without leaving the page

### 6.4 Trade execution (server-authoritative)
1. Client sends `{ tokenId, side, amountSol }` over HTTP POST (not the socket, so it's simpler to validate)
2. Server validates balance and token state, computes the fill against the bonding curve, and writes
   the trade + position + balance in **one DB transaction**
3. Server broadcasts the trade to the live feed + token room via Socket.io
4. Client updates the wallet optimistically, then reconciles with the server response

### 6.5 Rug moments
- A user holding a token when it rugs gets a full-screen "💀 RUGGED" moment (screen shake, sound, shareable loss card)
- A moon gets the matching celebration ("📈 You 47x'd $FROGAI")

---

### 6.7 Trading implementation notes (milestone 5)
- **The engine fills every trade.** It owns the live curve, so `POST /api/trade` (Next.js) checks the session and
  forwards to the engine's `POST /internal/trade`, guarded by `ENGINE_SECRET`. Trades run one at a time.
- **One transaction per trade:** wallet balance (row-locked), position (average cost basis), trade row and the
  token's curve. The live market is only updated after it commits.
- **Pricing:** `quoteTrade` in `packages/sim` converts SOL to curve units by dividing by the fate multiple.
  The browser uses the same function with the live price and curve, so quotes match fills.
- **Slippage:** the browser sends its quoted average price; fills worse by more than 10% are rejected.
- **Rules:** no buys after a rug or once the curve is complete; sells allowed until the token stops trading.
  After that, positions are stuck at their last price (≈ 0 for rugs).
- **Known quirk:** liquidity scales with the fate multiple, so a token that has bled to 0.03x is cheap to pump,
  and a player can push it to "graduated". Revisit when bots trade in milestone 6.
- **Deferred:** the holder list and holder count (more meaningful once bots trade).

## 7. Live Feed (`/feed`)
- Real-time stream of every trade (users + bots), newest on top, capped at ~200 rows in the DOM
- Row: avatar, username, BUY/SELL, SOL amount, token image + ticker, time ago, **[Buy]** button
- Filters: All | Buys | Sells | Big trades (>1 SOL) | Rugs/graduations
- Pause-on-hover so users can click without the list jumping

---

### 7.1 Bot implementation notes (milestone 6)
- **Bots don't move the curve.** The fate path already *is* the aggregate of everyone else's trading, so bot
  trades are the visible flow behind it: recorded at the current price, counted in volume, candles, trending
  and the feed, but they don't touch reserves. Only players move the curve. This keeps the fate odds intact.
- **Flow model** (`apps/engine/src/bots.ts`, `BOT_TUNING`): each token attracts trades by youth, 5-second
  momentum and size; buys lean with momentum (15–85%); sizes are log-normal (median 0.3 SOL, capped at 50).
  A global budget (`BOT_TRADES_PER_SECOND`, default 6) caps the total.
- **Dev:** the creator buys 0.5–3 SOL right after launch and dumps ~15% of the ATH market cap at the rug
  (shown as "RUG" with a DEV badge). Restored and backdated tokens don't get a dev buy.
- **After a rug:** only small panic sells. Dead tokens get no trades.
- **Callouts:** bot buys ≥ 5 SOL (🐋) and player buys ≥ 0.5 SOL (👤) go to the hot ticker.
- **Storage:** bot trades are batched into the 5-second flush; they're pruned a day after their token ends.
  Player trades are kept for the leaderboard.
- **Labels:** players get a PLAYER badge, creators a DEV badge; bots are unlabeled (resolves the open question).
- **Trending** now uses 5m volume (log-scaled) × momentum, decaying with age.
- `npm run watch:trades` prints the live bot rate, buy share and callouts.

## 8. Leaderboard (`/leaderboard`)
- Tabs (shareable URLs, `?tab=`): **All-time PnL** | **24h PnL** | **Biggest win** | **💀 Wall of shame**
- Top 3 on a podium, then ranks 4–100. Your row is highlighted, or pinned under a "⋮" if you're below 100
- Only players who have traded appear (on the wall of shame: only players who've been rugged)

### 8.1 Definitions
- **Net worth** = SOL balance + positions at the last stored price (dead/rugged tokens keep their final price)
- **All-time PnL** = net worth − 10 SOL starting balance
- **24h PnL** = net worth − the newest snapshot at least 24h old (or 10 SOL for younger accounts).
  The engine snapshots every player's net worth every 10 minutes and keeps 48 hours of them
- **Win rate** = share of a player's sells with positive realized PnL (average-cost basis)
- **Biggest win** = the single most profitable sell, with its multiple
- **Wall of shame** = SOL of cost basis held in tokens at the moment they rugged. The engine records every
  holder at the rug tick (`rug_victims`), including rugs replayed after a restart

### 8.2 Implementation notes (milestone 7)
- Rankings are computed by SQL in the web app and cached for 30 seconds per instance (the plan said the
  engine; the web app was simpler since it's read-only). The page refreshes itself every 30 seconds.
- Player profits ≥ 0.5 SOL make the hot ticker ("💰 degen42 took +1.20 SOL on $FROG (2.4x)").
- Trades from before this milestone have no realized PnL, so they don't count toward win rate or biggest win.

---

## 9. Token Launcher (not in v1)
- Nav item and `/launch` route show a "Coming soon" placeholder
- Future: user picks name/ticker/image and pays fake SOL; the token gets a fate rolled exactly like system tokens

---

## 10. Data Model (Postgres)

```sql
users        (id, username UNIQUE, session_hash, created_at)
wallets      (user_id PK/FK, address, sol_balance NUMERIC, last_faucet_at)
tokens       (id, name, ticker UNIQUE, image_url, description, creator_handle,
              seed, fate, fate_params JSONB,          -- server-only, never exposed
              status, sol_reserve, token_reserve,     -- bonding curve
              created_at, ended_at)
candles      (token_id, interval, ts, open, high, low, close, volume,  PK(token_id, interval, ts))
trades       (id, token_id, user_id NULL, bot_handle NULL, side, sol_amount,
              token_amount, price, created_at)
positions    (user_id, token_id, token_amount, cost_basis_sol, PK(user_id, token_id))
```

Indexes: `trades(created_at DESC)`, `trades(token_id, created_at DESC)`, `tokens(status, created_at DESC)`,
trigram index on `tokens(name, ticker)` for search.

---

## 11. Realtime Contract (Socket.io)

| Event | Room | Payload |
|---|---|---|
| `snapshot` | the connecting client | every still-trading token |
| `token:launched` | `global` | token summary |
| `token:tick` | `global` (batched, 1/s) | `[{ id, price, mcap, change5m }]` |
| `token:candle` | `token:{id}` | latest candle |
| `trade` | `global`, `token:{id}` | trade row (milestone 5) |
| `token:status` | `global` | `{ id, status, endedAt }` |
| `callout` | `global` | hot-callout ticker item |

Clients join `token:{id}` only on that token's page, to save bandwidth.

---

## 12. API (Next.js route handlers, or on the engine)

```
POST /api/users              { username } → creates user + wallet, sets cookie
GET  /api/me                 → user, wallet, positions
GET  /api/tokens?tab=new|trending|graduating|top|rugged
GET  /api/tokens/search?q=
GET  /api/tokens/:ticker     → token detail + recent candles
POST /api/trade              { tokenId, side, amountSol }
GET  /api/leaderboard?tab=
POST /api/faucet
```

---

## 13. Anti-Cheat Basics
- The fate, seed and future prices are **never** sent to the client
- All trades are validated and filled on the server against the current curve state
- Rate-limit trades and username creation per IP (signups: 5/hour per IP, in-memory; move to Redis when running more than one web instance). The IP comes from `x-forwarded-for`, which clients can fake unless a proxy (e.g. Vercel) overwrites it: don't expose the web app directly
- Profanity filter on usernames

---

## 14. Milestones

| # | Milestone | Done when |
|---|---|---|
| 0 | Repo setup | ✅ Monorepo, TS, Vitest, Postgres (docker compose) + Drizzle migrations. Still to do: lint, Tailwind (with web app) |
| 1 | `packages/sim` | ✅ Fate rolling + price paths are deterministic and unit-tested; a script plots 1,000 tokens and the fate distribution matches config. Run `npm run report -w @ruggedfun/sim` |
| 2 | Engine | ✅ Worker launches tokens, ticks prices, writes candles, broadcasts over Socket.io. Restores live tokens on restart. `npm run smoke` checks it |
| 3 | Onboarding + wallet | ✅ Username modal, wallet created (10 SOL), session cookie, wallet chip + dropdown |
| 4 | Front page | ✅ Search (name/ticker, trigram index), left nav (bottom tabs on mobile), trending row, New / About to graduate / Top market cap / Rugged tabs, hot-callouts ticker, all live over Socket.io. Placeholder token, feed and leaderboard pages |
| 5 | Token page + trading | ✅ Market-cap chart (1s/5s/1m, log scale, volume), trade panel, quick-buy modal, server-side fills through the engine, positions + PnL in the wallet panel. `npm run e2e:trading` checks it |
| 6 | Bot traders + live feed | ✅ Bot order flow (~6 trades/s, follows momentum), dev buy at launch and dev dump at the rug, whale callouts, volume-based trending, `/feed` with filters, pause-on-hover and [Buy] buttons |
| 7 | Leaderboard | ✅ All-time PnL, 24h PnL, Biggest win, Wall of shame; top-3 podium, ranks to 100, your row pinned below that; refreshes every 30s |
| 8 | Polish | Rug/moon moments, sounds, mobile layout, disclaimer, launcher placeholder |
| 9 | Deploy | Vercel + Railway/Fly + Supabase/Neon, domain ruggedfun.xyz |

---

## 15. Open Questions
- Starting balance and faucet rules (10 SOL? hourly refill?)
- Do accounts need recovery (email/passkey) later, or is the cookie enough?
- Leaderboard reset cadence (never / weekly seasons)?
- Final fate probabilities, once checked against current pump.fun data
