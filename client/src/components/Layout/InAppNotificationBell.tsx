import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Bell, Trash2, CheckCheck } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useInAppNotificationStore } from '../../store/inAppNotificationStore.ts'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import InAppNotificationItem from '../Notifications/InAppNotificationItem.tsx'

export default function InAppNotificationBell(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const darkMode = settings.dark_mode;
  const dark =
    darkMode === true ||
    darkMode === 'dark' ||
    (darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { notifications, unreadCount, isLoading, fetchNotifications, fetchUnreadCount, markAllRead, deleteAll } =
    useInAppNotificationStore();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [isAuthenticated]);

  const handleOpen = () => {
    if (!open) {
      fetchNotifications(true);
    }
    setOpen((v) => !v);
  };

  const handleShowAll = () => {
    setOpen(false);
    navigate('/notifications');
  };

  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <div className="relative flex-shrink-0">
      <button type="button"
        onClick={handleOpen}
        title={t('notifications.title')}
        className="relative rounded-lg p-2 text-content-muted transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full font-bold text-white"
            style={{
              background: '#ef4444',
              fontSize: 'calc(9px * var(--fs-scale-caption, 1))',
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
            {displayCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Click-away catcher only — the bell button itself closes the panel again from the keyboard. */}
          <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            className="rounded-xl shadow-xl border overflow-hidden bg-surface-card border-edge"
            style={{
              position: 'fixed',
              top: 'var(--nav-h)',
              right: 8,
              width: 360,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'min(480px, calc(100vh - var(--nav-h) - 16px))',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              className="overflow-hidden rounded-xl border border-edge bg-surface-card shadow-xl"
              style={{
                position: 'fixed',
                top: 'var(--nav-h)',
                right: 8,
                width: 360,
                maxWidth: 'calc(100vw - 16px)',
                maxHeight: 'min(480px, calc(100vh - var(--nav-h) - 16px))',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span className="text-sm font-semibold text-content">
                {t('notifications.title')}
                {unreadCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium bg-content text-surface">
                    {unreadCount}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button type="button"
                    onClick={markAllRead}
                    title={t('notifications.markAllRead')}
                    className="p-1.5 rounded-lg transition-colors text-content-muted"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button type="button"
                    onClick={deleteAll}
                    title={t('notifications.deleteAll')}
                    className="p-1.5 rounded-lg transition-colors text-content-muted"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Footer */}
              <button
                onClick={handleShowAll}
                className="w-full flex-shrink-0 border-t border-edge-secondary py-2.5 text-xs font-medium text-content transition-colors"
                style={{
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {t('notifications.showAll')}
              </button>
            </div>

            {/* Footer */}
            <button type="button"
              onClick={handleShowAll}
              className="w-full py-2.5 text-xs font-medium transition-colors flex-shrink-0 border-t border-edge-secondary text-content"
              style={{
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {t('notifications.showAll')}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
