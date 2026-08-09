import React from 'react';
import {
  Activity,
  Users,
  BarChart3,
  Globe,
  Radio,
  Sparkles,
  UserPlus,
  Play,
  Pause,
  Database,
  RefreshCw,
} from 'lucide-react';
import { BrandLogo } from './LogosAndFlags';

interface NavbarProps {
  activeTab: 'dashboard' | 'analytics' | 'users';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'users') => void;
  onlineCount: number;
  totalUsersCount: number;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onSeedData: () => void;
  onOpenAddUser: () => void;
  isSeeding: boolean;
  firestoreConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onlineCount,
  totalUsersCount,
  isSimulating,
  onToggleSimulation,
  onSeedData,
  onOpenAddUser,
  isSeeding,
  firestoreConnected,
}) => {
  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 lg:px-8 py-3.5 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <BrandLogo size="md" />
            <span
              className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-slate-900 rounded-full ${
                firestoreConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Short<span className="text-red-500">xx</span>
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-bold">
              <Radio className={`w-3 h-3 ${firestoreConnected ? 'text-emerald-400 animate-pulse' : 'text-red-500'}`} />
              <span className={firestoreConnected ? 'text-emerald-400' : 'text-red-400'}>
                {firestoreConnected ? 'Firestore Realtime Synced' : 'Offline'}
              </span>
            </p>
          </div>
        </div>

        {/* Center Tabs Navigation */}
        <nav className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 shadow-inner">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'analytics'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
              activeTab === 'users'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users</span>
            {onlineCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {onlineCount}
              </span>
            )}
          </button>
        </nav>

        {/* Right Controls Bar */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {/* Live Simulator Toggle */}
          <button
            onClick={onToggleSimulation}
            title="Toggle automatic Firestore live traffic background simulator"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isSimulating
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/80'
            }`}
          >
            {isSimulating ? (
              <>
                <Pause className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Simulating Live</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-slate-400" />
                <span>Start Simulation</span>
              </>
            )}
          </button>

          {/* Seed Demo Data Button */}
          <button
            onClick={onSeedData}
            disabled={isSeeding}
            title="Seed Firestore with demo users & analytics"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-all disabled:opacity-50"
          >
            {isSeeding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Database className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>Seed Data</span>
          </button>

          {/* Add User Modal Button */}
          <button
            onClick={onOpenAddUser}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 transition-all shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add User</span>
          </button>
        </div>
      </div>
    </header>
  );
};
