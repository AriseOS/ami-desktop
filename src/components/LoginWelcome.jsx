import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icons';
import './LoginWelcome.css';

const CARDS = [
  { icon: 'logIn', titleKey: 'loginTitle', descKey: 'loginDesc' },
  { icon: 'robot', titleKey: 'agentTitle', descKey: 'agentDesc' },
  { icon: 'zap', titleKey: 'memoryTitle', descKey: 'memoryDesc' },
];

export default function LoginWelcome() {
  const { t } = useTranslation();

  return (
    <div className="login-welcome-overlay">
      <div className="login-welcome-inner">
        <h2 className="login-welcome-title">{t('loginWelcome.title')}</h2>
        <p className="login-welcome-subtitle">{t('loginWelcome.subtitle')}</p>

        <div className="login-welcome-cards">
          {CARDS.map((card) => (
            <div className="login-welcome-card" key={card.titleKey}>
              <div className="login-welcome-card-icon">
                <Icon name={card.icon} size={20} />
              </div>
              <h3 className="login-welcome-card-title">
                {t(`loginWelcome.${card.titleKey}`)}
              </h3>
              <p className="login-welcome-card-desc">
                {t(`loginWelcome.${card.descKey}`)}
              </p>
            </div>
          ))}
        </div>

        <div className="login-welcome-hint">
          <Icon name="chevronUp" size={14} />
          <span>{t('loginWelcome.hint')}</span>
        </div>
      </div>
    </div>
  );
}
