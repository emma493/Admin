import React from 'react';
import { Video, Sparkles } from 'lucide-react';
import { ThemeMode } from '../types';

interface MobileNavProps {
  activeTab: 'videos' | 'test';
  setActiveTab: (tab: 'videos' | 'test') => void;
  unapprovedCount?: number;
  theme: ThemeMode;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  unapprovedCount = 0,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t px-4 py-2 flex items-center justify-around backdrop-blur-xl transition-colors ${
        isDark
          ? 'bg-black/90 border-zinc-800 text-white'
          : 'bg-white/90 border-zinc-200 text-zinc-900'
      }`}
    >
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
        <span>Videos Manager</span>
      </button>

      <button
        onClick={() => setActiveTab('test')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all relative ${
          activeTab === 'test'
            ? 'text-red-600 bg-red-950/30 font-extrabold'
            : isDark
            ? 'text-zinc-400 hover:text-white'
            : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 mb-0.5" />
          {unapprovedCount > 0 && (
            <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center">
              {unapprovedCount > 99 ? '99+' : unapprovedCount}
            </span>
          )}
        </div>
        <span>Test & Approve</span>
      </button>
    </nav>
  );
};
