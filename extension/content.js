(function initBybitDualAssetOverlay() {
  const OVERLAY_ID = "bybit-dual-asset-overlay-root";
  const STORAGE_KEY = "bybitDualAssetOverlayState";
  const ORDERS_ENDPOINT = "https://www.bybit.com/x-api/s1/byfi/dual-assets/orders";
  const PRODUCTS_ENDPOINT = "https://www.bybit.com/x-api/s1/byfi/get-products-extra-info";
  const OPTIONS_HISTORY_ENDPOINT = "https://www.bybit.com/x-api/unified/option/v5/queryUserOrderHistory";
  const OPTIONS_POSITION_ENDPOINT_CANDIDATES = [
    {
      id: "webQueryPositionList",
      url: "https://www.bybit.com/x-api/unified/option/v5/queryPositionList",
      method: "POST",
      initialCursor: "0",
      buildBody: function buildBody(cursor) {
        return {
          category: "option",
          baseCoin: "",
          limit: 200,
          cursor: cursor || "0",
        };
      },
    },
    {
      id: "webQueryPositionInfo",
      url: "https://www.bybit.com/x-api/unified/option/v5/queryPositionInfo",
      method: "POST",
      initialCursor: "0",
      buildBody: function buildBody(cursor) {
        return {
          category: "option",
          baseCoin: "",
          limit: 200,
          cursor: cursor || "0",
        };
      },
    },
    {
      id: "webUnifiedPrivatePositionList",
      url: "https://www.bybit.com/x-api/unified/v5/private/position/list",
      method: "GET",
      initialCursor: "",
      buildParams: function buildParams(cursor) {
        const params = new URLSearchParams({
          category: "option",
          limit: "200",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        return params;
      },
    },
    {
      id: "webV5PositionList",
      url: "https://www.bybit.com/x-api/v5/position/list",
      method: "GET",
      initialCursor: "",
      buildParams: function buildParams(cursor) {
        const params = new URLSearchParams({
          category: "option",
          limit: "200",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        return params;
      },
    },
    {
      id: "apiV5PositionList",
      url: "https://api.bybit.com/v5/position/list",
      method: "GET",
      initialCursor: "",
      buildParams: function buildParams(cursor) {
        const params = new URLSearchParams({
          category: "option",
          limit: "200",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        return params;
      },
    },
  ];
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
    activeTab: "dual-asset",
    chartVisible: true,
    sectionSummary: true,
    sectionCostBasis: true,
    sectionImbalance: true,
    sectionChart: true,
    sectionOrders: true,
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
        <div class="bybit-da-overlay-title">Bybit Intelligence</div>
        <div class="bybit-da-overlay-subtitle">Live Bybit portfolio overlay</div>
      </div>
      <div class="bybit-da-overlay-actions">
        <button type="button" class="bybit-da-overlay-button" data-action="refresh" aria-label="Refresh data">Refresh</button>
        <button type="button" class="bybit-da-overlay-button" data-action="minimize" aria-label="Minimize overlay">_</button>
      </div>
    </div>
    <div class="bybit-da-tab-bar">
      <button type="button" class="bybit-da-tab-btn" data-tab="dual-asset">Dual Asset</button>
      <button type="button" class="bybit-da-tab-btn" data-tab="options">Options</button>
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
  const tabBarEl = windowEl.querySelector(".bybit-da-tab-bar");

  let state = { ...DEFAULT_STATE };
  let isFetchingDualAsset = false;
  let latestDualAssetFetchId = 0;
  let isFetchingOptions = false;
  let latestOptionsFetchId = 0;
  let optionPositionsEndpointConfig = null;

  function setRefreshButtonLoading() {
    if (refreshButton) {
      refreshButton.disabled = isFetchingDualAsset || isFetchingOptions;
    }
  }
  let spotPrices = {};
  let selectedVwapProduct = null;
  let selectedImbalanceProduct = null;
  let dataState = {
    status: "loading",
    error: null,
    lastUpdatedAt: null,
    orders: [],
    imbalancePositions: [],
  };
  let optionsDataState = {
    status: "loading",
    error: null,
    isRefreshing: false,
    lastUpdatedAt: null,
    orders: [],
    positions: [],
    openSummary: createEmptyOptionsOpenSummary(),
    ordersStatus: "loading",
    positionsStatus: "loading",
    ordersStale: false,
    positionsStale: false,
    ordersError: null,
    positionsError: null,
    historyDebugMsg: "",
    positionsDebugMsg: "",
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

  function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
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
        principalForApr = investmentAmount;
      } else if (targetPrice > 0) {
        const convertedPrincipal =
          orderDirection === "Sell High"
            ? investmentAmount * targetPrice
            : investmentAmount / targetPrice;
        profitAmount = proceeds - convertedPrincipal;
        profitToken = proceedsToken;
        principalForApr = convertedPrincipal;
      }
      winOrLoss = proceedsToken === pair.quoteAsset ? "Win" : "Loss";
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
          buyLowQuoteVolume: 0,
          buyLowBaseVolume: 0,
          sellHighQuoteVolume: 0,
          sellHighBaseVolume: 0,
          convertedBuyQuoteVolume: 0,
          convertedBuyBaseVolume: 0,
          convertedSellQuoteVolume: 0,
          convertedSellBaseVolume: 0,
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

      if (order.realApr !== null && order.realApr > 0) {
        vwap[key].settledAprSum += order.realApr;
        vwap[key].settledAprCount += 1;
      }

      if (order.targetPrice > 0) {
        if (order.orderDirection === "Buy Low") {
          vwap[key].buyLowQuoteVolume += order.investmentAmount;
          vwap[key].buyLowBaseVolume += order.investmentAmount / order.targetPrice;
        } else {
          vwap[key].sellHighBaseVolume += order.investmentAmount;
          vwap[key].sellHighQuoteVolume += order.investmentAmount * order.targetPrice;
        }
      }

      const isConverted = order.status === "Completed"
        && order.proceedsToken !== null
        && order.proceedsToken !== order.investmentToken;

      if (isConverted && order.targetPrice > 0) {
        if (order.orderDirection === "Buy Low") {
          vwap[key].convertedBuyQuoteVolume += order.investmentAmount;
          vwap[key].convertedBuyBaseVolume += order.investmentAmount / order.targetPrice;
        } else {
          vwap[key].convertedSellBaseVolume += order.investmentAmount;
          vwap[key].convertedSellQuoteVolume += order.investmentAmount * order.targetPrice;
        }
      }

      if (order.status === "Completed" && usdValue !== null) {
        cumulativeUsdtProfit += usdValue;
      }
    }

    let totalTradingPnlUsdt = 0;
    let runningUsdtProfit = 0;
    let runningTradingPnlUsdt = 0;
    const runningLedger = {};

    for (const order of sorted) {
      if (order.status !== "Completed") continue;
      
      const key = order.productName.split(" ")[0];
      const pairData = vwap[key];
      let addPoint = false;

      if (pairData) {
        const isConverted = order.proceedsToken !== null && order.proceedsToken !== order.investmentToken;

        if (isConverted && order.targetPrice > 0) {
          if (!runningLedger[key]) {
            runningLedger[key] = { base: 0, quote: 0 };
          }
          const ledger = runningLedger[key];

          if (order.orderDirection === "Buy Low") {
            ledger.base += order.investmentAmount / order.targetPrice;
            ledger.quote += order.investmentAmount;
          } else if (order.orderDirection === "Sell High") {
            if (ledger.base > 0) {
              const costBasis = ledger.quote / ledger.base;
              const gain = (order.targetPrice - costBasis) * order.investmentAmount;
              order.tradingGainUsdt = gain;
              pairData.tradingPnlUsdt += gain;
              totalTradingPnlUsdt += gain;
              runningTradingPnlUsdt += gain;

              ledger.base -= order.investmentAmount;
              ledger.quote -= order.investmentAmount * costBasis;
              if (ledger.base < 0) ledger.base = 0;
              if (ledger.quote < 0) ledger.quote = 0;

              addPoint = true;
            }
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
          existing.cumulativeTotal = runningUsdtProfit + runningTradingPnlUsdt;
        } else {
          timelinePoints.push({
            date: dateLabel,
            profit: usdValue || 0,
            cumulative: runningUsdtProfit,
            tradingPnl: order.tradingGainUsdt || 0,
            cumulativeTrading: runningTradingPnlUsdt,
            cumulativeTotal: runningUsdtProfit + runningTradingPnlUsdt,
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

      if (sorted[j].realApr !== null && sorted[j].realApr > 0) {
        settledAprSum += sorted[j].realApr;
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
        buyLowVwap: data.buyLowBaseVolume > 0
          ? data.buyLowQuoteVolume / data.buyLowBaseVolume : 0,
        sellHighVwap: data.sellHighBaseVolume > 0
          ? data.sellHighQuoteVolume / data.sellHighBaseVolume : 0,
        convertedBuyVwap: data.convertedBuyBaseVolume > 0
          ? data.convertedBuyQuoteVolume / data.convertedBuyBaseVolume : 0,
        convertedSellVwap: data.convertedSellBaseVolume > 0
          ? data.convertedSellQuoteVolume / data.convertedSellBaseVolume : 0,
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

  function buildImbalanceTracker(orders) {
    const sorted = [...orders].sort(function bySettlement(a, b) {
      const ta = (a.settlementTime || a.orderTime || new Date(0)).getTime();
      const tb = (b.settlementTime || b.orderTime || new Date(0)).getTime();
      return ta - tb;
    });

    const positions = {};

    for (const order of sorted) {
      if (order.status !== "Completed" || !order.proceedsToken) continue;

      const pairKey = order.productName.split(" ")[0];
      const isConverted = order.proceedsToken !== order.investmentToken;

      if (!positions[pairKey]) {
        positions[pairKey] = {
          pair: pairKey,
          baseAsset: order.baseAsset,
          quoteAsset: order.quoteAsset,
          netCryptoHolding: 0,
          totalUsdtOutlay: 0,
          totalPremiumsCrypto: 0,
        };
      }
      const pos = positions[pairKey];

      if (order.orderDirection === "Buy Low" && isConverted) {
        pos.netCryptoHolding += order.proceeds;
        pos.totalUsdtOutlay += order.investmentAmount;
      } else if (order.orderDirection === "Sell High" && !isConverted && pos.netCryptoHolding > 0) {
        if (order.profitAmount !== null && order.profitAmount > 0) {
          pos.totalPremiumsCrypto += order.profitAmount;
        }
      } else if (order.orderDirection === "Sell High" && isConverted) {
        if (pos.netCryptoHolding > 0 && pos.totalUsdtOutlay > 0) {
          const avgEntry = pos.totalUsdtOutlay / pos.netCryptoHolding;
          const soldCrypto = order.investmentAmount;
          const proportionSold = Math.min(soldCrypto / pos.netCryptoHolding, 1);
          pos.totalUsdtOutlay -= pos.totalUsdtOutlay * proportionSold;
          pos.netCryptoHolding -= soldCrypto;
          if (pos.netCryptoHolding < 1e-12) {
            pos.netCryptoHolding = 0;
            pos.totalUsdtOutlay = 0;
            pos.totalPremiumsCrypto = 0;
          }
        }
      }
    }

    const result = [];
    const keys = Object.keys(positions);
    for (var i = 0; i < keys.length; i++) {
      var pos = positions[keys[i]];
      if (pos.netCryptoHolding <= 0) continue;

      var symbol = pos.pair.replace("-", "");
      var currentPrice = spotPrices[symbol] || 0;
      var avgEntryPrice = pos.totalUsdtOutlay / pos.netCryptoHolding;
      var totalPremiumsUsdt = pos.totalPremiumsCrypto * currentPrice;
      var currentValueUsdt = pos.netCryptoHolding * currentPrice;
      var floatingPnlUsdt = currentValueUsdt - pos.totalUsdtOutlay;
      var netPnlUsdt = floatingPnlUsdt + totalPremiumsUsdt;
      var breakEvenPrice = pos.netCryptoHolding > 0
        ? (pos.totalUsdtOutlay - totalPremiumsUsdt) / pos.netCryptoHolding
        : 0;
      var pctRecovered = pos.totalUsdtOutlay > 0
        ? Math.min((totalPremiumsUsdt / pos.totalUsdtOutlay) * 100, 100)
        : 0;

      result.push({
        pair: pos.pair,
        baseAsset: pos.baseAsset,
        quoteAsset: pos.quoteAsset,
        symbol: symbol,
        netCryptoHolding: pos.netCryptoHolding,
        totalUsdtOutlay: pos.totalUsdtOutlay,
        avgEntryPrice: avgEntryPrice,
        currentPrice: currentPrice,
        totalPremiumsCrypto: pos.totalPremiumsCrypto,
        totalPremiumsUsdt: totalPremiumsUsdt,
        currentValueUsdt: currentValueUsdt,
        floatingPnlUsdt: floatingPnlUsdt,
        netPnlUsdt: netPnlUsdt,
        breakEvenPrice: breakEvenPrice,
        pctRecovered: pctRecovered,
      });
    }

    return result;
  }

  function createEmptyOptionsOpenSummary() {
    return {
      callOpenSize: 0,
      putOpenSize: 0,
      openPositionCount: 0,
      callPositionCount: 0,
      putPositionCount: 0,
      unknownPositionCount: 0,
    };
  }

  function parseOptionTypeFromSymbol(symbol) {
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    if (normalizedSymbol.endsWith("-C")) {
      return "CALL";
    }
    if (normalizedSymbol.endsWith("-P")) {
      return "PUT";
    }
    return null;
  }

  function normalizeOpenOptionPosition(row) {
    const size = parseFiniteNumber(row && row.size);
    if (size === null || size <= 0) {
      return null;
    }

    const symbol = String((row && row.symbol) || "");

    return {
      symbol,
      side: String((row && row.side) || ""),
      size,
      positionValue: parseFiniteNumber(row && row.positionValue),
      avgPrice: parseFiniteNumber(row && row.avgPrice),
      optionType: parseOptionTypeFromSymbol(symbol),
    };
  }

  function buildOpenOptionsSummary(positions) {
    const summary = createEmptyOptionsOpenSummary();

    for (let i = 0; i < positions.length; i += 1) {
      const position = positions[i];
      summary.openPositionCount += 1;

      if (position.optionType === "CALL") {
        summary.callOpenSize += position.size;
        summary.callPositionCount += 1;
      } else if (position.optionType === "PUT") {
        summary.putOpenSize += position.size;
        summary.putPositionCount += 1;
      } else {
        summary.unknownPositionCount += 1;
      }
    }

    return summary;
  }

  function formatPositionCount(count) {
    return `${count} position${count === 1 ? "" : "s"}`;
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
    const totalValues = points.map(function getVal(p) { return p.cumulativeTotal || 0; });
    const allValues = values.concat(tradingValues).concat(totalValues);
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

    const totalPath = points
      .map(function toCoord(p, i) {
        return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulativeTotal || 0).toFixed(1)}`;
      })
      .join(" ");

    const totalAreaPath = totalPath +
      ` L${x(points.length - 1).toFixed(1)},${(padding.top + chartH).toFixed(1)}` +
      ` L${x(0).toFixed(1)},${(padding.top + chartH).toFixed(1)} Z`;

    const totalDots = points
      .map(function toDot(p, i) {
        return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cumulativeTotal || 0).toFixed(1)}" r="3" fill="#f59e0b"/>`;
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
      <path d="${totalAreaPath}" fill="url(#bybitTotalGrad)" opacity="0.3"/>
      <path d="${areaPath}" fill="url(#bybitDaGrad)" opacity="0.3"/>
      <path d="${tradingAreaPath}" fill="url(#bybitTradingGrad)" opacity="0.3"/>
      <path d="${totalPath}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
      <path d="${linePath}" fill="none" stroke="#34d399" stroke-width="2" stroke-linejoin="round"/>
      <path d="${tradingPath}" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linejoin="round"/>
      ${totalDots}
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
        <linearGradient id="bybitTotalGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>`;
  }

  function getStateBadge() {
    if (dataState.status === "loading") {
      return '<div class="bybit-da-overlay-badge is-loading">Loading live Bybit orders...</div>';
    }
    if (dataState.status === "error") {
      return `<div class="bybit-da-overlay-badge is-error">Error loading orders</div>`;
    }
    if (dataState.status === "empty") {
      return `<div class="bybit-da-overlay-badge is-empty">No Active/Settling Dual Asset Orders</div>`;
    }
    if (dataState.status === "success") {
      const activeCount = dataState.orders.filter(function(o) { return o.status === "Active"; }).length;
      return `<div class="bybit-da-overlay-badge">Tracking ${activeCount} active order${activeCount === 1 ? "" : "s"}</div>`;
    }
    return "";
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

  function sectionHeader(label, stateKey, rightHtml) {
    var isOpen = state[stateKey] !== false;
    return '<div class="bybit-da-section-header">'
      + '<div class="bybit-da-section-header-left">'
      + '<button type="button" class="bybit-da-section-toggle" data-toggle-section="' + stateKey + '">'
      + (isOpen ? '▾' : '▸') + '</button>'
      + '<div class="bybit-da-overlay-label bybit-da-section-label" style="margin:0">' + escapeHtml(label) + '</div>'
      + '</div>'
      + (rightHtml || '')
      + '</div>';
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

    if (summary.avgTargetPrices.length > 0 && !selectedVwapProduct) {
      selectedVwapProduct = summary.avgTargetPrices[0].product;
    }

    let vwapHtml = "";
    if (summary.avgTargetPrices.length > 0) {
      const targetTp = summary.avgTargetPrices.find(function(tp) { return tp.product === selectedVwapProduct; }) || summary.avgTargetPrices[0];
      
      const tabsHtml = summary.avgTargetPrices.map(function(tp) {
        const isActive = tp.product === targetTp.product;
        return '<button type="button" class="bybit-da-vwap-tab' + (isActive ? ' is-active' : '') + '" data-vwap-product="' + escapeHtml(tp.product) + '">' + escapeHtml(tp.product.split("-")[0]) + '</button>';
      }).join("");

      vwapHtml = sectionHeader("Cost Basis & Trading", "sectionCostBasis", '<div class="bybit-da-vwap-tabs">' + tabsHtml + '</div>')
        + (state.sectionCostBasis !== false ? `
        <div class="bybit-da-overlay-card bybit-da-vwap-card">
          <div class="bybit-da-vwap-row">
            <div>
              <div class="bybit-da-vwap-dir">Converted Buy VWAP</div>
              <div class="bybit-da-vwap-price is-buy">${targetTp.convertedBuyVwap > 0 ? escapeHtml(formatNumber(targetTp.convertedBuyVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "-"}</div>
            </div>
            <div>
              <div class="bybit-da-vwap-dir">Trading P&L</div>
              <div class="bybit-da-vwap-price ${targetTp.tradingPnlUsdt >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatUsd(targetTp.tradingPnlUsdt))}</div>
            </div>
          </div>
          <div class="bybit-da-vwap-row" style="margin-top:6px">
            <div>
              <div class="bybit-da-vwap-dir">Avg APR</div>
              <div class="bybit-da-vwap-apr">${escapeHtml(formatPercent(targetTp.avgApr))}</div>
            </div>
            <div>
              <div class="bybit-da-vwap-dir">Avg Settled APR</div>
              <div class="bybit-da-vwap-apr">${escapeHtml(formatPercent(targetTp.avgSettledApr))}</div>
            </div>
          </div>
          <div class="bybit-da-vwap-tip-inner">
            💡 Set your <strong>Sell High</strong> target above <strong>${targetTp.convertedBuyVwap > 0 ? escapeHtml(formatNumber(targetTp.convertedBuyVwap, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "the cost basis"}</strong> to profit from the spread on top of the premium.
          </div>
        </div>
      ` : "");
    }

    const chartLegend = state.sectionChart !== false
      ? '<span style="font-size:10px;color:#34d399;">■ Yield</span> <span style="font-size:10px;color:#60a5fa;">■ Trading</span> <span style="font-size:10px;color:#f59e0b;">■ Total</span>'
      : '';
    const chartHtml = summary.timelinePoints.length > 1
      ? sectionHeader("Cumulative Profit Timeline", "sectionChart", chartLegend)
        + (state.sectionChart !== false ? `<div class="bybit-da-overlay-card">
          <div class="bybit-da-chart-wrap">${buildSvgTimeline(summary.timelinePoints, 440, 160)}</div>
        </div>` : "")
      : "";

    let imbalanceHtml = "";
    const imbalancePositions = dataState.imbalancePositions || [];
    if (imbalancePositions.length > 0) {
      if (!selectedImbalanceProduct) {
        selectedImbalanceProduct = imbalancePositions[0].pair;
      }
      const activePos = imbalancePositions.find(function(p) { return p.pair === selectedImbalanceProduct; }) || imbalancePositions[0];

      const imbalanceTabsHtml = imbalancePositions.map(function(p) {
        const isActive = p.pair === activePos.pair;
        return '<button type="button" class="bybit-da-vwap-tab' + (isActive ? ' is-active' : '') + '" data-imbalance-product="' + escapeHtml(p.pair) + '">' + escapeHtml(p.baseAsset) + '</button>';
      }).join("");

      var floatingClass = activePos.floatingPnlUsdt >= 0 ? "is-positive" : "is-negative";
      var netClass = activePos.netPnlUsdt >= 0 ? "is-positive" : "is-negative";
      var progressPct = Math.max(0, Math.min(100, activePos.pctRecovered));

      imbalanceHtml = sectionHeader("Imbalance Tracker", "sectionImbalance", '<div class="bybit-da-vwap-tabs">' + imbalanceTabsHtml + '</div>')
        + (state.sectionImbalance !== false ? `
        <div class="bybit-da-overlay-card bybit-da-imbalance-card">
          <div class="bybit-da-imbalance-grid">
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Avg Entry Price</div>
              <div class="bybit-da-imbalance-value">${escapeHtml(formatUsd(activePos.avgEntryPrice))}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Current Price</div>
              <div class="bybit-da-imbalance-value">${activePos.currentPrice > 0 ? escapeHtml(formatUsd(activePos.currentPrice)) : "-"}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Holding</div>
              <div class="bybit-da-imbalance-value">${escapeHtml(formatAmount(activePos.netCryptoHolding, activePos.baseAsset, 6))}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Cost Basis</div>
              <div class="bybit-da-imbalance-value">${escapeHtml(formatUsd(activePos.totalUsdtOutlay))}</div>
            </div>
          </div>
          <div class="bybit-da-imbalance-divider"></div>
          <div class="bybit-da-imbalance-grid">
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Floating P&L</div>
              <div class="bybit-da-imbalance-value ${floatingClass}">${escapeHtml(formatUsd(activePos.floatingPnlUsdt))}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Premiums Earned</div>
              <div class="bybit-da-imbalance-value is-positive">${escapeHtml(formatAmount(activePos.totalPremiumsCrypto, activePos.baseAsset, 6))}</div>
              <div class="bybit-da-muted">${activePos.totalPremiumsUsdt > 0 ? "~" + escapeHtml(formatUsd(activePos.totalPremiumsUsdt)) : ""}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Net P&L</div>
              <div class="bybit-da-imbalance-value ${netClass}">${escapeHtml(formatUsd(activePos.netPnlUsdt))}</div>
            </div>
            <div class="bybit-da-imbalance-metric">
              <div class="bybit-da-imbalance-label">Breakeven Price</div>
              <div class="bybit-da-imbalance-value">${activePos.breakEvenPrice > 0 ? escapeHtml(formatUsd(activePos.breakEvenPrice)) : "-"}</div>
            </div>
          </div>
          <div class="bybit-da-imbalance-progress-wrap">
            <div class="bybit-da-imbalance-progress-bar">
              <div class="bybit-da-imbalance-progress-fill" style="width:${progressPct.toFixed(1)}%"></div>
            </div>
            <div class="bybit-da-imbalance-progress-label">${escapeHtml(formatNumber(progressPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}% recovered by premiums</div>
          </div>
        </div>
      ` : "");
    }

    bodyEl.innerHTML = `
      ${getStateBadge()}
      <div class="bybit-da-overlay-meta">
        <span>Last refresh: ${escapeHtml(lastUpdatedLabel)}</span>
        <span>Orders: ${escapeHtml(String(dataState.orders.length))}</span>
      </div>
      ${sectionHeader("Summary", "sectionSummary")}
      ${state.sectionSummary !== false ? `<div class="bybit-da-overlay-grid">
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Total Profit from Premium (Yield)</div>
          <div class="bybit-da-overlay-value">${escapeHtml(formatUsd(summary.totalUsdtProfit))}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Total Profit from Selling High (Trading)</div>
          <div class="bybit-da-overlay-value ${summary.totalTradingPnlUsdt >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatUsd(summary.totalTradingPnlUsdt))}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Cumulative Total Profit</div>
          <div class="bybit-da-overlay-value ${(summary.totalUsdtProfit + summary.totalTradingPnlUsdt) >= 0 ? "is-positive" : "is-negative"}">${escapeHtml(formatUsd(summary.totalUsdtProfit + summary.totalTradingPnlUsdt))}</div>
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
      </div>` : ""}
      ${vwapHtml}
      ${imbalanceHtml}
      ${chartHtml}
      ${sectionHeader("Dual Asset Orders", "sectionOrders")}
      ${state.sectionOrders !== false ? `<div class="bybit-da-overlay-card">
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
      </div>` : ""}
    `;
  }

  function renderDataState() {
    if (state.activeTab === "options") {
      renderOptionsState();
      return;
    }

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

  function renderOptionsState() {
    console.log("Bybit overlay: renderOptionsState() called. Status:", optionsDataState.status, "Closed Orders:", optionsDataState.orders, "Open Positions:", optionsDataState.positions);

    if (optionsDataState.status === "loading" && !optionsDataState.isRefreshing) {
      bodyEl.innerHTML = `
        <div class="bybit-da-overlay-badge is-loading">Loading live Options data...</div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Fetching</div>
          <div class="bybit-da-overlay-copy">Requesting closed order history plus current open option positions with the page's authenticated browser session.</div>
        </div>
      `;
      return;
    }

    if (optionsDataState.status === "error") {
      const debugLines = [optionsDataState.positionsDebugMsg, optionsDataState.historyDebugMsg]
        .filter(Boolean)
        .join("\n");

      bodyEl.innerHTML = `
        <div class="bybit-da-overlay-badge is-error">Unable to fetch Options data</div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Request failed</div>
          <div class="bybit-da-overlay-copy">${escapeHtml(optionsDataState.error || "Unknown error")}</div>
        </div>
        ${debugLines ? `
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Debug Payload</div>
          <div class="bybit-da-overlay-copy" style="font-family: monospace; font-size: 10px; max-height: 150px; overflow-y: auto;">${escapeHtml(debugLines)}</div>
        </div>` : ""}
      `;
      return;
    }

    let totalNetPnl = 0;
    for (let i = 0; i < optionsDataState.orders.length; i++) {
      totalNetPnl += (optionsDataState.orders[i].netPnl || 0);
    }

    const openSummary = optionsDataState.openSummary || createEmptyOptionsOpenSummary();
    const lastUpdatedLabel = optionsDataState.lastUpdatedAt ? formatDateTime(optionsDataState.lastUpdatedAt) : "-";
    const hasPartialError = optionsDataState.positionsError || optionsDataState.ordersError;
    const badgeText = optionsDataState.isRefreshing
      ? "Refreshing Options data..."
      : hasPartialError
        ? "Live Options loaded with partial data"
        : "Live Options loaded";
    const badgeClass = optionsDataState.isRefreshing
      ? " is-loading"
      : hasPartialError
        ? " is-empty"
        : "";

    const rowsHtml = optionsDataState.orders.map(function renderOptionRow(o) {
      const isPositive = o.netPnl >= 0;
      const orderDate = o.parsedDate;
      const pnlDisplay = o.netPnl !== 0 ? formatUsd(o.netPnl) : "--";

      return `
        <tr>
          <td class="bybit-da-muted">${escapeHtml(formatDateTime(orderDate))}</td>
          <td>${escapeHtml(o.symbol)}</td>
          <td>
            <span class="bybit-da-pill ${o.side === 'Buy' ? 'is-buy' : 'is-sell'}">${escapeHtml(o.side)} ${escapeHtml(o.action || "")}</span>
          </td>
          <td>${escapeHtml(formatAmount(o.cumExecQty, "", 4))}</td>
          <td>${escapeHtml(formatAmount(o.orderAvgPrice, "", 4))}</td>
          <td class="bybit-da-muted">${escapeHtml(formatUsd(o.cumExecFee || o.cashFlow))}</td>
          <td class="${isPositive && o.netPnl !== 0 ? 'is-positive' : o.netPnl !== 0 ? 'is-negative' : ''}">${escapeHtml(pnlDisplay)}</td>
        </tr>
      `;
    }).join("");

    let openCallValue = "-";
    let openPutValue = "-";
    let openPositionsValue = "-";
    let openCallCopy = "Unable to load open CALL positions.";
    let openPutCopy = "Unable to load open PUT positions.";
    let openPositionsCopy = "Unable to load open option positions.";

    if (optionsDataState.positionsStatus !== "error") {
      openCallValue = formatAmount(openSummary.callOpenSize, "", 4);
      openPutValue = formatAmount(openSummary.putOpenSize, "", 4);
      openPositionsValue = String(openSummary.openPositionCount);

      if (optionsDataState.positionsStatus === "empty") {
        openCallCopy = "No open CALL positions returned.";
        openPutCopy = "No open PUT positions returned.";
        openPositionsCopy = "No open option positions returned.";
      } else {
        openCallCopy = `Tracked across ${formatPositionCount(openSummary.callPositionCount)}.`;
        openPutCopy = `Tracked across ${formatPositionCount(openSummary.putPositionCount)}.`;
        openPositionsCopy = openSummary.unknownPositionCount > 0
          ? `${formatPositionCount(openSummary.openPositionCount)} total. ${openSummary.unknownPositionCount} symbol(s) could not be classified as CALL or PUT.`
          : `${formatPositionCount(openSummary.openPositionCount)} across all open option positions.`;
      }
    }

    let totalPnlValue = "-";
    let totalPnlClass = "";
    let totalPnlCopy = "Closed options history unavailable.";

    if (optionsDataState.ordersStatus !== "error") {
      totalPnlValue = formatUsd(totalNetPnl);
      totalPnlClass = optionsDataState.ordersStatus === "success"
        ? (totalNetPnl >= 0 ? "is-positive" : "is-negative")
        : "";
      totalPnlCopy = optionsDataState.ordersStatus === "empty"
        ? "No closed options orders found in the last 180 days."
        : "Sum of all filled Options PnL in the period. (Bypasses Bybit UI double-fee counting bug)";
    }

    const positionsIssueHtml = optionsDataState.positionsError
      ? `
        <div class="bybit-da-overlay-card" style="margin-top: 12px;">
          <div class="bybit-da-overlay-label">${optionsDataState.positionsStale ? "Open Positions Refresh Failed" : "Open Positions Unavailable"}</div>
          <div class="bybit-da-overlay-copy">${escapeHtml(optionsDataState.positionsError || "Unable to load open option positions.")}${optionsDataState.positionsStale ? " Showing the last successful snapshot." : ""}</div>
          ${optionsDataState.positionsDebugMsg ? `<div class="bybit-da-muted" style="margin-top: 8px; font-family: monospace; font-size: 10px;">${escapeHtml(optionsDataState.positionsDebugMsg)}</div>` : ""}
        </div>
      `
      : "";

    let historySectionHtml = "";
    if (optionsDataState.ordersStatus === "error" && !optionsDataState.ordersStale) {
      historySectionHtml = `
        <div class="bybit-da-overlay-card" style="margin-top: 12px;">
          <div class="bybit-da-overlay-label">Closed Options Records</div>
          <div class="bybit-da-overlay-copy">${escapeHtml(optionsDataState.ordersError || "Unable to load closed options history.")}</div>
          ${optionsDataState.historyDebugMsg ? `<div class="bybit-da-muted" style="margin-top: 8px; font-family: monospace; font-size: 10px;">${escapeHtml(optionsDataState.historyDebugMsg)}</div>` : ""}
        </div>
      `;
    } else if (optionsDataState.ordersStatus === "empty") {
      historySectionHtml = `
        <div class="bybit-da-overlay-card" style="margin-top: 12px;">
          <div class="bybit-da-overlay-label">Closed Options Records</div>
          <div class="bybit-da-overlay-copy">No closed options orders were returned for the last 180 days.</div>
          ${optionsDataState.historyDebugMsg ? `<div class="bybit-da-muted" style="margin-top: 8px; font-family: monospace; font-size: 10px;">${escapeHtml(optionsDataState.historyDebugMsg)}</div>` : ""}
        </div>
      `;
    } else {
      historySectionHtml = `
        <div class="bybit-da-overlay-card" style="margin-top: 12px;">
          <div class="bybit-da-overlay-label">Closed Options Records</div>
          ${optionsDataState.ordersError ? `<div class="bybit-da-overlay-copy" style="margin-bottom: 10px;">${escapeHtml(optionsDataState.ordersError)}${optionsDataState.ordersStale ? " Showing the last successful snapshot." : ""}</div>` : ""}
          <div class="bybit-da-overlay-table-wrap">
            <table class="bybit-da-overlay-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contract</th>
                  <th>Operation</th>
                  <th>Qty</th>
                  <th>Avg Price</th>
                  <th>Fees</th>
                  <th>Net P&L</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    const openPositionsMeta = optionsDataState.positionsStatus === "error" && !optionsDataState.positionsStale
      ? "Open Positions: unavailable"
      : `Open Positions: ${openSummary.openPositionCount}`;
    const closedOrdersMeta = optionsDataState.ordersStatus === "error"
      ? "Orders (Filled/Closed): unavailable"
      : `Orders (Filled/Closed): ${optionsDataState.orders.length}`;

    bodyEl.innerHTML = `
      <div class="bybit-da-overlay-badge${badgeClass}">${badgeText}</div>
      <div class="bybit-da-overlay-meta" style="margin-top: 12px">
        <span>Last refresh: ${escapeHtml(lastUpdatedLabel)}</span>
        <span>${escapeHtml(openPositionsMeta)}</span>
        <span>${escapeHtml(closedOrdersMeta)}</span>
      </div>
      <div class="bybit-da-overlay-grid">
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Open CALL Volume</div>
          <div class="bybit-da-overlay-value">${escapeHtml(openCallValue)}</div>
          <div class="bybit-da-muted" style="margin-top: 4px;">${escapeHtml(openCallCopy)}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Open PUT Volume</div>
          <div class="bybit-da-overlay-value">${escapeHtml(openPutValue)}</div>
          <div class="bybit-da-muted" style="margin-top: 4px;">${escapeHtml(openPutCopy)}</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Open Positions</div>
          <div class="bybit-da-overlay-value">${escapeHtml(openPositionsValue)}</div>
          <div class="bybit-da-muted" style="margin-top: 4px;">${escapeHtml(openPositionsCopy)}</div>
        </div>
      </div>
      <div class="bybit-da-overlay-card" style="margin-top: 12px;">
          <div class="bybit-da-overlay-label">True Total P&L (Net of Fees)</div>
          <div class="bybit-da-overlay-value ${totalPnlClass}">${escapeHtml(totalPnlValue)}</div>
          <div class="bybit-da-muted" style="margin-top: 4px;">${escapeHtml(totalPnlCopy)}</div>
      </div>
      ${positionsIssueHtml}
      ${historySectionHtml}
    `;
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

  async function fetchSpotPrices(orders, extraSymbols) {
    const symbols = new Set();
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === "Active") {
        var pair = orders[i].productName.split(" ")[0].replace("-", "");
        symbols.add(pair);
      }
      var isConverted = orders[i].status === "Completed"
        && orders[i].proceedsToken !== null
        && orders[i].proceedsToken !== orders[i].investmentToken;
      if (isConverted) {
        symbols.add(orders[i].productName.split(" ")[0].replace("-", ""));
      }
    }
    if (extraSymbols) {
      for (var j = 0; j < extraSymbols.length; j++) {
        symbols.add(extraSymbols[j]);
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

  async function loadOrders() {
    if (isFetchingDualAsset) {
      return;
    }

    isFetchingDualAsset = true;
    latestDualAssetFetchId += 1;
    const fetchId = latestDualAssetFetchId;
    setRefreshButtonLoading();
    dataState = {
      ...dataState,
      status: "loading",
      error: null,
    };
    renderDataState();

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

        if (fetchId !== latestDualAssetFetchId) {
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

      const imbalancePositions = buildImbalanceTracker(normalized);

      dataState = {
        status: normalized.length ? "success" : "empty",
        error: null,
        lastUpdatedAt: new Date(),
        orders: normalized,
        imbalancePositions: imbalancePositions,
      };
    } catch (error) {
      if (fetchId !== latestDualAssetFetchId) {
        return;
      }

      dataState = {
        ...dataState,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown fetch error",
      };
    } finally {
      if (fetchId === latestDualAssetFetchId) {
        isFetchingDualAsset = false;
        setRefreshButtonLoading();
        renderDataState();
      }
    }
  }

  async function fetchClosedOptionsOrders() {
    console.log("Bybit overlay: fetchClosedOptionsOrders() started");
    const allRows = [];
    const endTime = Date.now();
    const startTime = endTime - (180 * 24 * 60 * 60 * 1000);
    let cursor = "0";
    let historyDebugMsg = "";

    for (let page = 0; page < 30; page += 1) {
      const requestBody = {
        category: "option",
        baseCoin: "",
        orderType: 0,
        orderStatus: 0,
        limit: 20,
        direction: "",
        startTime: startTime,
        endTime: endTime,
        pageIndex: 0,
        cursor: cursor,
        action: 0,
        side: 0,
      };

      console.log(`Bybit overlay: Fetching closed Options page ${page} with cursor ${cursor}`);
      const response = await fetch(OPTIONS_HISTORY_ENDPOINT, {
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
      if (payload.retCode !== 0) {
        throw new Error(payload.retMsg || `Bybit error ${payload.retCode}`);
      }

      const result = payload.result || {};
      const rows = Array.isArray(result.list)
        ? result.list
        : Array.isArray(result.result)
          ? result.result
          : [];

      if (page === 0) {
        historyDebugMsg = `history keys: ${JSON.stringify(Object.keys(result))}; first page rows: ${rows.length}`;
      }

      console.log(`Bybit overlay: Closed Options page ${page} returned ${rows.length} rows`);
      allRows.push(...rows);

      const nextCursor = result.nextPageCursor || result.cursor || null;
      if (rows.length === 0 || !nextCursor || nextCursor === cursor || nextCursor === "0") {
        console.log("Bybit overlay: Closed Options pagination finished.");
        break;
      }

      cursor = nextCursor;
    }

    const closedOrders = [];
    for (let i = 0; i < allRows.length; i += 1) {
      const row = allRows[i];
      const rawDate = row.orderTime || row.createdTime || row.updatedTime;
      const netPnlVal = row.orderPNL ? Number(row.orderPNL) : 0;

      row.parsedDate = new Date(Number(rawDate));
      row.netPnl = netPnlVal;
      closedOrders.push(row);
    }

    console.log("Bybit overlay: Total closed Options rows fetched:", closedOrders.length);
    return {
      orders: closedOrders,
      debugMsg: historyDebugMsg,
    };
  }

  async function fetchOpenOptionsPositionsFromCandidate(candidate) {
    console.log("Bybit overlay: Trying open Options endpoint", candidate.id, candidate.url);
    const allRows = [];
    let cursor = candidate.initialCursor || "";
    let positionsDebugMsg = "";

    for (let page = 0; page < 10; page += 1) {
      let requestUrl = candidate.url;
      const requestInit = {
        method: candidate.method,
        credentials: "include",
      };

      if (candidate.method === "POST") {
        requestInit.headers = {
          "content-type": "application/json",
        };
        requestInit.body = JSON.stringify(candidate.buildBody(cursor));
      } else {
        const params = candidate.buildParams(cursor);
        const query = params.toString();
        if (query) {
          requestUrl += `?${query}`;
        }
      }

      const response = await fetch(requestUrl, requestInit);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload = await response.json();
      if (payload.retCode !== 0) {
        throw new Error(payload.retMsg || `Bybit error ${payload.retCode}`);
      }

      const result = payload.result || {};
      const hasExpectedRowsShape = Array.isArray(result.list) || Array.isArray(result.result);
      if (!hasExpectedRowsShape) {
        throw new Error("Unexpected options positions payload shape.");
      }

      const rows = Array.isArray(result.list)
        ? result.list
        : Array.isArray(result.result)
          ? result.result
          : [];

      if (page === 0) {
        positionsDebugMsg = `${candidate.id}: result keys ${JSON.stringify(Object.keys(result))}; first page rows: ${rows.length}`;
      }

      console.log(`Bybit overlay: Open Options page ${page} via ${candidate.id} returned ${rows.length} rows`);
      allRows.push(...rows);

      const nextCursor = result.nextPageCursor || result.cursor || null;
      if (rows.length === 0 || !nextCursor || nextCursor === cursor || nextCursor === "0") {
        break;
      }

      cursor = nextCursor;
    }

    const positions = [];
    if (allRows.length > 0 && (!allRows[0] || allRows[0].symbol === undefined || allRows[0].size === undefined)) {
      throw new Error("Unexpected options position row shape.");
    }

    for (let i = 0; i < allRows.length; i += 1) {
      const normalizedPosition = normalizeOpenOptionPosition(allRows[i]);
      if (normalizedPosition) {
        positions.push(normalizedPosition);
      }
    }

    return {
      positions: positions,
      debugMsg: `${positionsDebugMsg}; normalized positions: ${positions.length}`,
      isConfident: resultLooksLikeOptionsPositionPayload(candidate, allRows, positionsDebugMsg),
    };
  }

  function resultLooksLikeOptionsPositionPayload(candidate, allRows, positionsDebugMsg) {
    if (allRows.length > 0) {
      return true;
    }

    return candidate.id === "apiV5PositionList"
      || candidate.id === "webV5PositionList"
      || /"category"/.test(positionsDebugMsg);
  }

  async function fetchOpenOptionsPositions() {
    const candidates = optionPositionsEndpointConfig
      ? [optionPositionsEndpointConfig].concat(
        OPTIONS_POSITION_ENDPOINT_CANDIDATES.filter(function filterCandidate(candidate) {
          return candidate.id !== optionPositionsEndpointConfig.id;
        })
      )
      : OPTIONS_POSITION_ENDPOINT_CANDIDATES.slice();
    const errors = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];

      try {
        const result = await fetchOpenOptionsPositionsFromCandidate(candidate);

        if (result.positions.length > 0 || result.isConfident) {
          if (result.isConfident) {
            optionPositionsEndpointConfig = candidate;
          }
          console.log("Bybit overlay: Open Options endpoint resolved to", candidate.id);
          return result;
        }

        errors.push(`${candidate.id}: empty payload without endpoint confidence`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown fetch error";
        errors.push(`${candidate.id}: ${message}`);
      }
    }

    optionPositionsEndpointConfig = null;
    throw new Error(errors.join(" | ") || "Unable to resolve an open options endpoint.");
  }

  async function loadOptionsData() {
    if (isFetchingOptions) {
      return;
    }

    const previousOptionsDataState = optionsDataState;
    const hadPreviousOrdersSnapshot = previousOptionsDataState.ordersStatus === "success" || previousOptionsDataState.ordersStatus === "empty";
    const hadPreviousPositionsSnapshot = previousOptionsDataState.positionsStatus === "success" || previousOptionsDataState.positionsStatus === "empty";

    isFetchingOptions = true;
    latestOptionsFetchId += 1;
    const fetchId = latestOptionsFetchId;
    setRefreshButtonLoading();

    optionsDataState = {
      ...optionsDataState,
      status: hadPreviousOrdersSnapshot || hadPreviousPositionsSnapshot ? "success" : "loading",
      error: null,
      isRefreshing: true,
      ordersError: null,
      positionsError: null,
      ordersStale: false,
      positionsStale: false,
    };
    renderDataState();

    try {
      console.log("Bybit overlay: loadOptionsData() started");
      const [historyResult, positionsResult] = await Promise.allSettled([
        fetchClosedOptionsOrders(),
        fetchOpenOptionsPositions(),
      ]);

      if (fetchId !== latestOptionsFetchId) {
        return;
      }

      const nextState = {
        status: "success",
        error: null,
        isRefreshing: false,
        lastUpdatedAt: previousOptionsDataState.lastUpdatedAt,
        orders: hadPreviousOrdersSnapshot ? previousOptionsDataState.orders : [],
        positions: hadPreviousPositionsSnapshot ? previousOptionsDataState.positions : [],
        openSummary: hadPreviousPositionsSnapshot
          ? previousOptionsDataState.openSummary
          : createEmptyOptionsOpenSummary(),
        ordersStatus: hadPreviousOrdersSnapshot ? previousOptionsDataState.ordersStatus : "error",
        positionsStatus: hadPreviousPositionsSnapshot ? previousOptionsDataState.positionsStatus : "error",
        ordersStale: false,
        positionsStale: false,
        ordersError: null,
        positionsError: null,
        historyDebugMsg: previousOptionsDataState.historyDebugMsg || "",
        positionsDebugMsg: previousOptionsDataState.positionsDebugMsg || "",
      };

      if (historyResult.status === "fulfilled") {
        nextState.orders = historyResult.value.orders;
        nextState.ordersStatus = historyResult.value.orders.length > 0 ? "success" : "empty";
        nextState.historyDebugMsg = historyResult.value.debugMsg || "";
      } else {
        nextState.ordersError = historyResult.reason instanceof Error
          ? historyResult.reason.message
          : "Unknown options history error";

        if (!hadPreviousOrdersSnapshot) {
          nextState.orders = [];
          nextState.ordersStatus = "error";
          nextState.historyDebugMsg = "";
        } else {
          nextState.ordersStale = true;
        }
      }

      if (positionsResult.status === "fulfilled") {
        nextState.positions = positionsResult.value.positions;
        nextState.openSummary = buildOpenOptionsSummary(nextState.positions);
        nextState.positionsStatus = positionsResult.value.positions.length > 0 ? "success" : "empty";
        nextState.positionsDebugMsg = positionsResult.value.debugMsg || "";
      } else {
        nextState.positionsError = positionsResult.reason instanceof Error
          ? positionsResult.reason.message
          : "Unknown options positions error";

        if (!hadPreviousPositionsSnapshot) {
          nextState.positions = [];
          nextState.openSummary = createEmptyOptionsOpenSummary();
          nextState.positionsStatus = "error";
          nextState.positionsDebugMsg = "";
        } else {
          nextState.positionsStale = true;
        }
      }

      const hasRenderableData = nextState.ordersStatus !== "error" || nextState.positionsStatus !== "error";
      if (!hasRenderableData) {
        nextState.status = "error";
        nextState.error = [nextState.positionsError, nextState.ordersError]
          .filter(Boolean)
          .join(" | ");
        nextState.lastUpdatedAt = null;
      } else if (historyResult.status === "fulfilled" || positionsResult.status === "fulfilled") {
        nextState.lastUpdatedAt = new Date();
      }

      optionsDataState = nextState;
      console.log(
        "Bybit overlay: optionsDataState resolved to",
        optionsDataState.status,
        optionsDataState.positions.length,
        "open positions and",
        optionsDataState.orders.length,
        "closed orders"
      );
    } catch (error) {
      console.error("Bybit overlay: loadOptionsData error:", error);
      if (fetchId !== latestOptionsFetchId) {
        return;
      }

      optionsDataState = {
        ...optionsDataState,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown fetch error",
        isRefreshing: false,
      };
    } finally {
      if (fetchId === latestOptionsFetchId) {
        isFetchingOptions = false;
        setRefreshButtonLoading();
        renderDataState();
      }
    }
  }

  function updateTabUI() {
    if (!tabBarEl) return;
    const btns = tabBarEl.querySelectorAll(".bybit-da-tab-btn");
    for (let i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("data-tab") === state.activeTab) {
        btns[i].classList.add("is-active");
      } else {
        btns[i].classList.remove("is-active");
      }
    }
  }

  minimizeButton.addEventListener("click", function toggleMinimize() {
    persistAndRender({ minimized: !state.minimized });
  });
  
  refreshButton.addEventListener("click", function handleRefresh() {
    if (state.activeTab === "options") {
      loadOptionsData();
    } else {
      loadOrders();
    }
  });

  if (tabBarEl) {
    tabBarEl.addEventListener("click", function onTabClick(e) {
      if (e.target.matches(".bybit-da-tab-btn")) {
        const newTab = e.target.getAttribute("data-tab");
        if (state.activeTab !== newTab) {
          persistAndRender({ activeTab: newTab });
          updateTabUI();
          renderDataState();
          if (newTab === "options" && optionsDataState.status === "loading") {
            loadOptionsData();
          } else if (newTab === "dual-asset" && dataState.status === "loading") {
            loadOrders();
          }
        }
      }
    });
  }

  headerEl.addEventListener("pointerdown", startDrag);
  resizeHandleEl.addEventListener("pointerdown", startResize);
  window.addEventListener("resize", function handleResize() {
    applyState(state);
  });
  
  bodyEl.addEventListener("click", function handleBodyClick(e) {
    var tab = e.target && e.target.closest("[data-vwap-product]");
    if (tab) {
      selectedVwapProduct = tab.getAttribute("data-vwap-product");
      renderDataState();
      return;
    }

    var imbalanceTab = e.target && e.target.closest("[data-imbalance-product]");
    if (imbalanceTab) {
      selectedImbalanceProduct = imbalanceTab.getAttribute("data-imbalance-product");
      renderDataState();
      return;
    }

    var sectionToggle = e.target && e.target.closest("[data-toggle-section]");
    if (sectionToggle) {
      var key = sectionToggle.getAttribute("data-toggle-section");
      var update = {};
      update[key] = state[key] === false ? true : false;
      persistAndRender(update);
      renderDataState();
      return;
    }
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
    updateTabUI();
    renderDataState();
    loadOrders();
    loadOptionsData();
  });
})();
