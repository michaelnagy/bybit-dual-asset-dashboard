(function initBybitDualAssetOverlay() {
  const OVERLAY_ID = "bybit-dual-asset-overlay-root";
  const STORAGE_KEY = "bybitDualAssetOverlayState";
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
        <div class="bybit-da-overlay-subtitle">Part 2 skeleton running on the Bybit page</div>
      </div>
      <div class="bybit-da-overlay-actions">
        <button type="button" class="bybit-da-overlay-button" data-action="minimize" aria-label="Minimize overlay">_</button>
      </div>
    </div>
    <div class="bybit-da-overlay-body">
      <div class="bybit-da-overlay-badge">Overlay mounted on Dual Asset orders page</div>
      <div class="bybit-da-overlay-grid">
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Runtime</div>
          <div class="bybit-da-overlay-value">MV3</div>
        </div>
        <div class="bybit-da-overlay-card">
          <div class="bybit-da-overlay-label">Data wiring</div>
          <div class="bybit-da-overlay-value">Next Part</div>
        </div>
      </div>
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">What this part proves</div>
        <ul class="bybit-da-overlay-list">
          <li>The extension can mount an overlay directly on the Bybit Dual Asset orders page.</li>
          <li>The window can be dragged, resized, and minimized.</li>
          <li>The overlay state can persist between reloads.</li>
        </ul>
      </div>
      <div class="bybit-da-overlay-card">
        <div class="bybit-da-overlay-label">Next implementation part</div>
        <div class="bybit-da-overlay-copy">
          Wire this shell to Bybit's <code>/x-api/s1/byfi/dual-assets/orders</code> endpoint and normalize the response into dashboard-ready records.
        </div>
      </div>
    </div>
    <div class="bybit-da-overlay-resize-handle" aria-hidden="true"></div>
  `;

  root.appendChild(windowEl);
  document.documentElement.appendChild(root);

  const headerEl = windowEl.querySelector(".bybit-da-overlay-header");
  const minimizeButton = windowEl.querySelector('[data-action="minimize"]');
  const resizeHandleEl = windowEl.querySelector(".bybit-da-overlay-resize-handle");

  let state = { ...DEFAULT_STATE };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

  minimizeButton.addEventListener("click", function toggleMinimize() {
    persistAndRender({ minimized: !state.minimized });
  });

  headerEl.addEventListener("pointerdown", startDrag);
  resizeHandleEl.addEventListener("pointerdown", startResize);
  window.addEventListener("resize", function handleResize() {
    applyState(state);
  });

  readState().then(function mountOverlay(savedState) {
    state = { ...DEFAULT_STATE, ...(savedState || {}) };
    applyState(state);
  });
})();
