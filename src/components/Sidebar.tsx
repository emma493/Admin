import React from 'react';
import {
  Activity,
  BarChart3,
  Users,
  Bell,
  Video,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BrandLogo } from './LogosAndFlags';

interface SidebarProps {
  activeTab: 'videos';
  setActiveTab: (tab: 'videos') => void;
  firestoreConnected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  firestoreConnected,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  return (
    <>
      {/* MOBILE DRAWER OVERLAY */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* SIDEBAR CONTAINER */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 flex-shrink-0 border-r flex flex-col justify-between p-4 transition-all duration-300 bg-black border-zinc-800 text-white ${
          /* Mobile Slide Drawer logic */
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${
          /* Desktop Width */
          isCollapsed ? 'lg:w-20' : 'lg:w-64'
        }`}
      >
        <div className="space-y-6">
          {/* Brand Header with Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3 overflow-hidden">
              <BrandLogo size="md" />
              {(!isCollapsed || isMobileOpen) && (
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black tracking-tight text-white">
                      Short<span className="text-red-500">xx</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5 font-bold">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        firestoreConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                      }`}
                    />
                    <span className={firestoreConnected ? 'text-emerald-400' : 'text-red-400'}>
                      {firestoreConnected ? 'Live Firestore' : 'Offline Mode'}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Mobile Close Toggle */}
            <button
              onClick={() => {
                if (isMobileOpen && onCloseMobile) {
                  onCloseMobile();
                } else {
                  onToggleCollapse();
                }
              }}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all flex-shrink-0"
            >
              {isMobileOpen ? (
                <X className="w-5 h-5 text-red-500" />
              ) : (
                <Menu className="w-5 h-5 text-zinc-300" />
              )}
            </button>
          </div>

          {/* Navigation Tabs */}
          <div>
            {(!isCollapsed || isMobileOpen) && (
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-3">
                Navigation
              </span>
            )}
            <nav className="mt-2 space-y-1">
              {/* Videos */}
              <button
                onClick={() => {
                  setActiveTab('videos');
                  if (onCloseMobile) onCloseMobile();
                }}
                title="Videos"
                className={`w-full flex items-center ${
                  isCollapsed && !isMobileOpen ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
                } rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'videos'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Video className="w-4 h-4 flex-shrink-0 text-red-400" />
                  {(!isCollapsed || isMobileOpen) && <span>Videos</span>}
                </div>
              </button>
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
};
