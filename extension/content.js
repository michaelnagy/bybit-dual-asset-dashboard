(function initBybitDualAssetOverlay() {
  const OVERLAY_ID = "bybit-dual-asset-overlay-root";
  const STORAGE_KEY = "bybitDualAssetOverlayState";
  const ORDERS_ENDPOINT = "https://www.bybit.com/x-api/s1/byfi/dual-assets/orders";
  const PRODUCTS_ENDPOINT = "https://www.bybit.com/x-api/s1/byfi/get-products-extra-info";
  const COIN_SYMBOLS = {
    2: "ETH",
    5: "USDT",
    18: "SOL",
  };
  const COIN_NAMES = {
    1: "BTC", 2: "ETH", 4: "NEAR", 5: "USDT", 6: "LTC",
    7: "AVAX", 8: "XLM", 18: "SOL", 19: "BNB", 20: "ADA",
    21: "LINK", 29: "SUI", 34: "DOT", 50: "AAVE", 73: "PEPE",
    75: "TON", 122: "BNB", 140: "DOGE", 145: "FIL", 174: "UNI",
    212: "SHIB", 244: "OP", 329: "MATIC", 368: "ONDO", 396: "WLD",
    416: "HBAR", 428: "POL", 451: "JUP", 463: "XRP", 469: "SEI",
    480: "INJ", 503: "MANTA", 504: "TIA", 620: "BOME", 622: "BONK",
    669: "NOT", 672: "IO", 673: "ZRO", 677: "STRK", 679: "FLOKI",
    680: "ETHFI", 695: "TURBO", 706: "PEPE2", 715: "ARKM",
    734: "MEW", 815: "EIGEN", 842: "AAVE", 858: "BNB", 1071: "TRUMP",
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
  let spotPrices = {};
  let dataState = {
    status: "loading",
    error: null,
    lastUpdatedAt: null,
    orders: [],
  };
  let productsData = {
    status: "idle",
    error: null,
    items: [],
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
        winOrLoss = "Loss";
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
    const vwap = {};
    const timelinePoints = [];

    const sorted = [...orders].sort(function bySettlement(a, b) {
      const ta = (a.settlementTime || a.orderTime || new Date(0)).getTime();
      const tb = (b.settlementTime || b.orderTime || new Date(0)).getTime();
      return ta - tb;
    });

    let cumulativeUsdtProfit = 0;

    for (const order of sorted) {
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

      const key = order.productName.split(" ")[0];
      if (!vwap[key]) {
        vwap[key] = {
          buyLowWeightedSum: 0,
          buyLowVolume: 0,
          sellHighWeightedSum: 0,
          sellHighVolume: 0,
          convertedBuyWeightedSum: 0,
          convertedBuyVolume: 0,
          convertedSellWeightedSum: 0,
          convertedSellVolume: 0,
          tradingPnlUsdt: 0,
          aprSum: 0,
          aprCount: 0,
          settledAprSum: 0,
          settledAprCount: 0,
        };
      }

      if (order.apr > 0) {
        vwap[key].aprSum += order.apr;
        vwap[key].aprCount += 1;
      }

      if (order.settledApr !== null && order.settledApr > 0) {
        vwap[key].settledAprSum += order.settledApr;
        vwap[key].settledAprCount += 1;
      }

      if (order.targetPrice > 0) {
        if (order.orderDirection === "Buy Low") {
          vwap[key].buyLowWeightedSum += order.targetPrice * order.investmentAmount;
          vwap[key].buyLowVolume += order.investmentAmount;
        } else {
          vwap[key].sellHighWeightedSum += order.targetPrice * order.investmentAmount;
          vwap[key].sellHighVolume += order.investmentAmount;
        }
      }

      const isConverted = order.status === "Completed"
        && order.proceedsToken !== null
        && order.proceedsToken !== order.investmentToken;

      if (isConverted && order.targetPrice > 0) {
        if (order.orderDirection === "Buy Low") {
          vwap[key].convertedBuyWeightedSum += order.targetPrice * order.investmentAmount;
          vwap[key].convertedBuyVolume += order.investmentAmount;
        } else {
          vwap[key].convertedSellWeightedSum += order.targetPrice * order.investmentAmount;
          vwap[key].convertedSellVolume += order.investmentAmount;
        }
      }

      if (order.status === "Completed" && usdValue !== null) {
        cumulativeUsdtProfit += usdValue;
      }
    }

    let totalTradingPnlUsdt = 0;
    let runningUsdtProfit = 0;
    let runningTradingPnlUsdt = 0;

    for (const order of sorted) {
      if (order.status !== "Completed") continue;
      
      const key = order.productName.split(" ")[0];
      const pairData = vwap[key];
      let addPoint = false;

      if (pairData) {
        const isConverted = order.proceedsToken !== null && order.proceedsToken !== order.investmentToken;

        if (isConverted && order.orderDirection === "Sell High" && order.targetPrice > 0) {
          const convertedBuyVwap = pairData.convertedBuyVolume > 0
            ? pairData.convertedBuyWeightedSum / pairData.convertedBuyVolume
            : 0;

          if (convertedBuyVwap > 0) {
            const gain = (order.targetPrice - convertedBuyVwap) * order.investmentAmount;
            order.tradingGainUsdt = gain;
            pairData.tradingPnlUsdt += gain;
            totalTradingPnlUsdt += gain;
            runningTradingPnlUsdt += gain;
            addPoint = true;
          }
        }
      }

      const usdValue = getApproximateUsdValue(order);
      if (usdValue !== null) {
        runningUsdtProfit += usdValue;
        addPoint = true;
      }

      if (addPoint) {
        const dateLabel = order.settlementTime
          ? order.settlementTime.toLocaleDateString()
          : "-";
        
        let existing = timelinePoints.length > 0 ? timelinePoints[timelinePoints.length - 1] : null;
        if (existing && existing.date === dateLabel) {
          existing.cumulative = runningUsdtProfit;
          existing.cumulativeTrading = runningTradingPnlUsdt;
        } else {
          timelinePoints.push({
            date: dateLabel,
            profit: usdValue || 0,
            cumulative: runningUsdtProfit,
            tradingPnl: order.tradingGainUsdt || 0,
            cumulativeTrading: runningTradingPnlUsdt,
          });
        }
      }
    }

    let aprSum = 0;
    let aprCount = 0;
    let settledAprSum = 0;
    let settledAprCount = 0;

    for (var j = 0; j < sorted.length; j++) {
      if (sorted[j].apr > 0) {
        aprSum += sorted[j].apr;
        aprCount += 1;
      }

      if (sorted[j].settledApr !== null && sorted[j].settledApr > 0) {
        settledAprSum += sorted[j].settledApr;
        settledAprCount += 1;
      }
    }

    const avgApr = aprCount > 0 ? aprSum / aprCount : 0;
    const avgSettledApr = settledAprCount > 0 ? settledAprSum / settledAprCount : 0;

    const settledCount = wins + losses;
    const winRate = settledCount > 0 ? (wins / settledCount) * 100 : 0;

    const avgTargetPrices = Object.keys(vwap).map(function mapVwap(product) {
      const data = vwap[product];
      return {
        product,
        buyLowVwap: data.buyLowVolume > 0 ? data.buyLowWeightedSum / data.buyLowVolume : 0,
        sellHighVwap: data.sellHighVolume > 0 ? data.sellHighWeightedSum / data.sellHighVolume : 0,
        convertedBuyVwap: data.convertedBuyVolume > 0
          ? data.convertedBuyWeightedSum / data.convertedBuyVolume : 0,
        convertedSellVwap: data.convertedSellVolume > 0
          ? data.convertedSellWeightedSum / data.convertedSellVolume : 0,
        tradingPnlUsdt: data.tradingPnlUsdt,
        avgApr: data.aprCount > 0 ? data.aprSum / data.aprCount : 0,
        avgSettledApr: data.settledAprCount > 0 ? data.settledAprSum / data.settledAprCount : 0,
      };
    });

    return {
      totalUsdtProfit,
      totalTradingPnlUsdt,
      activeCount,
      completedCount,
      winRate,
      avgApr,
      avgSettledApr,
      avgTargetPrices,
      timelinePoints,
    };
  }

  function buildSvgTimeline(points, width, height) {
    if (!points.length) {
      return "";
    }

    const padding = { top: 10, right: 10, bottom: 24, left: 46 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const values = points.map(function getVal(p) { return p.cumulative; });
    const tradingValues = points.map(function getVal(p) { return p.cumulativeTrading || 0; });
    const allValues = values.concat(tradingValues);
    const minVal = Math.min(0, ...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;

    function x(i) {
      return padding.left + (i / Math.max(1, points.length - 1)) * chartW;
    }

    function y(v) {
      return padding.top + chartH - ((v - minVal) / range) * chartH;
    }

    const linePath = points
      .map(function toCoord(p, i) {
        return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`;
      })
      .join(" ");

    const areaPath = linePath +
      ` L${x(points.length - 1).toFixed(1)},${(padding.top + chartH).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(padding.top + chartH).toFixed(1)} Z`;

    const dots = points
      .map(function toDot(p, i) {
        return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cumulative).toFixed(1)}" r="3" fill="#34d399"/>`;
      })
      .join("");

    const tradingPath = points
      .map(function toCoord(p, i) {
        return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulativeTrading || 0).toFixed(1)}`;
      })
      .join(" ");

    const tradingAreaPath = tradingPath +
      ` L${x(points.length - 1).toFixed(1)},${(padding.top + chartH).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(padding.top + chartH).toFixed(1)} Z`;

    const tradingDots = points
      .map(function toDot(p, i) {
        return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cumulativeTrading || 0).toFixed(1)}" r="3" fill="#60a5fa"/>`;
      })
      .join("");

    const ticks = 4;
    const gridLines = [];
    for (var t = 0; t <= ticks; t++) {
      var val = minVal + (range / ticks) * t;
      var yPos = y(val);
      gridLines.push(
        `<line x1="${padding.left}" x2="${width - padding.right}" y1="${yPos.toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="rgba(51,65,85,0.5)" stroke-dasharray="3 3"/>` +
        `<text x="${padding.left - 4}" y="${(yPos + 3).toFixed(1)}" fill="#94a3b8" font-size="9" text-anchor="end">$${val.toFixed(2)}</text>`
      );
    }

    var firstLabel = escapeHtml(points[0].date);
    var lastLabel = escapeHtml(points[points.length - 1].date);

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bybit-da-chart-svg">
      ${gridLines.join("")}
      <path d="${areaPath}" fill="url(#bybitDaGrad)" opacity="0.3"/>
      <path d="${tradingAreaPath}" fill="url(#bybitTradingGrad)" opacity="0.3"/>
      <path d="${linePath}" fill="none" stroke="#34d399" stroke-width="2" stroke-linejoin="round"/>
      <path d="${tradingPath}" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      ${tradingDots}
      <text x="${padding.left}" y="${height - 4}" fill="#94a3b8" font-size="9">${firstLabel}</text>
      <text x="${width - padding.right}" y="${height - 4}" fill="#94a3b8" font-size="9" text-anchor="end">${lastLabel}</text>
      <defs>
        <linearGradient id="bybitDaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="bybitTradingGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>`;
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

  function buildProductsSectionHtml() {
    if (productsData.status === "idle" || productsData.status === "loading") {
      return `
        <div class="bybit-da-products-section">
          <div class="bybit-da-overlay-label bybit-da-section-label">Highest Available APRs</div>
          <div class="bybit-da-overlay-card">
            <div class="bybit-da-overlay-copy">Loading available products…</div>
          </div>
        </div>`;
    }

    if (productsData.status === "error") {
      return `
        <div class="bybit-da-products-section">
          <div class="bybit-da-overlay-label bybit-da-section-label">Highest Available APRs</div>
          <div class="bybit-da-overlay-card">
            <div class="bybit-da-overlay-copy">Failed to load: ${escapeHtml(productsData.error || "Unknown error")}</div>
          </div>
        </div>`;
    }

    if (!productsData.items.length) {
      return `
        <div class="bybit-da-products-section">
          <div class="bybit-da-overlay-label bybit-da-section-label">Highest Available APRs</div>
          <div class="bybit-da-overlay-card">
            <div class="bybit-da-overlay-copy">No products currently available.</div>
          </div>
        </div>`;
    }

    var cardsHtml = productsData.items.map(function renderProdCard(item) {
      var expiryLabel = item.applyEndAt
        ? "Expires " + formatDateTime(item.applyEndAt)
        : "";
      return `
        <div class="bybit-da-overlay-card bybit-da-product-card">
          <div class="bybit-da-product-duration">${escapeHtml(getDurationLabel(item.duration))}</div>
          <div class="bybit-da-product-apr">${escapeHtml(formatPercent(item.maxApr))}</div>
          <div class="bybit-da-product-pair">${escapeHtml(item.pair)}</div>
          <div class="bybit-da-product-detail">${escapeHtml(item.direction)} @ ${escapeHtml(item.strikePrice)}</div>
          ${expiryLabel ? '<div class="bybit-da-muted bybit-da-product-expiry">' + escapeHtml(expiryLabel) + "</div>" : ""}
        </div>`;
    }).join("");

    return `
      <div class="bybit-da-products-section">
        <div class="bybit-da-overlay-label bybit-da-section-label">Highest Available APRs</div>
        <div class="bybit-da-overlay-grid">${cardsHtml}</div>
      </div>`;
  }

  function renderLoadingState() {
    bodyEl.innerHTML = `
      ${getStateBadge()}
      ${buildProductsSectionHtml()}
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Fetching</div>
        <div class="bybit-da-overlay-copy">Requesting <code>/x-api/s1/byfi/dual-assets/orders</code> with the page's authenticated browser session.</div>
      </div>
    `;
  }

  function renderErrorState() {
    bodyEl.innerHTML = `
      ${getStateBadge()}
      ${buildProductsSectionHtml()}
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
      ${buildProductsSectionHtml()}
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
        const countdownAttr = order.status === "Active"
          ? ` data-countdown-target="${(getTargetCountdownDate(order.sourceRaw) || new Date(0)).getTime()}"`
          : "";
        const strike = getStrikeStatus(order);
        const strikeHtml = strike
          ? `<span class="bybit-da-pill ${strike.triggering ? "is-triggering" : "is-safe"}">${strike.triggering ? "Triggering" : "Safe"} @ ${escapeHtml(formatNumber(strike.currentPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`
          : "";
        return `
          <tr>
            <td>${escapeHtml(formatDateTime(order.orderTime))}</td>
            <td>${escapeHtml(order.productName)}</td>
            <td>
              <span class="bybit-da-pill ${order.orderDirection === "Buy Low" ? "is-buy" : "is-sell"}">
                ${escapeHtml(order.orderDirection)}
              </span>
            </td>
            <td>
              <div class="bybit-da-stacked">
                <span>${escapeHtml(formatNumber(order.targetPrice, { minimumFractionDigits: 2, maximumFractionDigits: 4 }))}</span>
                ${strikeHtml}
              </div>
            </td>
            <td>${escapeHtml(formatAmount(order.investmentAmount, order.investmentToken, 4))}</td>
            <td>
              <div class="bybit-da-stacked">
                <span>${escapeHtml(formatPercent(order.apr))}</span>
                <span class="bybit-da-muted">${escapeHtml(formatPercent(order.realApr))}</span>
              </div>
            </td>
            <td>${escapeHtml(formatAmount(order.profitAmount, order.profitToken, 4))}</td>
            <td>${escapeHtml(formatUsd(approxUsd))}</td>
            <td class="${order.tradingGainUsdt !== undefined ? (order.tradingGainUsdt >= 0 ? "is-positive" : "is-negative") : ""}">${order.tradingGainUsdt !== undefined ? escapeHtml(formatUsd(order.tradingGainUsdt)) : "-"}</td>
            <td>
              <div class="bybit-da-stacked">
                <span class="bybit-da-pill ${order.status === "Completed" ? "is-complete" : "is-active"}">${escapeHtml(order.status)}</span>
                <span class="bybit-da-muted bybit-da-countdown"${countdownAttr}>${escapeHtml(order.countdownLabel || order.winOrLoss || "-")}</span>
              </div>
            </td>
            <td class="bybit-da-muted">${escapeHtml(formatDateTime(order.settlementTime))}</td>
          </tr>
        `;
      })
      .join("");

    const vwapHtml = summary.avgTargetPrices.length
      ? summary.avgTargetPrices
          .map(function renderVwap(tp) {
            return `
              <div class="bybit-da-overlay-card bybit-da-vwap-card">
                <div class="bybit-da-overlay-label">${escapeHtml(tp.product)}</div>
                <div class="bybit-da-vwap-row">
                  <div>
                    <div class="bybit-da-vwap-dir">Buy Low VWAP</div>
                    <div class="bybit-da-vwap-price is-buy">${tp.buyLowVwap > 0 ? escapeHtml(formatNumber(tp.buyLowVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "-"}</div>
                  </div>
                  <div>
                    <div class="bybit-da-vwap-dir">Sell High VWAP</div>
                    <div class="bybit-da-vwap-price is-sell">${tp.sellHighVwap > 0 ? escapeHtml(formatNumber(tp.sellHighVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "-"}</div>
                  </div>
                </div>
                <div class="bybit-da-vwap-row" style="margin-top:6px">
                  <div>
                    <div class="bybit-da-vwap-dir">Converted Buy VWAP</div>
                    <div class="bybit-da-vwap-price is-buy">${tp.convertedBuyVwap > 0 ? escapeHtml(formatNumber(tp.convertedBuyVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "-"}</div>
                  </div>
                  <div>
                    <div class="bybit-da-vwap-dir">Converted Sell VWAP</div>
                    <div class="bybit-da-vwap-price is-sell">${tp.convertedSellVwap > 0 ? escapeHtml(formatNumber(tp.convertedSellVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "-"}</div>
                  </div>
                </div>
                <div class="bybit-da-vwap-row" style="margin-top:6px">
                  <div>
                    <div class="bybit-da-vwap-dir">Trading P&L</div>
                    <div class="bybit-da-vwap-price ${tp.tradingPnlUsdt >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatUsd(tp.tradingPnlUsdt))}</div>
                  </div>
                </div>
                <div class="bybit-da-vwap-row" style="margin-top:6px">
                  <div>
                    <div class="bybit-da-vwap-dir">Avg APR</div>
                    <div class="bybit-da-vwap-apr">${escapeHtml(formatPercent(tp.avgApr))}</div>
                  </div>
                  <div>
                    <div class="bybit-da-vwap-dir">Avg Settled APR</div>
                    <div class="bybit-da-vwap-apr">${escapeHtml(formatPercent(tp.avgSettledApr))}</div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")
      : "";

    const chartHtml = summary.timelinePoints.length > 1
      ? `<div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label" style="display:flex; justify-content:space-between;">
            <span>Cumulative Profit Timeline</span>
            <div style="display:flex; gap:12px;">
              <span style="color:#34d399;">■ Yield</span>
              <span style="color:#60a5fa;">■ Trading</span>
            </div>
          </div>
          <div class="bybit-da-chart-wrap">${buildSvgTimeline(summary.timelinePoints, 440, 160)}</div>
        </div>`
      : "";

    bodyEl.innerHTML = `
      ${getStateBadge()}
      ${buildProductsSectionHtml()}
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
          <div class="bybit-da-overlay-label">Trading P&L</div>
          <div class="bybit-da-overlay-value ${summary.totalTradingPnlUsdt >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatUsd(summary.totalTradingPnlUsdt))}</div>
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
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Avg APR / Settled</div>
          <div class="bybit-da-overlay-value">${escapeHtml(formatPercent(summary.avgApr))}</div>
          <div class="bybit-da-muted" style="margin-top:4px">${escapeHtml(formatPercent(summary.avgSettledApr))}</div>
        </div>
      </div>
      ${vwapHtml ? '<div class="bybit-da-overlay-label bybit-da-section-label">VWAP Target Prices</div><div class="bybit-da-overlay-grid">' + vwapHtml + "</div>" : ""}
      ${chartHtml}
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Dual Asset Orders</div>
        <div class="bybit-da-overlay-table-wrap">
          <table class="bybit-da-overlay-table">
            <thead>
              <tr>
                <th>Order Date</th>
                <th>Product</th>
                <th>Direction</th>
                <th>Target</th>
                <th>Amount</th>
                <th>APR / Settled</th>
                <th>Earned</th>
                <th>Earned USDT</th>
                <th>Trading Gain</th>
                <th>Status</th>
                <th>Settled</th>
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

  async function fetchSpotPrices(orders) {
    const symbols = new Set();
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === "Active") {
        var pair = orders[i].productName.split(" ")[0].replace("-", "");
        symbols.add(pair);
      }
    }

    var promises = [];
    symbols.forEach(function fetchTicker(symbol) {
      promises.push(
        fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=" + symbol)
          .then(function handleResp(r) { return r.json(); })
          .then(function handleJson(data) {
            if (
              data.retCode === 0 &&
              data.result &&
              data.result.list &&
              data.result.list.length
            ) {
              spotPrices[symbol] = Number(data.result.list[0].lastPrice);
            }
          })
          .catch(function ignore() {})
      );
    });

    await Promise.all(promises);
  }

  function getStrikeStatus(order) {
    if (order.status !== "Active") {
      return null;
    }

    var symbol = order.productName.split(" ")[0].replace("-", "");
    var currentPrice = spotPrices[symbol];
    if (!currentPrice || !order.targetPrice) {
      return null;
    }

    var triggering = order.orderDirection === "Buy Low"
      ? currentPrice <= order.targetPrice
      : currentPrice >= order.targetPrice;

    return {
      triggering: triggering,
      currentPrice: currentPrice,
    };
  }

  function getDurationLabel(duration) {
    var d = Number(duration);
    if (d === 0) return "8h";
    return d + "d";
  }

  function getCoinPairName(coinX, coinY) {
    var base = COIN_NAMES[coinY] || ("#" + coinY);
    var quote = COIN_NAMES[coinX] || ("#" + coinX);
    return base + "-" + quote;
  }

  async function fetchAvailableProducts() {
    productsData = { status: "loading", error: null, items: [] };

    var candidates = [
      { url: "https://www.bybit.com/x-api/s1/byfi/get-products-info", body: { product_type: 2 } },
      { url: "https://www.bybit.com/x-api/s1/byfi/dual-assets/config", body: { product_type: 2 } },
      { url: "https://www.bybit.com/x-api/s1/byfi/dual-asset-mining/config", body: {} },
      { url: "https://www.bybit.com/x-api/s1/byfi/dual-asset-mining/products-info", body: { product_type: 2 } },
      { url: "https://www.bybit.com/x-api/s1/byfi/get-dual-assets-config", body: { product_type: 2 } },
      { url: "https://www.bybit.com/x-api/s1/byfi/get-products-extra-info", body: { product_type: 2, dual_assets_reqs: [] } },
      { url: "https://www.bybit.com/x-api/s1/byfi/dual-assets/products-info", body: { product_type: 2 } },
      { url: "https://www.bybit.com/x-api/s1/byfi/get-coins", body: {} },
    ];

    var results = [];

    try {
      for (var ci = 0; ci < candidates.length; ci++) {
        var c = candidates[ci];
        try {
          var resp = await fetch(c.url, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(c.body),
          });
          var shortUrl = c.url.replace("https://www.bybit.com/x-api/s1/byfi/", "");
          if (!resp.ok) {
            results.push(shortUrl + "→HTTP" + resp.status);
          } else {
            var body = await resp.json();
            var keys = body.result ? Object.keys(body.result).join(",") : Object.keys(body).join(",");
            var hasReqs2 = (body.dual_assets_reqs || (body.result && body.result.dual_assets_reqs)) ? "HAS_REQS" : "";
            results.push(shortUrl + "→" + (body.ret_code || 0) + "[" + keys + "]" + hasReqs2);
          }
        } catch (e2) {
          results.push(c.url.split("/").pop() + "→ERR:" + e2.message);
        }
      }

      if (results.length > 0) {
        throw new Error("Currently probing APIs: Check console for available products endpoint.");
      }
    } catch (error) {
      productsData = {
        status: "idle",
        error: null,
        items: [],
      };
    }
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

    fetchAvailableProducts().then(function onProductsDone() {
      if (fetchId === latestFetchId) {
        renderDataState();
      }
    });

    const PAGE_LIMIT = 50;
    try {
      const allRows = [];
      let endAt = null;

      for (let page = 0; page < 50; page += 1) {
        const requestBody = {
          product_type: 2,
          only_effective_order: false,
          start_at: null,
          end_at: endAt,
          base_coin: null,
          limit: 10,
        };

        const response = await fetch(ORDERS_ENDPOINT, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(requestBody),
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

        allRows.push(...rows);

        if (rows.length === 0) {
          break;
        }

        let oldestCreatedAt = Infinity;
        for (let i = 0; i < rows.length; i += 1) {
          const ts = Number(rows[i].created_at);
          if (Number.isFinite(ts) && ts < oldestCreatedAt) {
            oldestCreatedAt = ts;
          }
        }

        if (!Number.isFinite(oldestCreatedAt) || rows.length < 10) {
          break;
        }

        endAt = oldestCreatedAt - 1;
      }

      const normalized = allRows.map(normalizeOrder);
      await fetchSpotPrices(normalized);

      dataState = {
        status: normalized.length ? "success" : "empty",
        error: null,
        lastUpdatedAt: new Date(),
        orders: normalized,
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

  function tickCountdowns() {
    var els = bodyEl.querySelectorAll("[data-countdown-target]");
    for (var i = 0; i < els.length; i++) {
      var target = Number(els[i].getAttribute("data-countdown-target"));
      if (!target) {
        continue;
      }

      var diff = target - Date.now();
      if (diff <= 0) {
        els[i].textContent = "Settling...";
      } else {
        var hours = Math.floor(diff / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);
        els[i].textContent = hours + "h " + minutes + "m " + seconds + "s";
      }
    }
  }

  setInterval(tickCountdowns, 1000);

  readState().then(function mountOverlay(savedState) {
    state = { ...DEFAULT_STATE, ...(savedState || {}) };
    applyState(state);
    renderDataState();
    loadOrders();
  });
})();
