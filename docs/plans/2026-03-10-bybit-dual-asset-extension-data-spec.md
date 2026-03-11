# Bybit Dual Asset Extension Data Spec

> Local planning/reference notes only. Do not commit this file.

**Goal:** Define the source-of-truth payload, field mappings, and normalized dashboard model for the Chrome extension overlay that runs on Bybit's Dual Asset orders page.

**Target page:** `https://www.bybit.com/user/assets/order/financial/financial-dual-asset-orders/dual-asset-order`

**Primary endpoint:** `POST https://www.bybit.com/x-api/s1/byfi/dual-assets/orders`

**V1 scope:** Use only the `dual-assets/orders` endpoint. Do not depend on DOM scraping or secondary detail endpoints in v1.

---

## Request Contract

### Initial request payload

```json
{
  "product_type": 2,
  "only_effective_order": false,
  "start_at": null,
  "end_at": null,
  "base_coin": null,
  "limit": 10
}
```

### Request assumptions

- `product_type=2` is the Dual Asset bucket used by the target page.
- `only_effective_order=false` should include both active and completed rows.
- `limit` controls page size, but pagination behavior is still an implementation-time validation item.
- The fetch is performed from the logged-in Bybit page context, using the user's browser session.

---

## Response Contract

### Top-level shape

```ts
interface DualAssetsOrdersResponse {
  ret_code: number;
  ret_msg: string;
  result?: {
    status_code: number;
    dual_assets_orders: BybitDualAssetOrder[];
  };
  ext_code: string;
  ext_info: unknown;
  time_now: string;
}
```

### Row shape used by the dashboard

```ts
interface BybitDualAssetOrder {
  order_id: string;
  id: string;
  product_name: string;
  created_at: string;
  apply_end_at: string;
  order_status: number;
  order_status_v3: number;
  status: number;
  order_direction: number;
  coin: number;
  return_coin: number;
  coin_x: number;
  coin_y: number;
  benchmark_price_e8: string;
  settlement_price_e8: string;
  settlement_time: string;
  total_locked_amount_e8: string;
  cumulate_pnl_e8: string;
  apy_e8: string;
  settled_apy_e8: string;
  duration: number;
  yield_start_at: string;
  yield_end_at: string;
  estimate_yield_distribution: string;
  yield_duration: string;
  order_type: number;
  account_type: number;
  to_account_type: number;
  order_mode: number;
  rfq_expire_time: string;
}
```

---

## Raw Fields To Preserve

Preserve these source fields on each normalized record under `sourceRaw` so debugging never depends on memory or reverse-engineering:

- `order_id`
- `id`
- `product_name`
- `created_at`
- `apply_end_at`
- `yield_start_at`
- `yield_end_at`
- `estimate_yield_distribution`
- `order_status`
- `order_status_v3`
- `status`
- `order_direction`
- `coin`
- `return_coin`
- `coin_x`
- `coin_y`
- `benchmark_price_e8`
- `settlement_price_e8`
- `settlement_time`
- `total_locked_amount_e8`
- `cumulate_pnl_e8`
- `apy_e8`
- `settled_apy_e8`
- `duration`
- `yield_duration`
- `order_type`
- `account_type`
- `to_account_type`
- `order_mode`
- `rfq_expire_time`

---

## Normalized Dashboard Model

The overlay should render a normalized model instead of consuming Bybit rows directly:

```ts
type NormalizedOrderDirection = 'Buy Low' | 'Sell High';
type NormalizedOrderStatus = 'Active' | 'Completed';
type NormalizedWinLoss = 'Win' | 'Loss' | 'Pending' | null;

interface NormalizedDualAssetOrder {
  orderId: string;
  legacyId: string;
  productName: string;
  tenorLabel: string | null;
  baseAsset: string;
  quoteAsset: string;
  investmentToken: string;
  investmentAmount: number;
  orderDirection: NormalizedOrderDirection;
  targetPrice: number;
  apr: number;
  settledApr: number | null;
  orderTime: Date;
  settlementTime: Date | null;
  yieldStartTime: Date | null;
  yieldEndTime: Date | null;
  estimatedDistributionTime: Date | null;
  stakingPeriodLabel: string;
  yieldDurationDays: number | null;
  status: NormalizedOrderStatus;
  settlementPrice: number | null;
  proceeds: number | null;
  proceedsToken: string | null;
  profitAmount: number | null;
  profitToken: string | null;
  winOrLoss: NormalizedWinLoss;
  realApr: number | null;
  countdownLabel: string | null;
  sourceRaw: BybitDualAssetOrder;
}
```

---

## Field Mapping Rules

### Pair and tenor

- Parse `product_name` into:
  - `baseAsset`
  - `quoteAsset`
  - `tenorLabel`
- Examples:
  - `SOL-USDT 8h` -> base `SOL`, quote `USDT`, tenor `8h`
  - `SOL-USDT` -> base `SOL`, quote `USDT`, tenor `null`

### Direction

- `order_direction=1` -> `Buy Low`
- `order_direction=2` -> `Sell High`

### Status

- `order_status_v3=2` -> `Active`
- `order_status_v3=3` -> `Completed`
- Fallback: if `settlement_price_e8` is non-zero and `settlement_time` is valid, treat as completed.

