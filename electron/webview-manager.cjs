/**
 * WebViewManager — manages a pool of WebContentsView instances for browser automation.
 * Each view shares the 'persist:user_login' partition for cookie sharing.
 * Playwright connects via CDP and claims pool pages by their marker URL.
 *
 * Lazy-loading strategy (inspired by Eigent):
 * - No views created at startup — zero memory overhead on launch
 * - Views created on-demand when daemon claims pool pages
 * - Auto-expands: when free views ≤ 2, creates 2 more (up to MAX_POOL_SIZE)
 * - Auto-shrinks: when inactive views > MAX_INACTIVE, cleans up oldest
 */

const { WebContentsView, session } = require('electron');
const { STEALTH_SCRIPT } = require('./stealth.cjs');

const MAX_POOL_SIZE = 8;
const INITIAL_POOL_SIZE = 2; // Create a small seed pool so CDP has pages to discover
const MAX_INACTIVE = 5;
const POOL_MARKER = 'about:blank?ami=pool'; // Base marker; actual URLs include &viewId=N

// Off-screen dimensions for agent browsing.
const OFFSCREEN_WIDTH = 1920;
const OFFSCREEN_HEIGHT = 1080;

class WebViewManager {
  constructor(win) {
    this.win = win;
    this.views = new Map(); // id → { view, isShow, isActive }
    this.nextId = 0;
    this.lastCleanupTime = Date.now();
  }

  /**
   * Create a small seed pool so the daemon's CDP connection can discover pages.
   * Unlike the old approach of creating 16 views upfront, this only creates 2.
   */
  initPool() {
    for (let i = 0; i < INITIAL_POOL_SIZE; i++) {
      this._createView(String(this.nextId++));
    }
    console.log(`[WebViewManager] Pool initialized with ${INITIAL_POOL_SIZE} seed views (max ${MAX_POOL_SIZE})`);
  }

