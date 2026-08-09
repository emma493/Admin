import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Trash2,
  Zap,
} from 'lucide-react';
import { UserDocument, UserStatus, ThemeMode } from '../types';
import { formatDuration, formatTimeAgo, getCountryInfo } from '../lib/utils';
import { CountryFlag, SocialLogo, DeviceLogo } from './LogosAndFlags';

interface UserDetailModalProps {
  user: UserDocument | null;
  onClose: () => void;
  onToggleStatus: (userId: string, status: UserStatus) => void;
  onDeleteUser: (userId: string) => void;
  onSimulateHit: (userId: string) => void;
  theme: ThemeMode;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  onClose,
  onToggleStatus,
  onDeleteUser,
  onSimulateHit,
  theme,
}) => {
  if (!user) return null;

  const isDark = theme === 'dark';
  const countryInfo = getCountryInfo(user.country);

  const [liveDuration, setLiveDuration] = useState(user.totalDurationSeconds || 0);

  useEffect(() => {
    setLiveDuration(user.totalDurationSeconds || 0);
  }, [user]);

  useEffect(() => {
    if (user.status !== 'Online') return;
    const interval = setInterval(() => {
      setLiveDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [user.status]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div
        className={`border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 ${
          isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between flex-shrink-0 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <CountryFlag code={user.country} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-mono font-black truncate">{user.userId}</h3>
                {user.status === 'Online' ? (
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-600 text-white shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    Offline
                  </span>
                )}
              </div>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'} truncate`}>
                {countryInfo.name} ({user.country})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors flex-shrink-0 ${
              isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Duration Counter */}
          <div
            className={`border rounded-xl p-3.5 sm:p-4 flex items-center justify-between ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div>
              <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <Clock className="w-3.5 h-3.5 text-red-600" />
                <span>Active Session Duration</span>
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono mt-1 text-red-600">
                {formatDuration(liveDuration)}
              </div>
            </div>

            {user.status === 'Online' && (
              <span className="flex items-center gap-1 text-[11px] text-white bg-emerald-600 px-2.5 py-1 rounded-full font-bold animate-pulse shadow-sm">
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Live Ticking</span>
              </span>
            )}
          </div>

          {/* Device & Traffic Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              className={`border rounded-xl p-3 ${
                isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <span className={`font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Device Spec
              </span>
              <div className="mt-1 font-black">
                <DeviceLogo type={user.deviceType} size="sm" showLabel={true} />
              </div>
            </div>

            <div
              className={`border rounded-xl p-3 ${
                isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <span className={`font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Traffic Source
              </span>
              <div className="mt-1 font-black truncate">
                <SocialLogo name={user.trafficSource} size="sm" showLabel={true} />
              </div>
            </div>

            <div
              className={`border rounded-xl p-3 ${
                isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <span className={`font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Current Page
              </span>
              <div className="mt-1 font-mono font-black text-red-600 truncate">
                {user.currentPage}
              </div>
            </div>

            <div
              className={`border rounded-xl p-3 ${
                isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <span className={`font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Last Activity
              </span>
              <div className="mt-1 font-black truncate">
                {formatTimeAgo(user.lastActive)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`pt-4 border-t flex items-center justify-between gap-2 flex-wrap ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <button
              onClick={() => onSimulateHit(user.userId)}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-sm flex-1 sm:flex-initial"
            >
              Record Hit
            </button>

            <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
              <button
                onClick={() =>
                  onToggleStatus(
                    user.userId,
                    user.status === 'Online' ? 'Offline' : 'Online'
                  )
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                  user.status === 'Online'
                    ? isDark
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                    : 'bg-red-600 text-white border-red-600 hover:bg-red-500'
                }`}
              >
                {user.status === 'Online' ? 'Disconnect' : 'Connect'}
              </button>

              <button
                onClick={() => {
                  onDeleteUser(user.userId);
                  onClose();
                }}
                className="p-2 rounded-xl bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-900/40 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
