import React from 'react';
import { Activity } from 'lucide-react';
import { ThemeMode } from '../types';

interface RealTimeTrackerStatusProps {
  currentVisitorId: string;
  realDuration: number;
  theme: ThemeMode;
}

export const RealTimeTrackerStatus: React.FC<RealTimeTrackerStatusProps> = ({
  currentVisitorId,
  realDuration,
  theme,
}) => {
  const isDark = theme === 'dark';

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  return (
    <div
      className={`border rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-3 transition-all ${
        isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 rounded-xl border bg-red-950/80 border-red-900 text-red-500 flex-shrink-0">
          <Activity className="w-5 h-5 animate-pulse text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs sm:text-sm font-black truncate">Active Session Monitor</h4>
            <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold rounded-full bg-emerald-600 text-white flex items-center gap-1 flex-shrink-0 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              Realtime Sync
            </span>
          </div>
          <p className={`text-[11px] sm:text-xs mt-0.5 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Session ID <code className="font-mono text-red-500 font-bold">{currentVisitorId || 'Active'}</code> • Duration:{' '}
            <span className="font-mono font-bold text-red-500">{formatMinSec(realDuration)}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