### Token mapping

Use a small coin-id lookup table seeded from observed payloads, then validate it during implementation:

- `5` -> `USDT`
- `18` -> `SOL`
- `2` -> `ETH`

Also use `product_name`, `coin_x`, `coin_y`, and `return_coin` to sanity-check symbol resolution.

### Numeric conversions

All `_e8` amount and price fields are decimal strings scaled by `1e8`.

- `benchmark_price_e8 / 1e8` -> `targetPrice`
- `settlement_price_e8 / 1e8` -> `settlementPrice`
- `total_locked_amount_e8 / 1e8` -> `investmentAmount`
- `cumulate_pnl_e8 / 1e8` -> `proceeds`
- `apy_e8 / 1e6` -> `apr` percentage
- `settled_apy_e8 / 1e6` -> `settledApr` percentage

### Time conversions

These payload fields are Unix timestamps in seconds unless they are sentinel values:

- `created_at` -> `orderTime`
- `settlement_time` -> `settlementTime`
- `yield_start_at` -> `yieldStartTime`
- `yield_end_at` -> `yieldEndTime`
- `estimate_yield_distribution` -> `estimatedDistributionTime`
- `apply_end_at` can be used as a fallback active-order target time when settlement is not available

Sentinel handling:

- `settlement_time="-62135596800"` means "not settled yet" and should become `null`
- `settlement_price_e8="0"` means settlement price is not available yet

### Investment token

Infer `investmentToken` using the pair plus direction:

- `Buy Low` -> quote asset is invested, typically `USDT`
- `Sell High` -> base asset is invested, typically `SOL` or `ETH`

### Proceeds token

Resolve `proceedsToken` primarily from `return_coin`:

- `return_coin=coin_x` -> quote asset
- `return_coin=coin_y` -> base asset
- `return_coin=0` on active rows -> `null`

### Duration labels

- `duration=0` with a product label like `8h` -> staking label `< 1 Day`
- `duration=1` -> staking label `1 Day`
- `yield_duration` should be normalized to a number of days for APR math and display support

---

## Derived Field Rules

These fields are not raw Bybit fields and must be explicitly documented as derived:

### `proceeds`

- For completed rows, interpret `cumulate_pnl_e8` as the total payout currently exposed by Bybit.
- This appears to include principal plus yield in the observed settled rows.
- Mark this as `derived-from-source-interpretation` until more payload evidence confirms it universally.

### `profitAmount`

- If `proceedsToken === investmentToken`, profit is `proceeds - investmentAmount`.
- If the order settled into the opposite asset, use the current dashboard's directional principal-conversion logic:
  - `Sell High`: principal equivalent is `investmentAmount * targetPrice`
  - `Buy Low`: principal equivalent is `investmentAmount / targetPrice`
  - `profitAmount = proceeds - convertedPrincipal`

### `profitToken`

- If proceeds are returned in the investment token, use the investment token.
- Otherwise use `proceedsToken`.

### `winOrLoss`

- `Active` -> `Pending`
- `Completed` with proceeds in a different token -> `Win`
- `Completed` with same-token proceeds:
  - non-negative profit -> `Win`
  - negative profit -> `Loss`

### `realApr`

- Use settled duration and derived profit:
  - `realApr = (profitAmount / principalForApr) * (365 / durationDays) * 100`
- If duration or principal is missing/invalid, return `null`

### `countdownLabel`

- For active rows, count down to the best available future timestamp in this order:
  - `estimatedDistributionTime`
  - `yieldEndTime`
  - `apply_end_at`
- For completed rows, return `null`

---

## Dashboard Data Points Needed In V1

These are the actual data points the overlay dashboard needs:

### Summary cards

- Total USDT profit
- Win rate / conversion ratio
- Optional settled order count if needed for context

### VWAP summary

- Product name
- Direction
- Target price
- Investment amount

### Timeline chart

- Settlement date
- Profit amount
- Profit token
- Cumulative USDT profit

### Transactions table

- Product
- Direction
- Target price
- Investment amount
- Investment token
- APR
- Real APR
- Earned amount
- Earned token
- Approximate earned USDT value when possible
- Status
- Win/loss state
- Countdown for active orders

### Overlay/system data

- Last refresh time
- Loading state
- Empty state
- Error state

---

## Raw vs Derived vs Heuristic

### Raw

- Direct payload fields preserved in `sourceRaw`

### Derived

- Parsed token symbols
- Parsed pair/tenor labels
- Converted decimal values
- Normalized status and direction labels
- Countdown label

### Heuristic

- Coin-id lookup table until more pairs are observed
- Interpretation of `cumulate_pnl_e8` as total payout
- Cross-asset profit calculation for opposite-token settlement rows
- Any approximate USDT conversion shown in the table

---

## V1 Out Of Scope

- DOM scraping of visible table rows
- Secondary detail endpoints
- Tax export support
- API key usage
- Next.js API route runtime
- Investment allocation chart

---

## Implementation Notes For Part 2 And Beyond

- Build the extension runtime around a content script and overlay root.
- Keep the transformation logic isolated from the UI so it can be tested independently later.
- Keep a small optional debug view for raw payload inspection only if it helps field validation.
- Do not carry forward the old Bybit API research probes into the new runtime.
