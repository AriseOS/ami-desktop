/**
 * Authentication and Session Management
 *
 * Daemon is the single source of truth for JWT tokens.
 * Frontend only caches UI metadata (username, email) in Electron Store.
 * Tokens are fetched from daemon on demand.
 */

import { BACKEND_CONFIG } from '../config/backend';

/**
 * Authentication utility
 */
export const auth = {
  /**
   * Save UI metadata after successful login/registration.
   * Tokens are already stored by the daemon (intercepted during login/register proxy).
   *
   * @param {string} username - Username
   * @param {string} email - User email
   * @param {object} userData - Additional user data
   */
  async saveSession(username, email, userData = {}) {
    try {
      await window.electronAPI.storeSet('username', username);
      await window.electronAPI.storeSet('email', email);
      await window.electronAPI.storeSet('user_data', userData);
      await window.electronAPI.storeSet('login_timestamp', new Date().toISOString());

      console.log('[Auth] UI session metadata saved');
    } catch (error) {
      console.error('[Auth] Failed to save session metadata:', error);
      throw new Error('Failed to save session metadata');
    }
  },

  /**
   * Get current user session.
   * Checks daemon first for authoritative session state, falls back to local cache.
   *
   * @returns {Promise<object>} Session data or null if not logged in
   */
  async getSession() {
    try {
      // Ask daemon for session state (it owns the tokens)
      const resp = await fetch(`${BACKEND_CONFIG.httpBase}/api/v1/auth/session`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const session = await resp.json();
        if (session.logged_in) {
          return {
            username: session.username,
            email: session.email,
            userData: { user_id: session.user_id },
            loginTimestamp: await window.electronAPI.storeGet('login_timestamp'),
          };
        }
        return null;
      }
    } catch {
      // Daemon unreachable — fall back to local cache
    }

    // Fallback: local Electron Store cache
    try {
      const username = await window.electronAPI.storeGet('username');
      if (!username) return null;

      const email = await window.electronAPI.storeGet('email');
      const userData = await window.electronAPI.storeGet('user_data');
      const loginTimestamp = await window.electronAPI.storeGet('login_timestamp');

      return {
        username,
        email,
        userData: userData || {},
        loginTimestamp,
      };
    } catch (error) {
      console.error('[Auth] Failed to get session:', error);
      return null;
    }
  },

  /**
   * Get JWT access token from daemon.
   * Daemon handles refresh automatically.
   *
   * @returns {Promise<string|null>} JWT token or null if not logged in
   */
  async getToken() {
    try {
      const resp = await fetch(`${BACKEND_CONFIG.httpBase}/api/v1/auth/token`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const { access_token } = await resp.json();
        return access_token || null;
      }
      return null;
    } catch (error) {
      console.error('[Auth] Failed to get token from daemon:', error);
      return null;
    }
  },

  /**
   * Clear user session (logout).
   * Tells daemon to clear its session, then clears local UI cache.
   */
  async clearSession() {
    try {
      // Tell daemon to clear session + LLM credentials
      await fetch(`${BACKEND_CONFIG.httpBase}/api/v1/auth/logout`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Daemon unreachable — clear local state anyway
      console.warn('[Auth] Could not reach daemon for logout, clearing local state');
    }

    try {
      await window.electronAPI.storeDelete('username');
      await window.electronAPI.storeDelete('email');
      await window.electronAPI.storeDelete('user_data');
      await window.electronAPI.storeDelete('login_timestamp');
      // Clean up legacy keys
      await window.electronAPI.storeDelete('jwt_token');
      await window.electronAPI.storeDelete('refresh_token');
      await window.electronAPI.storeDelete('user_api_key');

      console.log('[Auth] Session cleared');
    } catch (error) {
      console.error('[Auth] Failed to clear local session:', error);
      throw new Error('Failed to clear session');
    }
  },

  /**
   * Check if user is logged in.
   * Checks daemon first, falls back to local cache.
   *
   * @returns {Promise<boolean>} True if logged in, false otherwise
   */
  async isLoggedIn() {
    try {
      const resp = await fetch(`${BACKEND_CONFIG.httpBase}/api/v1/auth/session`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const session = await resp.json();
        return !!session.logged_in;
      }
    } catch {
      // Daemon unreachable — fall back to local check
    }

    try {
      const username = await window.electronAPI.storeGet('username');
      return !!username;
    } catch {
      return false;
    }
  },

  /**
   * Update user data in local session cache.
   *
   * @param {object} updates - Fields to update
   */
  async updateSession(updates) {
    try {
      if (updates.username) {
        await window.electronAPI.storeSet('username', updates.username);
      }
      if (updates.email) {
        await window.electronAPI.storeSet('email', updates.email);
      }
      if (updates.userData) {
        await window.electronAPI.storeSet('user_data', updates.userData);
      }

      console.log('[Auth] Session updated');
    } catch (error) {
      console.error('[Auth] Failed to update session:', error);
      throw new Error('Failed to update session');
    }
  }
};
