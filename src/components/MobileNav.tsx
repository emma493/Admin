import React from 'react';
import { Activity, BarChart3, Users, Bell, Video } from 'lucide-react';
import { ThemeMode } from '../types';

interface MobileNavProps {
  activeTab: 'dashboard' | 'analytics' | 'users' | 'notifications' | 'videos';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'users' | 'notifications' | 'videos') => void;
  onlineCount: number;
  theme: ThemeMode;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  onlineCount,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t px-2 py-2 flex items-center justify-around backdrop-blur-xl transition-colors ${
        isDark
          ? 'bg-black/90 border-zinc-800 text-white'
          : 'bg-white/90 border-zinc-200 text-zinc-900'
      }`}
    >
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
          activeTab === 'dashboard'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <Activity className="w-5 h-5 mb-0.5" />
        <span>Dashboard</span>
      </button>

      <button
        onClick={() => setActiveTab('analytics')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
          activeTab === 'analytics'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <BarChart3 className="w-5 h-5 mb-0.5" />
        <span>Analytics</span>
      </button>

      <button
        onClick={() => setActiveTab('users')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all relative ${
          activeTab === 'users'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <div className="relative">
          <Users className="w-5 h-5 mb-0.5" />
          {onlineCount > 0 && (
            <span className="absolute -top-1 -right-2.5 px-1.5 py-0.2 text-[9px] font-black rounded-full bg-emerald-600 text-white shadow-sm">
              {onlineCount}
            </span>
          )}
        </div>
        <span>Users</span>
      </button>

      <button
        onClick={() => setActiveTab('notifications')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
          activeTab === 'notifications'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <Bell className="w-5 h-5 mb-0.5" />
        <span>Notifs</span>
      </button>

      <button
        onClick={() => setActiveTab('videos')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
          activeTab === 'videos'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <Video className="w-5 h-5 mb-0.5" />
        <span>Videos</span>
      </button>
    </nav>
  );
};