  _createView(id) {
    if (this.views.size >= MAX_POOL_SIZE) {
      console.warn(`[WebViewManager] Pool at max capacity (${MAX_POOL_SIZE}), skipping creation`);
      return null;
    }

    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:user_login',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: true,
        disableBlinkFeatures: 'AutomationControlled,Accelerated2dCanvas',
      },
    });

    // Mute audio
    view.webContents.audioMuted = true;

    // Position off-screen at full viewport dimensions so that Chromium's
    // CSS layout viewport is 1920×1080 — matching what the agent expects.
    view.setBounds({
      x: -(OFFSCREEN_WIDTH - 1),
      y: -(OFFSCREEN_HEIGHT - 1),
      width: OFFSCREEN_WIDTH,
      height: OFFSCREEN_HEIGHT,
    });

    // Inject stealth on every page load.
    view.webContents.on('did-finish-load', () => {
      view.webContents.executeJavaScript(STEALTH_SCRIPT).catch(() => {});
    });

    // Track URL changes and notify renderer
    view.webContents.on('did-navigate', (_event, url) => {
      const info = this.views.get(id);
      if (info) {
        // Mark as active once it navigates away from the pool marker
        if (!url.startsWith(POOL_MARKER)) {
          info.isActive = true;
        }
      }

      if (this.win && !this.win.isDestroyed()) {
        if (info && info.isShow) {
          this.win.webContents.send('url-updated', id, url);
        }
        const title = view.webContents.isDestroyed() ? '' : view.webContents.getTitle();
        this.win.webContents.send('view-state-changed', id, { url, title });
      }

      // Auto-expand pool when free views are running low
      this._maybeExpandPool();
    });

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      if (this.win && !this.win.isDestroyed()) {
        const info = this.views.get(id);
        if (info && info.isShow) {
          this.win.webContents.send('url-updated', id, url);
        }
        const title = view.webContents.isDestroyed() ? '' : view.webContents.getTitle();
        this.win.webContents.send('view-state-changed', id, { url, title });
      }
    });

    view.webContents.on('page-title-updated', (_event, title) => {
      if (this.win && !this.win.isDestroyed()) {
        const url = view.webContents.isDestroyed() ? '' : view.webContents.getURL();
        this.win.webContents.send('view-state-changed', id, { url, title });
      }
    });

    // Crash recovery: reload pool marker if renderer crashes
    view.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[WebViewManager] View ${id} renderer crashed: ${details.reason}`);
      setTimeout(() => {
        if (!view.webContents.isDestroyed()) {
          console.log(`[WebViewManager] Reloading view ${id} after crash`);
          view.webContents.loadURL(`${POOL_MARKER}&viewId=${id}`);
        }
      }, 1000);
    });

    // Log load failures for diagnostics (skip aborted loads, errorCode -3)
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return;
      console.warn(`[WebViewManager] View ${id} load failed: ${errorDescription} (${errorCode}) for ${validatedURL}`);
    });

    // Prevent popups — navigate in same view (only safe URL schemes)
    view.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (['http:', 'https:', 'about:'].includes(parsed.protocol)) {
          view.webContents.loadURL(url);
        }
      } catch {
        // Invalid URL — ignore
      }
      return { action: 'deny' };
    });

    // Load pool marker URL with viewId for daemon to extract
    view.webContents.loadURL(`${POOL_MARKER}&viewId=${id}`);

    // Add as child of the main window
    this.win.contentView.addChildView(view);

    this.views.set(id, { view, isShow: false, isActive: false });
    return id;
  }

  /**
   * Auto-expand: if free (inactive) views ≤ 2, create 2 more up to MAX_POOL_SIZE.
   * Also auto-shrink if inactive views exceed MAX_INACTIVE.
   */
  _maybeExpandPool() {
    const inactive = this._countInactive();
    const total = this.views.size;

    // Auto-shrink: clean up excess inactive views (throttled to once per 30s)
    if (inactive > MAX_INACTIVE && Date.now() - this.lastCleanupTime > 30000) {
      this._cleanupInactiveViews();
      this.lastCleanupTime = Date.now();
    }

    // Auto-expand: ensure at least 2 free views available
    if (inactive <= 2 && total < MAX_POOL_SIZE) {
      const toCreate = Math.min(2, MAX_POOL_SIZE - total);
      console.log(`[WebViewManager] Auto-expanding pool: ${toCreate} new views (inactive=${inactive}, total=${total})`);
      for (let i = 0; i < toCreate; i++) {
        this._createView(String(this.nextId++));
      }
    }
  }

  _countInactive() {
    let count = 0;
    for (const [, info] of this.views) {
      if (!info.isActive) count++;
    }
    return count;
  }

  _cleanupInactiveViews() {
    const inactiveEntries = [];
    for (const [id, info] of this.views) {
      if (!info.isActive && !info.isShow) {
        const url = info.view.webContents.isDestroyed() ? '' : info.view.webContents.getURL();
        if (url.startsWith(POOL_MARKER) || url === '' || url === 'about:blank') {
          inactiveEntries.push(id);
        }
      }
    }

    // Keep MAX_INACTIVE, remove the rest (oldest first by id)
    const toRemove = inactiveEntries.slice(MAX_INACTIVE);
    for (const id of toRemove) {
      console.log(`[WebViewManager] Cleaning up inactive view: ${id}`);
      this._destroyView(id);
    }
  }

  _destroyView(id) {
    const info = this.views.get(id);
    if (!info) return;

    try {
      if (!info.view.webContents.isDestroyed()) {
        info.view.webContents.removeAllListeners();
        info.view.webContents.close();
      }
      if (this.win && this.win.contentView) {
        this.win.contentView.removeChildView(info.view);
      }
    } catch (e) {
      console.error(`[WebViewManager] Error destroying view ${id}:`, e.message);
    }

    this.views.delete(id);
  }

  /**
   * Move a view on-screen at the given bounds.
   */
  showView(id, bounds) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };

    if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number'
        || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
      return { success: false, error: 'Invalid bounds: must have numeric x, y, width, height' };
    }

    // Reject degenerate bounds (element not laid out or invalid)
    if (bounds.width < 10 || bounds.height < 10) {
      return { success: false, error: `Bounds too small: ${bounds.width}x${bounds.height}` };
    }

    info.isShow = true;

    if (!info.view.webContents.isDestroyed()) {
      info.view.webContents.setBackgroundThrottling(false);
    }

    info.view.setBounds(bounds);

    if (!info.view.webContents.isDestroyed()) {
      // Force repaint for views that were off-screen with backgroundThrottling
      info.view.webContents.invalidate();
    }

    // Send current URL to renderer
    if (this.win && !this.win.isDestroyed()) {
      const currentUrl = info.view.webContents.isDestroyed() ? '' : info.view.webContents.getURL();
      this.win.webContents.send('url-updated', id, currentUrl);
    }

    return { success: true };
  }

  /**
   * Move a view off-screen.
   */
  hideView(id) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };

    const url = info.view.webContents.isDestroyed() ? '(destroyed)' : info.view.webContents.getURL();
    console.log(`[WebViewManager] hideView(${id}) url=${url}`);

    // Restore full viewport dimensions off-screen so the agent's CSS
    // layout viewport stays at 1920×1080 while browsing in the background.
    info.view.setBounds({
      x: -(OFFSCREEN_WIDTH - 1),
      y: -(OFFSCREEN_HEIGHT - 1),
      width: OFFSCREEN_WIDTH,
      height: OFFSCREEN_HEIGHT,
    });
    info.isShow = false;

    if (!info.view.webContents.isDestroyed()) {
      info.view.webContents.setBackgroundThrottling(true);
    }

    return { success: true };
  }

  /**
   * Hide all views.
   */
  hideAll() {
    for (const [id] of this.views) {
      this.hideView(id);
    }
  }

  /**
   * Get info for all views: { "0": { url, title, isShow }, ... }
   */
  getAllViewsInfo() {
    const result = {};
    for (const [id, info] of this.views) {
      const wc = info.view.webContents;
      result[id] = {
        url: wc.isDestroyed() ? '' : wc.getURL(),
        title: wc.isDestroyed() ? '' : wc.getTitle(),
        isShow: info.isShow,
      };
    }
    return result;
  }

  /**
   * Get current URL of a view.
   */
  getUrl(id) {
    const info = this.views.get(id);
    if (!info) return null;
    return info.view.webContents.getURL();
  }

  /**
   * Navigate a view to a URL.
   */
  async navigate(id, url) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };

    // Validate URL scheme to prevent file://, javascript:, data: attacks
    try {
      const parsed = new URL(url);
      const allowed = ['http:', 'https:', 'about:'];
      if (!allowed.includes(parsed.protocol)) {
        return { success: false, error: `URL scheme '${parsed.protocol}' is not allowed` };
      }
    } catch {
      return { success: false, error: `Invalid URL: ${url}` };
    }

    try {
      await info.view.webContents.loadURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  goBack(id) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };
    if (info.view.webContents.canGoBack()) {
      info.view.webContents.goBack();
    }
    return { success: true };
  }

  goForward(id) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };
    if (info.view.webContents.canGoForward()) {
      info.view.webContents.goForward();
    }
    return { success: true };
  }

  reload(id) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };
    info.view.webContents.reload();
    return { success: true };
  }

  /**
   * Navigate a view to a local file:// URL for preview.
   * Only allows whitelisted extensions (PDF, HTML, images).
   */
  async navigatePreview(id, fileUrl) {
    const info = this.views.get(id);
    if (!info) return { success: false, error: `View ${id} not found` };

    try {
      const parsed = new URL(fileUrl);
      if (parsed.protocol !== 'file:') {
        return { success: false, error: 'Preview only supports file:// URLs' };
      }
      const filePath = decodeURIComponent(parsed.pathname);
      const ext = filePath.split('.').pop()?.toLowerCase();
      const ALLOWED = ['pdf', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
      if (!ALLOWED.includes(ext)) {
        return { success: false, error: `Extension '${ext}' not allowed for preview` };
      }
    } catch {
      return { success: false, error: `Invalid URL: ${fileUrl}` };
    }

    try {
      await info.view.webContents.loadURL(fileUrl);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Destroy all views and clean up.
   */
  destroy() {
    for (const [id] of this.views) {
      this._destroyView(id);
    }
    this.views.clear();
  }
}

module.exports = { WebViewManager };
