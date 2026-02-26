import { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useStore } from 'zustand';
import { auth } from '../utils/auth';
import { api } from '../utils/api';
import Icon from '../components/Icons';
import IntegrationList from '../components/IntegrationList';
import settingsStore from '../store/settingsStore';
import '../styles/SettingsPage.css';

/**
 * Settings Page Component
 * Displays user account info, quota status, language selector, and logout option
 * In local mode, shows API configuration instead of account/quota sections
 */
function SettingsPage({ navigate, showStatus, onLogout, language, onLanguageChange, isLocalMode, onExitLocalMode }) {
  const { t } = useTranslation();
  const [session, setSession] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Local mode API config state
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [savingApiConfig, setSavingApiConfig] = useState(false);

  const autoConfirmDelay = useStore(settingsStore, (state) => state.autoConfirmDelay);
  const setAutoConfirmDelay = useStore(settingsStore, (state) => state.setAutoConfirmDelay);
  const showTokenUsage = useStore(settingsStore, (state) => state.showTokenUsage);
  const setShowTokenUsage = useStore(settingsStore, (state) => state.setShowTokenUsage);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (isLocalMode) {
        // Load current credentials for editing
        try {
          const creds = await api.getCredentials();
          if (creds?.anthropic) {
            setLocalApiKey(creds.anthropic.api_key || '');
            setLocalBaseUrl(creds.anthropic.base_url || '');
          }
          // Load model from settings
          const settings = await api.get('/api/v1/settings');
          if (settings?.llm?.model) {
            setLocalModel(settings.llm.model);
          }
        } catch (e) {
          console.error('[SettingsPage] Failed to load local mode config:', e);
        }
      } else {
        // Load session data
        const sessionData = await auth.getSession();
        setSession(sessionData);

        // Load quota status
        try {
          const quotaData = await api.getQuotaStatus();
          setQuota(quotaData);
        } catch (quotaError) {
          console.error('[SettingsPage] Failed to load quota:', quotaError);
        }
      }
    } catch (error) {
      console.error('[SettingsPage] Failed to load data:', error);
      showStatus(`${t('settings.loadFailed')}: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiConfig = async () => {
    if (!localApiKey.trim()) {
      showStatus(t('auth.apiKeyRequired'), 'error');
      return;
    }

    setSavingApiConfig(true);
    try {
      const credConfig = { api_key: localApiKey.trim() };
      if (localBaseUrl.trim()) {
        credConfig.base_url = localBaseUrl.trim();
      }
      await api.setCredentials('anthropic', credConfig);

      if (localModel.trim()) {
        await api.post('/api/v1/settings', { llm_model: localModel.trim() });
      }

      showStatus(t('settings.apiKeySaved'), 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to save API config:', error);
      showStatus(`${t('settings.apiKeySaveFailed')}: ${error.message}`, 'error');
    } finally {
      setSavingApiConfig(false);
    }
  };

  const handleRefreshQuota = async () => {
    setRefreshing(true);
    try {
      const quotaData = await api.getQuotaStatus();
      setQuota(quotaData);
      showStatus(t('settings.quotaRefreshed'), 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to refresh quota:', error);
      showStatus(`${t('settings.refreshFailed')}: ${error.message}`, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirm(false);

    try {
      await auth.clearSession();
      showStatus(t('settings.logoutSuccess'), 'success');

      // Call parent logout handler to clear App state
      if (onLogout) {
        await onLogout();
      } else {
        // Fallback if onLogout not provided
        navigate('login');
      }
    } catch (error) {
      console.error('[SettingsPage] Logout error:', error);
      showStatus(`${t('settings.logoutFailed')}: ${error.message}`, 'error');
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const handleLanguageChange = (lang) => {
    if (onLanguageChange) {
      onLanguageChange(lang);
    }
  };

  if (loading) {
    return (
      <div className="page settings-page">
        <div className="loading-container">
          <div className="btn-spinner"></div>
          <p>{t('settings.loading')}</p>
        </div>
      </div>
    );
  }

  const quotaInfo = quota?.quota;
  const workflowQuota = quotaInfo?.workflow_executions;
  const trialInfo = quotaInfo?.trial_info;
  const tokenUsage = quota?.token_usage?.current_month;

  // Calculate quota percentage and status
  const quotaPercentage = workflowQuota?.percentage || 0;
  const quotaStatus = quotaPercentage >= 100 ? 'danger' : quotaPercentage >= 80 ? 'warning' : 'success';

  return (
    <div className="page settings-page">
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <button className="back-button" onClick={() => navigate('main')}>
            <Icon name="arrowLeft" size={16} /> {t('settings.back')}
          </button>
          <h1 className="settings-title">{t('settings.title')}</h1>
        </div>

        {/* Local Mode: API Configuration */}
        {isLocalMode && (
          <section className="settings-section">
            <h2 className="section-title">{t('settings.apiConfig')}</h2>
            <div className="info-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--status-success-bg)',
                  color: 'var(--status-success-text)',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  {t('auth.localModeActive')}
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  {t('auth.apiKeyLabel')}
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder={t('auth.apiKeyPlaceholder')}
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  {t('auth.baseUrlLabel')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('auth.baseUrlPlaceholder')}
                  value={localBaseUrl}
                  onChange={(e) => setLocalBaseUrl(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  {t('auth.modelLabel')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('auth.modelPlaceholder')}
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSaveApiConfig}
                disabled={savingApiConfig || !localApiKey.trim()}
                style={{ marginTop: '4px' }}
              >
                {savingApiConfig ? (
                  <>
                    <div className="btn-spinner"></div>
                    <span>{t('common.save')}</span>
                  </>
                ) : (
                  <span>{t('common.save')}</span>
                )}
              </button>
            </div>

            <div style={{ marginTop: '12px' }}>
              <a
                className="auth-link"
                onClick={onExitLocalMode}
                style={{ cursor: 'pointer', fontSize: '14px', color: 'var(--primary-color)' }}
              >
                {t('settings.switchToCloud')}
              </a>
            </div>
          </section>
        )}

        {/* Account Section (hidden in local mode) */}
        {!isLocalMode && (
          <section className="settings-section">
            <h2 className="section-title">{t('settings.account')}</h2>
            <div className="info-card">
              <div className="info-row">
                <span className="info-label">{t('settings.username')}:</span>
                <span className="info-value">{session?.username || 'N/A'}</span>
              </div>
              {session?.email && (
                <div className="info-row">
                  <span className="info-label">{t('settings.email')}:</span>
                  <span className="info-value">{session.email}</span>
                </div>
              )}
              {session?.loginTimestamp && (
                <div className="info-row">
                  <span className="info-label">{t('settings.lastLogin')}:</span>
                  <span className="info-value">
                    {new Date(session.loginTimestamp).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-danger" onClick={handleLogoutClick}>
                <Icon name="logOut" size={16} /> {t('settings.logout')}
              </button>
            </div>
          </section>
        )}

        {/* Language Section */}
        <section className="settings-section">
          <h2 className="section-title">{t('settings.language')}</h2>
          <div className="info-card">
            <p style={{ marginBottom: '12px' }}>{t('settings.languageDesc')}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleLanguageChange('en')}
              >
                English
              </button>
              <button
                type="button"
                className={`btn ${language === 'zh' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleLanguageChange('zh')}
              >
                简体中文
              </button>
            </div>
          </div>
        </section>

        {/* Agent Settings Section */}
        <section className="settings-section">
          <h2 className="section-title">{t('settings.agentSettings')}</h2>
          <div className="info-card">
            {/* Auto-confirm delay */}
            <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <span className="info-label">{t('settings.autoConfirmDelay')}</span>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-tertiary)' }}>
                {t('settings.autoConfirmDelayDesc')}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={autoConfirmDelay}
                  onChange={(e) => setAutoConfirmDelay(Math.max(0, Math.min(300, parseInt(e.target.value) || 0)))}
                  style={{
                    width: '80px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                  }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {t('settings.seconds')}
                </span>
              </div>
            </div>

            {/* Show token usage toggle */}
            <div className="info-row" style={{ alignItems: 'center' }}>
              <div>
                <span className="info-label">{t('settings.showTokenUsage')}</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  {t('settings.showTokenUsageDesc')}
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showTokenUsage}
                  onChange={(e) => setShowTokenUsage(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="settings-section">
          <h2 className="section-title">{t('settings.integrations')}</h2>
          <div className="info-card integrations-card">
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              {t('settings.integrationsDesc')}
            </p>
            <IntegrationList showTitle={false} />
          </div>
        </section>

        {/* Quota Section (hidden in local mode) */}
        {!isLocalMode && (
        <section className="settings-section">
          <div className="section-header">
            <h2 className="section-title">{t('settings.quotaStatus')}</h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefreshQuota}
              disabled={refreshing}
            >
              <Icon name="refreshCw" size={14} className={refreshing ? 'spinning' : ''} />
              {refreshing ? t('settings.refreshing') : t('settings.refresh')}
            </button>
          </div>

          {quota && workflowQuota ? (
            <div className="info-card">
              {/* Workflow Executions */}
              <div className="quota-section">
                <h3 className="quota-title">{t('settings.workflowExecutions')}</h3>
                <div className="quota-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.used')}:</span>
                    <span className="stat-value">{workflowQuota.used}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.limit')}:</span>
                    <span className="stat-value">{workflowQuota.limit}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.remaining')}:</span>
                    <span className="stat-value">{workflowQuota.remaining}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="progress-container">
                  <div
                    className={`progress-bar progress-${quotaStatus}`}
                    style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
                  ></div>
                </div>
                <div className="progress-text">
                  {t('settings.usedPercentage', { percent: quotaPercentage.toFixed(1) })}
                </div>

                {/* Warnings */}
                {quotaPercentage >= 100 && (
                  <div className="alert alert-danger">
                    <Icon name="alertTriangle" size={16} /> {t('settings.quotaLimitReached')}
                  </div>
                )}
                {quotaPercentage >= 80 && quotaPercentage < 100 && (
                  <div className="alert alert-warning">
                    <Icon name="alertTriangle" size={16} /> {t('settings.quotaLimitApproaching')}
                  </div>
                )}
              </div>

              {/* Trial Info */}
              {trialInfo && trialInfo.is_trial && (
                <div className="quota-section">
                  <h3 className="quota-title">{t('settings.trialPeriod')}</h3>
                  <div className="info-row">
                    <span className="info-label">{t('settings.daysRemaining')}:</span>
                    <span className="info-value">{trialInfo.days_remaining} {t('settings.days')}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t('settings.startDate')}:</span>
                    <span className="info-value">
                      {new Date(trialInfo.start_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t('settings.endDate')}:</span>
                    <span className="info-value">
                      {new Date(trialInfo.end_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Token Usage */}
              {tokenUsage && (
                <div className="quota-section">
                  <h3 className="quota-title">{t('settings.tokenUsage')}</h3>
                  <div className="quota-stats">
                    <div className="stat-item">
                      <span className="stat-label">{t('settings.inputTokens')}:</span>
                      <span className="stat-value">{tokenUsage.input_tokens.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">{t('settings.outputTokens')}:</span>
                      <span className="stat-value">{tokenUsage.output_tokens.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">{t('settings.totalTokens')}:</span>
                      <span className="stat-value">{tokenUsage.total_tokens.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="info-card">
              <p className="no-data">{t('settings.noQuotaData')}</p>
            </div>
          )}
        </section>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={handleLogoutCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.confirmLogout')}</h3>
            </div>
            <div className="modal-body">
              <p>{t('settings.logoutMessage')}</p>
              <p className="warning-text">{t('settings.logoutWarning')}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleLogoutCancel}>
                {t('common.cancel')}
              </button>
              <button className="btn-confirm-delete" onClick={handleLogoutConfirm}>
                {t('settings.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
