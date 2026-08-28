import React from 'react';
import { Video } from 'lucide-react';
import { ThemeMode } from '../types';

interface MobileNavProps {
  activeTab: 'videos';
  setActiveTab: (tab: 'videos') => void;
  theme: ThemeMode;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
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
    </nav>
  );
};
