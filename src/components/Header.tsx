import React from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { ThemeMode } from '../types';

interface HeaderProps {
  activeTab: 'videos';
  theme: ThemeMode;
  onToggleTheme: () => void;
  firestoreConnected: boolean;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  firestoreConnected,
  onToggleMobileMenu,
  isMobileMenuOpen,
}) => {
  const isDark = theme === 'dark';

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
              Videos Manager
            </h1>
            <span
              className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider flex items-center gap-1 ${
                firestoreConnected ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>{firestoreConnected ? 'Live Firestore' : 'Offline'}</span>
            </span>
          </div>
          <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'} hidden sm:block`}>
            Manage video stream links, active status, and views count
          </p>
        </div>
      </div>

      {/* Top Header Controls: Theme Toggle */}
      <div className="flex items-center gap-2 relative">
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
