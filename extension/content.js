(function initBybitDualAssetOverlay() {
  const OVERLAY_ID = "bybit-dual-asset-overlay-root";
  const STORAGE_KEY = "bybitDualAssetOverlayState";
  const ORDERS_ENDPOINT = "https://www.bybit.com/x-api/s1/byfi/dual-assets/orders";
  const DEFAULT_REQUEST_BODY = {
    product_type: 2,
    only_effective_order: false,
    start_at: null,
    end_at: null,
    base_coin: null,
    limit: 10,
  };
  const COIN_SYMBOLS = {
    2: "ETH",
    5: "USDT",
    18: "SOL",
  };
  const DEFAULT_STATE = {
    top: 24,
    left: null,
    right: 24,
    width: 480,
    height: 420,
    minimized: false,
  };

  if (document.getElementById(OVERLAY_ID)) {
    return;
  }

  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.className = "bybit-da-overlay-root";

  const windowEl = document.createElement("section");
  windowEl.className = "bybit-da-overlay-window";
  windowEl.setAttribute("role", "dialog");
  windowEl.setAttribute("aria-label", "Bybit Dual Asset Overlay");
  windowEl.innerHTML = `
    <div class="bybit-da-overlay-header">
      <div class="bybit-da-overlay-title-wrap">
        <div class="bybit-da-overlay-title">Dual Asset Intelligence</div>
        <div class="bybit-da-overlay-subtitle">Live Bybit Dual Asset orders overlay</div>
      </div>
      <div class="bybit-da-overlay-actions">
        <button type="button" class="bybit-da-overlay-button" data-action="refresh" aria-label="Refresh data">Refresh</button>
        <button type="button" class="bybit-da-overlay-button" data-action="minimize" aria-label="Minimize overlay">_</button>
      </div>
    </div>
    <div class="bybit-da-overlay-body"></div>
    <div class="bybit-da-overlay-resize-handle" aria-hidden="true"></div>
  `;

  root.appendChild(windowEl);
  document.documentElement.appendChild(root);

  const headerEl = windowEl.querySelector(".bybit-da-overlay-header");
  const minimizeButton = windowEl.querySelector('[data-action="minimize"]');
  const refreshButton = windowEl.querySelector('[data-action="refresh"]');
  const resizeHandleEl = windowEl.querySelector(".bybit-da-overlay-resize-handle");
  const bodyEl = windowEl.querySelector(".bybit-da-overlay-body");

  let state = { ...DEFAULT_STATE };
  let isFetching = false;
  let latestFetchId = 0;
  let dataState = {
    status: "loading",
    error: null,
    lastUpdatedAt: null,
    orders: [],
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseScaledNumber(value, scale) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed / scale;
  }

  function parseUnixSeconds(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return new Date(parsed * 1000);
  }

  function formatDateTime(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return "-";
    }

    return value.toLocaleString();
  }

  function formatNumber(value, options) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "-";
    }

    return new Intl.NumberFormat(undefined, options).format(value);
  }

  function formatAmount(value, token, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "-";
    }

    return `${formatNumber(value, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits ?? 4,
    })} ${token || ""}`.trim();
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "-";
    }

    return `${formatNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
  }

  function formatUsd(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "-";
    }

    return `$${formatNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function parseProductName(productName) {
    const [pairPart, tenorPart] = String(productName || "").split(" ");
    const [baseAsset = "Unknown", quoteAsset = "Unknown"] = String(pairPart || "").split("-");

    return {
      baseAsset,
      quoteAsset,
      tenorLabel: tenorPart || null,
    };
  }

  function getCoinSymbol(coinId, pair) {
    const numericId = Number(coinId);
    if (COIN_SYMBOLS[numericId]) {
      return COIN_SYMBOLS[numericId];
    }

    if (numericId === Number(pair.coinX)) {
      return pair.quoteAsset;
    }

    if (numericId === Number(pair.coinY)) {
      return pair.baseAsset;
    }

    return null;
  }

  function getCountdownLabel(targetDate) {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return null;
    }

    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) {
      return "Settling...";
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  function getTargetCountdownDate(row) {
    return (
      parseUnixSeconds(row.estimate_yield_distribution) ||
      parseUnixSeconds(row.yield_end_at) ||
      parseUnixSeconds(row.apply_end_at)
    );
  }

  function getStakingPeriodLabel(row, tenorLabel) {
    if (tenorLabel) {
      return tenorLabel === "8h" ? "< 1 Day" : tenorLabel;
    }

    if (Number(row.duration) === 1) {
      return "1 Day";
    }

    if (Number(row.duration) === 0) {
      return "< 1 Day";
    }

    return "Custom";
  }

  function normalizeOrder(row) {
    const pair = parseProductName(row.product_name);
    const orderDirection = Number(row.order_direction) === 2 ? "Sell High" : "Buy Low";
    const status =
      Number(row.order_status_v3) === 3 ||
      (Number(row.settlement_price_e8) > 0 && Number(row.settlement_time) > 0)
        ? "Completed"
        : "Active";
    const investmentToken = orderDirection === "Buy Low" ? pair.quoteAsset : pair.baseAsset;
    const proceedsToken =
      Number(row.return_coin) === 0
        ? null
        : getCoinSymbol(row.return_coin, {
            baseAsset: pair.baseAsset,
            quoteAsset: pair.quoteAsset,
            coinX: row.coin_x,
            coinY: row.coin_y,
          });
    const orderTime = parseUnixSeconds(row.created_at);
    const settlementTime = parseUnixSeconds(row.settlement_time);
    const yieldStartTime = parseUnixSeconds(row.yield_start_at);
    const yieldEndTime = parseUnixSeconds(row.yield_end_at);
    const estimatedDistributionTime = parseUnixSeconds(row.estimate_yield_distribution);
    const targetPrice = parseScaledNumber(row.benchmark_price_e8, 1e8) || 0;
    const settlementPrice = parseScaledNumber(row.settlement_price_e8, 1e8);
    const investmentAmount = parseScaledNumber(row.total_locked_amount_e8, 1e8) || 0;
    const proceeds = status === "Completed" ? parseScaledNumber(row.cumulate_pnl_e8, 1e8) : null;
    const apr = parseScaledNumber(row.apy_e8, 1e6) || 0;
    const settledApr = status === "Completed" ? parseScaledNumber(row.settled_apy_e8, 1e6) : null;
    const durationDays = row.yield_duration ? Number(row.yield_duration) : null;
    const countdownLabel = status === "Active" ? getCountdownLabel(getTargetCountdownDate(row)) : null;

    let profitAmount = null;
    let profitToken = proceedsToken;
    let winOrLoss = status === "Active" ? "Pending" : null;
    let principalForApr = null;

    if (status === "Completed" && proceeds !== null && proceedsToken) {
      if (proceedsToken === investmentToken) {
        profitAmount = proceeds - investmentAmount;
        profitToken = investmentToken;
        winOrLoss = profitAmount >= 0 ? "Win" : "Loss";
        principalForApr = investmentAmount;
      } else if (targetPrice > 0) {
        const convertedPrincipal =
          orderDirection === "Sell High"
            ? investmentAmount * targetPrice
            : investmentAmount / targetPrice;
        profitAmount = proceeds - convertedPrincipal;
        profitToken = proceedsToken;
        winOrLoss = "Win";
        principalForApr = convertedPrincipal;
      }
    }

    let realApr = null;
    if (
      status === "Completed" &&
      profitAmount !== null &&
      principalForApr &&
      settlementTime &&
      orderTime
    ) {
      const durationMs = settlementTime.getTime() - orderTime.getTime();
      const durationDaysFromTime = durationMs / (1000 * 60 * 60 * 24);
      if (durationDaysFromTime > 0) {
        realApr = (profitAmount / principalForApr) * (365 / durationDaysFromTime) * 100;
      }
    }

    return {
      orderId: row.order_id || row.id,
      legacyId: row.id,
      productName: row.product_name,
      tenorLabel: pair.tenorLabel,
      baseAsset: pair.baseAsset,
      quoteAsset: pair.quoteAsset,
      investmentToken,
      investmentAmount,
      orderDirection,
      targetPrice,
      apr,
      settledApr,
      orderTime,
      settlementTime,
      yieldStartTime,
      yieldEndTime,
      estimatedDistributionTime,
      stakingPeriodLabel: getStakingPeriodLabel(row, pair.tenorLabel),
      yieldDurationDays: Number.isFinite(durationDays) ? durationDays : null,
      status,
      settlementPrice,
      proceeds,
      proceedsToken,
      profitAmount,
      profitToken,
      winOrLoss,
      realApr,
      countdownLabel,
      sourceRaw: row,
    };
  }

  function getApproximateUsdValue(order) {
    if (order.profitAmount === null || order.profitToken === null) {
      return null;
    }

    if (order.profitToken === "USDT") {
      return order.profitAmount;
    }

    if (order.settlementPrice) {
      return order.profitAmount * order.settlementPrice;
    }

    return null;
  }

  function buildSummary(orders) {
    let totalUsdtProfit = 0;
    let activeCount = 0;
    let completedCount = 0;
    let wins = 0;
    let losses = 0;

    for (const order of orders) {
      if (order.status === "Active") {
        activeCount += 1;
      } else {
        completedCount += 1;
      }

      if (order.winOrLoss === "Win") {
        wins += 1;
      } else if (order.winOrLoss === "Loss") {
        losses += 1;
      }

      const usdValue = getApproximateUsdValue(order);
      if (usdValue !== null) {
        totalUsdtProfit += usdValue;
      }
    }

    const settledCount = wins + losses;
    const winRate = settledCount > 0 ? (wins / settledCount) * 100 : 0;

    return {
      totalUsdtProfit,
      activeCount,
      completedCount,
      winRate,
    };
  }

  function getStateBadge() {
    if (dataState.status === "loading") {
      return '<div class="bybit-da-overlay-badge is-loading">Loading live Bybit orders...</div>';
    }

    if (dataState.status === "error") {
      return '<div class="bybit-da-overlay-badge is-error">Unable to fetch Bybit orders</div>';
    }

    if (dataState.status === "empty") {
      return '<div class="bybit-da-overlay-badge is-empty">No Dual Asset orders returned</div>';
    }

    return '<div class="bybit-da-overlay-badge">Live Bybit orders loaded</div>';
  }

  function renderLoadingState() {
    bodyEl.innerHTML = `
      ${getStateBadge()}
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Fetching</div>
        <div class="bybit-da-overlay-copy">Requesting <code>/x-api/s1/byfi/dual-assets/orders</code> with the page's authenticated browser session.</div>
      </div>
    `;
  }

  function renderErrorState() {
    bodyEl.innerHTML = `
      ${getStateBadge()}
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Request failed</div>
        <div class="bybit-da-overlay-copy">${escapeHtml(dataState.error || "Unknown error")}</div>
      </div>
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Next step</div>
        <div class="bybit-da-overlay-copy">Use the refresh button after confirming the Bybit page is loaded and your session is active.</div>
      </div>
    `;
  }

  function renderEmptyState() {
    bodyEl.innerHTML = `
      ${getStateBadge()}
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Result</div>
        <div class="bybit-da-overlay-copy">The endpoint responded successfully, but no Dual Asset rows were returned for the current request payload.</div>
      </div>
    `;
  }

  function renderSuccessState() {
    const summary = buildSummary(dataState.orders);
    const lastUpdatedLabel = dataState.lastUpdatedAt ? formatDateTime(dataState.lastUpdatedAt) : "-";

    const rowsHtml = dataState.orders
      .map(function renderRow(order) {
        const approxUsd = getApproximateUsdValue(order);
        return `
          <tr>
            <td>${escapeHtml(order.productName)}</td>
            <td>
              <span class="bybit-da-pill ${order.orderDirection === "Buy Low" ? "is-buy" : "is-sell"}">
                ${escapeHtml(order.orderDirection)}
              </span>
            </td>
            <td>${escapeHtml(formatNumber(order.targetPrice, { minimumFractionDigits: 2, maximumFractionDigits: 4 }))}</td>
            <td>${escapeHtml(formatAmount(order.investmentAmount, order.investmentToken, 4))}</td>
            <td>
              <div class="bybit-da-stacked">
                <span>${escapeHtml(formatPercent(order.apr))}</span>
                <span class="bybit-da-muted">${escapeHtml(formatPercent(order.realApr))}</span>
              </div>
            </td>
            <td>${escapeHtml(formatAmount(order.profitAmount, order.profitToken, 4))}</td>
            <td>${escapeHtml(formatUsd(approxUsd))}</td>
            <td>
              <div class="bybit-da-stacked">
                <span class="bybit-da-pill ${order.status === "Completed" ? "is-complete" : "is-active"}">${escapeHtml(order.status)}</span>
                <span class="bybit-da-muted">${escapeHtml(order.countdownLabel || order.winOrLoss || "-")}</span>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    bodyEl.innerHTML = `
      ${getStateBadge()}
      <div class="bybit-da-overlay-meta">
        <span>Last refresh: ${escapeHtml(lastUpdatedLabel)}</span>
        <span>Orders: ${escapeHtml(String(dataState.orders.length))}</span>
      </div>
      <div class="bybit-da-overlay-grid">
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Approx. Total USDT Profit</div>
          <div class="bybit-da-overlay-value">${escapeHtml(formatUsd(summary.totalUsdtProfit))}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Win Rate</div>
          <div class="bybit-da-overlay-value">${escapeHtml(formatPercent(summary.winRate))}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Active Orders</div>
          <div class="bybit-da-overlay-value">${escapeHtml(String(summary.activeCount))}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Completed Orders</div>
          <div class="bybit-da-overlay-value">${escapeHtml(String(summary.completedCount))}</div>
        </div>
      </div>
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Part 3 verification</div>
        <ul class="bybit-da-overlay-list">
          <li>Data comes from Bybit's live <code>dual-assets/orders</code> endpoint.</li>
          <li>Rows are normalized into active/completed records with derived profit and countdown fields.</li>
          <li>The full UI port, charts, and richer summaries are reserved for Part 4.</li>
        </ul>
      </div>
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Dual Asset Orders</div>
        <div class="bybit-da-overlay-table-wrap">
          <table class="bybit-da-overlay-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Direction</th>
                <th>Target</th>
                <th>Amount</th>
                <th>APR</th>
                <th>Earned</th>
                <th>Earned USDT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderDataState() {
    if (dataState.status === "loading") {
      renderLoadingState();
      return;
    }

    if (dataState.status === "error") {
      renderErrorState();
      return;
    }

    if (dataState.status === "empty") {
      renderEmptyState();
      return;
    }

    renderSuccessState();
  }

  async function readState() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        return result[STORAGE_KEY] || null;
      }
    } catch (error) {
      console.warn("Bybit overlay: failed to read chrome storage", error);
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn("Bybit overlay: failed to read local storage", error);
      return null;
    }
  }

  async function writeState(nextState) {
    state = nextState;

    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
        return;
      }
    } catch (error) {
      console.warn("Bybit overlay: failed to write chrome storage", error);
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      console.warn("Bybit overlay: failed to write local storage", error);
    }
  }

  function getViewportBox() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function applyState(nextState) {
    const viewport = getViewportBox();
    const width = clamp(nextState.width, 360, Math.max(360, viewport.width - 24));
    const height = clamp(nextState.height, 220, Math.max(220, viewport.height - 24));
    const top = clamp(nextState.top, 12, Math.max(12, viewport.height - 80));

    windowEl.style.width = `${width}px`;
    windowEl.style.height = nextState.minimized ? "auto" : `${height}px`;
    windowEl.style.top = `${top}px`;

    if (typeof nextState.left === "number") {
      const maxLeft = Math.max(12, viewport.width - width - 12);
      const left = clamp(nextState.left, 12, maxLeft);
      windowEl.style.left = `${left}px`;
      windowEl.style.right = "auto";
      nextState.left = left;
      nextState.right = null;
    } else {
      const right = clamp(nextState.right ?? 24, 12, Math.max(12, viewport.width - width - 12));
      windowEl.style.right = `${right}px`;
      windowEl.style.left = "auto";
      nextState.right = right;
      nextState.left = null;
    }

    windowEl.dataset.minimized = String(Boolean(nextState.minimized));
    minimizeButton.textContent = nextState.minimized ? "▢" : "_";
  }

  function persistAndRender(partialState) {
    const nextState = { ...state, ...partialState };
    applyState(nextState);
    writeState(nextState);
  }

  function startDrag(event) {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }

    const startRect = windowEl.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      persistAndRender({
        top: startRect.top + dy,
        left: startRect.left + dx,
        right: null,
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startResize(event) {
    event.preventDefault();
    const startRect = windowEl.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      persistAndRender({
        width: startRect.width + dx,
        height: startRect.height + dy,
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function loadOrders() {
    if (isFetching) {
      return;
    }

    isFetching = true;
    latestFetchId += 1;
    const fetchId = latestFetchId;
    refreshButton.disabled = true;
    dataState = {
      ...dataState,
      status: "loading",
      error: null,
    };
    renderDataState();

    try {
      const response = await fetch(ORDERS_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(DEFAULT_REQUEST_BODY),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload = await response.json();
      if (payload.ret_code !== 0) {
        throw new Error(payload.ret_msg || `Bybit error ${payload.ret_code}`);
      }

      const rows =
        payload &&
        payload.result &&
        Array.isArray(payload.result.dual_assets_orders)
          ? payload.result.dual_assets_orders
          : [];

      if (fetchId !== latestFetchId) {
        return;
      }

      dataState = {
        status: rows.length ? "success" : "empty",
        error: null,
        lastUpdatedAt: new Date(),
        orders: rows.map(normalizeOrder),
      };
    } catch (error) {
      if (fetchId !== latestFetchId) {
        return;
      }

      dataState = {
        ...dataState,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown fetch error",
      };
    } finally {
      if (fetchId === latestFetchId) {
        isFetching = false;
        refreshButton.disabled = false;
        renderDataState();
      }
    }
  }

  minimizeButton.addEventListener("click", function toggleMinimize() {
    persistAndRender({ minimized: !state.minimized });
  });
  refreshButton.addEventListener("click", loadOrders);

  headerEl.addEventListener("pointerdown", startDrag);
  resizeHandleEl.addEventListener("pointerdown", startResize);
  window.addEventListener("resize", function handleResize() {
    applyState(state);
  });

  readState().then(function mountOverlay(savedState) {
    state = { ...DEFAULT_STATE, ...(savedState || {}) };
    applyState(state);
    renderDataState();
    loadOrders();
  });
})();
