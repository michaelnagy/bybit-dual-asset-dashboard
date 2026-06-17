# Double Calendar Spread Analytics — Implementation Plan

## Goal

Extend the Bybit Dual Asset Chrome extension's **Options tab** to provide:
1. **IV (Implied Volatility) over time** — track markIv for each leg of a double calendar spread
2. **Best day to close** — mark-to-market peak tracking with recommendation heuristic

## Architecture

All changes are in `extension/content.js` and `extension/content.css`. No manifest changes needed (existing permissions already cover `api.bybit.com` and `www.bybit.com`).

---

## Completed

### Phase 1 — Symbol Parser + Double Calendar Detection ✅

**Commit:** `33da97c` — `feat: detect double calendar spreads from open option positions`

- Added `parseOptionSymbol()` — parses Bybit v5 option symbols (e.g. `BTC-27JUN26-100000-C`) into `{base, expiry, expiryDate, strike, type}`
- Added `detectDoubleCalendars(positions)` — groups open positions by `(base, strike)`, validates 4-leg shape: `shortFrontCall`, `longBackCall`, `shortFrontPut`, `longBackPut`
- Added `detectedTrades` field to `optionsDataState`
- Detection runs after every `loadOptionsData()` call
- 15 unit tests passing (parse + detect, edge cases: empty, partial, multiple strikes, different underlyings)

### Phase 1.5 — Endpoint Fix + Always-Run Detection ✅

**Commit:** `4615f80` — `fix: always run double calendar detection and add new position endpoints`

- Moved `detectDoubleCalendars()` call outside if/else so it always runs (even when positions fetch fails)
- Added 2 new position endpoint candidates (`webUnifiedPositionList`, `webPositionList`)
- Added explicit log: `[bybit-overlay] detected double calendars: N trades from M positions`

**Commit:** `e06b267` — `feat: add unified/integrated/v5/queryPositions endpoint candidate`

- Added `webUnifiedIntegratedQueryPositions` as first candidate endpoint (POST `https://www.bybit.com/x-api/unified/integrated/v5/queryPositions`)
- Discovered from network tab analysis of the Bybit options positions page

---

## Pending — Next Steps

### Phase 2 — Fetch IV Data + Persistence

**New endpoint:** `GET https://api.bybit.com/v5/market/tickers?category=option&symbol=...`
- Returns: `markIv`, `bidPrice`, `askPrice`, `markPrice`, `lastPrice`, `delta`, `gamma`, `vega`, `theta`, `openInterest`, etc.
- Mirror the existing spot ticker pattern at `content.js:1667-1686` (parallel `Promise.all`, swallow errors, 10 symbols per call)

**New function:** `fetchOptionTicker(symbols)` — batch fetch IV/greeks for all active trade legs

**Persistence:** New `chrome.storage.local` key `"bybitOptionTradeState"`:
```
{
  trades: { [tradeId]: { base, strike, frontExpiry, backExpiry, legs: {...}, openedAt, status } },
  ivSeries: { [symbol]: [{ ts, markIv, markPrice, midPrice, delta, gamma, vega, theta, underlyingPrice }] },
  pnlSeries: { [tradeId]: [{ ts, pnl, peakPnl, peakTs, daysToFrontExpiry }] },
  settings: { cadence: "1h"|"4h"|"manual", lastSampleTs, retentionDays: 90 }
}
```

**Sampling logic:** `sampleIvForActiveTrades()`
- Collect unique symbols from active trades
- Fetch tickers in batches of 10
- Append IV snapshot per symbol
- Compute per-leg P&L: `(markPrice - entryPrice) * size * direction`
- Track peak P&L (running max)
- Persist to storage (debounced 2s)

**Cadence:** Configurable dropdown (Manual / 1h / 4h, default 1h)
- `setInterval` when cadence ≠ "manual"
- Skip rule: don't re-sample if `now - lastSampleTs < cadenceMs`

### Phase 3 — UI: Trade Cards + IV Chart + P&L Timeline

**Section A — Active Double Calendar Trades** (top of Options tab)
- Card per trade: base, strike, front/back expiries, status badge
- Live mark-to-market P&L + % vs net debit
- Peak P&L + date it was hit
- Countdown to front expiry
- Per-leg IV display (current vs entry)

**Section B — IV Over Time Chart**
- SVG line chart per trade (reuse `buildSvgTimeline` pattern)
- 4 series (1 per leg) + 1 dashed "avg IV" line
- Vertical marker at trade open date

**Section C — Mark-to-Market P&L Timeline**
- Single line chart of trade P&L over time
- Star marker at peak

**Section D — Best Day to Close Recommendation**
- Heuristic badges:
  - `URGENT` (red): `daysToFrontExpiry <= 3`
  - `CONSIDER CLOSING` (yellow): P&L dropped 15%+ from peak
  - `HOLD` (green): within 15% of peak
  - `PROFIT-TAKE ZONE` (bright green): within 5% of peak AND ≤7 days to front expiry

### Phase 4 — Polish

- CSS for new sections (cards, charts, cadence controls)
- Tooltips on chart data points
- Export CSV button for trade history + IV series
- Storage pruning (auto-delete snapshots older than `retentionDays`)
- Edge cases: partial close, front expired, size changes (VWAP recalc)

---

## Key Design Decisions

| Decision | Choice |
|---|---|
| Double calendar structure | 2 calendars at same strike (1 call + 1 put calendar) = 4 legs |
| Grouping key | `(base, strike, frontExpiry, backExpiry)` |
| Best day definition | Mark-to-market peak of the entire trade |
| IV sampling cadence | Configurable: 1h / 4h / manual (default 1h) |
| Options market | Both USDT-margined and coin-margined (auto-detected by symbol) |
| Persistence | `chrome.storage.local` with 90-day retention |
| P&L calculation | `(markPrice - entryPrice) * size * direction` per leg, summed |

## File Reference

| File | Purpose |
|---|---|
| `extension/content.js` | All logic (~2400 lines, single IIFE) |
| `extension/content.css` | Dark-themed overlay styling |
| `extension/manifest.json` | Manifest V3, no changes needed |
| `PLAN.md` | This file |
