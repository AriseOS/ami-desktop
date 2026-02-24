/**
 * Authentication and Session Management
 * Uses Electron Store via IPC for secure local storage
 *
 * JWT-based auth: access_token (60min) + refresh_token (30d)
 */

/**
 * Authentication utility
 */
export const auth = {
  /**
   * Save user session after successful login/registration
   *
   * @param {string} token - JWT access token
   * @param {string} refreshToken - JWT refresh token
   * @param {string} username - Username
   * @param {string} email - User email
   * @param {object} userData - Additional user data
   */
  async saveSession(token, refreshToken, username, email, userData = {}) {
    try {
      await window.electronAPI.storeSet('jwt_token', token);
      await window.electronAPI.storeSet('refresh_token', refreshToken);
      await window.electronAPI.storeSet('username', username);
      await window.electronAPI.storeSet('email', email);
      await window.electronAPI.storeSet('user_data', userData);
      await window.electronAPI.storeSet('login_timestamp', new Date().toISOString());

      console.log('[Auth] Session saved successfully');
    } catch (error) {
      console.error('[Auth] Failed to save session:', error);
      throw new Error('Failed to save session');
    }
  },

  /**
   * Get current user session
   *
   * @returns {Promise<object>} Session data or null if not logged in
   */
  async getSession() {
    try {
      const token = await window.electronAPI.storeGet('jwt_token');
      const refreshToken = await window.electronAPI.storeGet('refresh_token');
      const username = await window.electronAPI.storeGet('username');
      const email = await window.electronAPI.storeGet('email');
      const userData = await window.electronAPI.storeGet('user_data');
      const loginTimestamp = await window.electronAPI.storeGet('login_timestamp');

      if (!token) {
        return null;
      }

      return {
        token,
        refreshToken,
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
   * Get JWT access token
   *
   * @returns {Promise<string|null>} JWT token or null if not logged in
   */
  async getToken() {
    try {
      const token = await window.electronAPI.storeGet('jwt_token');
      return token || null;
    } catch (error) {
      console.error('[Auth] Failed to get token:', error);
      return null;
    }
  },

  /**
   * Get JWT refresh token
   *
   * @returns {Promise<string|null>} Refresh token or null
   */
  async getRefreshToken() {
    try {
      const refreshToken = await window.electronAPI.storeGet('refresh_token');
      return refreshToken || null;
    } catch (error) {
      console.error('[Auth] Failed to get refresh token:', error);
      return null;
    }
  },

  /**
   * Update stored JWT tokens (after refresh)
   *
   * @param {string} token - New JWT access token
   * @param {string} refreshToken - New refresh token (optional, may not change)
   */
  async updateTokens(token, refreshToken) {
    try {
      await window.electronAPI.storeSet('jwt_token', token);
      if (refreshToken) {
        await window.electronAPI.storeSet('refresh_token', refreshToken);
      }
      console.log('[Auth] Tokens updated');
    } catch (error) {
      console.error('[Auth] Failed to update tokens:', error);
      throw new Error('Failed to update tokens');
    }
  },

  /**
   * Clear user session (logout)
   */
  async clearSession() {
    try {
      await window.electronAPI.storeDelete('jwt_token');
      await window.electronAPI.storeDelete('refresh_token');
      await window.electronAPI.storeDelete('username');
      await window.electronAPI.storeDelete('email');
      await window.electronAPI.storeDelete('user_data');
      await window.electronAPI.storeDelete('login_timestamp');
      // Clean up legacy key from pre-JWT auth
      await window.electronAPI.storeDelete('user_api_key');

      console.log('[Auth] Session cleared');
    } catch (error) {
      console.error('[Auth] Failed to clear session:', error);
      throw new Error('Failed to clear session');
    }
  },

  /**
   * Check if user is logged in
   *
   * @returns {Promise<boolean>} True if logged in, false otherwise
   */
  async isLoggedIn() {
    try {
      const token = await window.electronAPI.storeGet('jwt_token');
      return !!token;
    } catch (error) {
      console.error('[Auth] Failed to check login status:', error);
      return false;
    }
  },

  /**
   * Update user data in session
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
