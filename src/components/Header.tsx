import React, { useState } from 'react';
import { Sun, Moon, Menu, X, Bell, Download, Sparkles, CheckCircle2 } from 'lucide-react';
import { ThemeMode, TelemetryEventDocument } from '../types';

interface HeaderProps {
  activeTab: 'dashboard' | 'analytics' | 'users' | 'notifications' | 'videos';
  totalUsersCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  firestoreConnected: boolean;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  alerts?: TelemetryEventDocument[];
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  totalUsersCount,
  theme,
  onToggleTheme,
  firestoreConnected,
  onToggleMobileMenu,
  isMobileMenuOpen,
  alerts = [],
}) => {
  const isDark = theme === 'dark';
  const [showAlertsPopover, setShowAlertsPopover] = useState(false);

  // Filter high priority alerts (Get App Clicks / Download intents)
  const highPriorityAlerts = alerts.filter(
    (a) =>
      a &&
      (a.event_type === 'get_app_click' ||
        a.event_type === 'app_download_intent' ||
        a.event_type === 'unmute_shake')
  );

  return (
    <header
      className={`border-b px-4 lg:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors duration-200 ${
        isDark
          ? 'bg-zinc-950/90 border-zinc-800 text-white backdrop-blur-md'
          : 'bg-white/90 border-zinc-200 text-zinc-900 backdrop-blur-md'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className={`p-2 rounded-xl border lg:hidden transition-all ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
            title="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-red-500" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        {/* Title */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight capitalize">
              {activeTab === 'dashboard'
                ? 'Dashboard'
                : activeTab === 'analytics'
                ? 'Analytics'
                : activeTab === 'notifications'
                ? 'Notifications'
                : activeTab === 'videos'
                ? 'Videos Manager'
                : 'Users Directory'}
            </h1>
            <span
              className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider flex items-center gap-1 ${
                firestoreConnected ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>{firestoreConnected ? 'Live' : 'Offline'}</span>
            </span>
          </div>
          <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'} hidden sm:block`}>
            {activeTab === 'dashboard' && 'Realtime user traffic and session distribution'}
            {activeTab === 'analytics' && 'Detailed breakdown of traffic sources and locale stats'}
            {activeTab === 'users' && `${totalUsersCount} active user sessions tracked`}
          </p>
        </div>
      </div>

      {/* Top Header Controls: Telemetry Alerts Bell & Theme Toggle */}
      <div className="flex items-center gap-2 relative">
        {/* High Priority Realtime Alert Bell */}
        <div className="relative">
          <button
            onClick={() => setShowAlertsPopover((prev) => !prev)}
            title="Real-time Telemetry Alerts"
            className={`p-2.5 rounded-xl border transition-all relative ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
            }`}
          >
            <Bell className="w-4.5 h-4.5" />
            {highPriorityAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white ring-2 ring-zinc-950 animate-pulse">
                {highPriorityAlerts.length > 9 ? '9+' : highPriorityAlerts.length}
              </span>
            )}
          </button>

          {/* Alerts Popover Menu */}
          {showAlertsPopover && (
            <div
              className={`absolute right-0 mt-2 w-80 sm:w-96 border rounded-2xl p-4 shadow-2xl z-50 transition-all ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/50 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-red-500 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-wider">
                    High Priority Triggers
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-950 text-red-400 border border-red-900">
                  {highPriorityAlerts.length} Alerts
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 text-xs">
                {highPriorityAlerts.length === 0 ? (
                  <p className={`text-center py-6 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    No high-priority events logged yet.
                  </p>
                ) : (
                  highPriorityAlerts.slice(0, 10).map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                        isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-red-600/20 text-red-500 border border-red-500/30 shrink-0 mt-0.5">
                        <Download className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-red-500 uppercase text-[10px]">
                            {alert.event_type?.replace(/_/g, ' ') || 'Get App Click'}
                          </span>
                          <span className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            {alert.country || 'GH'} • {alert.device_type || 'Mobile'}
                          </span>
                        </div>
                        <p className={`text-[11px] font-medium mt-0.5 truncate ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          User <code className="font-mono text-red-400 font-bold">{alert.userId || 'Visitor'}</code> clicked Get App
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className={`p-2.5 rounded-xl border transition-all ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
              : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
          }`}
        >
          {isDark ? (
            <Sun className="w-4.5 h-4.5 text-red-500" />
          ) : (
            <Moon className="w-4.5 h-4.5 text-red-600" />
          )}
        </button>
      </div>
    </header>
  );
};
