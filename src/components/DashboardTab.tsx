import React, { useState } from 'react';
import {
  Users,
  Eye,
  Activity,
  Zap,
  TrendingUp,
  Clock,
  Globe,
  Smartphone,
  Laptop,
  Tablet as TabletIcon,
  ArrowUpRight,
  ShieldAlert,
  Layers,
  Filter,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  UserDocument,
  DailyAnalyticsDocument,
  AdminAnalyticsDocument,
  LiveActivityEvent,
  ThemeMode,
  DateRangeState,
} from '../types';
import {
  formatDuration,
  formatTimeAgo,
  getCountryInfo,
  isUserActiveWithin,
  isUserInDateRange,
  isDateInRange,
} from '../lib/utils';
import { CountryFlag } from './LogosAndFlags';
import { DateRangeFilter } from './DateRangeFilter';

interface DashboardTabProps {
  users: UserDocument[];
  dailyAnalytics: DailyAnalyticsDocument | null;
  allDailyAnalytics?: DailyAnalyticsDocument[];
  adminAnalytics: AdminAnalyticsDocument | null;
  activityFeed: LiveActivityEvent[];
  onNavigateToUsers: () => void;
  onNavigateToAnalytics: () => void;
  onDownloadApp: () => void;
  theme: ThemeMode;
  dateRange: DateRangeState;
  onDateRangeChange: (newRange: DateRangeState) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  users,
  dailyAnalytics,
  allDailyAnalytics = [],
  adminAnalytics,
  activityFeed,
  onNavigateToUsers,
  onNavigateToAnalytics,
  onDownloadApp,
  theme,
  dateRange,
  onDateRangeChange,
}) => {
  const isDark = theme === 'dark';
  const [activeSubView, setActiveSubView] = useState<'overview' | 'response' | 'cache' | 'geo'>('overview');

  // Filter users based on selected date range
  const filteredUsers = users.filter((u) => isUserInDateRange(u, dateRange.startDate, dateRange.endDate));

  // Active Users (ping within 30s)
  const activeUsersCount = filteredUsers.filter((u) => isUserActiveWithin(u, 30)).length;
  const totalOnlineCount = filteredUsers.filter((u) => u.status === 'Online').length;

  // Aggregate Analytics for selected date range
  const matchingAnalyticsDocs = allDailyAnalytics.filter((doc) =>
    isDateInRange(doc.date, dateRange.startDate, dateRange.endDate)
  );

  const overallPageViews = matchingAnalyticsDocs.length > 0
    ? matchingAnalyticsDocs.reduce((acc, d) => acc + (d.pageViews || 0), 0)
    : (dailyAnalytics?.pageViews ?? 0);

  const uniqueSet = new Set<string>();
  if (matchingAnalyticsDocs.length > 0) {
    matchingAnalyticsDocs.forEach((d) => (d.uniqueVisitors || []).forEach((uv) => uniqueSet.add(uv)));
  } else if (dailyAnalytics?.uniqueVisitors) {
    dailyAnalytics.uniqueVisitors.forEach((uv) => uniqueSet.add(uv));
  }
  const realTimeUniqueVisitors = uniqueSet.size;

  // Aggregate Hourly traffic data (0 to 23)
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const key = h.toString();
    let hits = 0;
    if (matchingAnalyticsDocs.length > 0) {
      hits = matchingAnalyticsDocs.reduce((sum, d) => sum + (d.hourlyTraffic?.[key] || 0), 0);
    } else {
      hits = dailyAnalytics?.hourlyTraffic?.[key] || 0;
    }

    const hourLabel =
      h === 0
        ? '12 AM'
        : h < 12
        ? `${h} AM`
        : h === 12
        ? '12 PM'
        : `${h - 12} PM`;
    return {
      hour: h,
      hourLabel,
      hits,
    };
  });

  // Peak Traffic Hour
  let peakHourObj = { hourLabel: 'None', hits: 0 };
  hourlyData.forEach((item) => {
    if (item.hits > peakHourObj.hits) {
      peakHourObj = item;
    }
  });

  // Device counts based on filtered users
  const totalMobile = filteredUsers.filter((u) => u.deviceType === 'Mobile').length;
  const totalDesktop = filteredUsers.filter((u) => u.deviceType === 'Desktop').length;
  const totalTablet = filteredUsers.filter((u) => u.deviceType === 'Tablet').length;

  const totalDurationSum = filteredUsers.reduce((acc, u) => acc + (u.totalDurationSeconds || 0), 0);
  const avgDurationSeconds = filteredUsers.length > 0 ? Math.round(totalDurationSum / filteredUsers.length) : 0;

  // Device Donut chart data
  const devicePieData = [
    { name: 'Mobile', value: totalMobile, color: '#dc2626' }, // Red
    { name: 'Desktop', value: totalDesktop, color: isDark ? '#ffffff' : '#09090b' }, // White/Black
    { name: 'Tablet', value: totalTablet, color: isDark ? '#52525b' : '#71717a' }, // Gray
  ];

  return (
    <div className="space-y-6">
      {/* GLOBAL DATE RANGE FILTER */}
      <DateRangeFilter value={dateRange} onChange={onDateRangeChange} isDark={isDark} />

      {/* SUB-NAV PILLS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveSubView('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubView === 'overview'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
              : isDark
              ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          Overview Stats
        </button>
        <button
          onClick={() => setActiveSubView('response')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubView === 'response'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
              : isDark
              ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          Response Stats
        </button>
        <button
          onClick={() => setActiveSubView('cache')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubView === 'cache'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
              : isDark
              ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          CDN & Cache
        </button>
        <button
          onClick={() => setActiveSubView('geo')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubView === 'geo'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
              : isDark
              ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          Geo & IP Distribution
        </button>
      </div>

      {/* METRIC CARDS GRID (Red, White, Black themed) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric Card 0: App Installation Metric */}
        <div
          className={`border rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-red-600/40'
              : 'bg-white border-zinc-200 text-zinc-900 hover:border-red-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Total App Installs
            </span>
            <div className={`p-2.5 rounded-xl ${isDark ? 'bg-red-950 text-red-500 border border-red-900' : 'bg-red-50 text-red-600 border border-red-100'}`}>
              <Download className="w-5 h-5 text-red-500" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {adminAnalytics?.totalAppInstalls || 0}
            </span>
            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${isDark ? 'bg-red-950/80 text-red-400 border-red-900' : 'bg-red-50 text-red-700 border-red-200'}`}>
              Live
            </span>
          </div>

          <p className={`mt-2 text-xs flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            <span>Synced in real-time via onSnapshot</span>
          </p>
        </div>

        {/* Metric Card 1: Active Users */}
        <div
          className={`border rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-red-600/40'
              : 'bg-white border-zinc-200 text-zinc-900 hover:border-red-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Active Users
            </span>
            <div className={`p-2.5 rounded-xl ${isDark ? 'bg-red-950 text-red-500 border border-red-900' : 'bg-red-50 text-red-600 border border-red-100'}`}>
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {activeUsersCount}
            </span>
            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${isDark ? 'bg-red-950 text-red-400 border-red-900' : 'bg-red-50 text-red-700 border-red-200'}`}>
              +14.2%
            </span>
          </div>

          <p className={`mt-2 text-xs flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            <span>
              {totalOnlineCount} active online sessions out of {users.length} registered
            </span>
          </p>

          <div className={`mt-4 pt-3 border-t flex justify-between items-center text-xs ${isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
            <span>Ping Window: 30s</span>
            <button
              onClick={onNavigateToUsers}
              className="text-red-600 hover:text-red-500 font-bold flex items-center gap-0.5"
            >
              <span>View Users</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Metric Card 2: Overall Views */}
        <div
          className={`border rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-red-600/40'
              : 'bg-white border-zinc-200 text-zinc-900 hover:border-red-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Overall Page Views
            </span>
            <div className={`p-2.5 rounded-xl ${isDark ? 'bg-zinc-800 text-white border border-zinc-700' : 'bg-zinc-100 text-zinc-900 border border-zinc-200'}`}>
              <Eye className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {overallPageViews.toLocaleString()}
            </span>
            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-zinc-100 text-zinc-800 border-zinc-200'}`}>
              Today
            </span>
          </div>

          <p className={`mt-2 text-xs flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <TrendingUp className="w-3.5 h-3.5 text-red-600" />
            <span>Shortxx redirect and analytics hits</span>
          </p>

          <div className={`mt-4 pt-3 border-t flex justify-between items-center text-xs ${isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
            <span>Peak Hour: {peakHourObj.hourLabel}</span>
            <button
              onClick={onNavigateToAnalytics}
              className="text-red-600 hover:text-red-500 font-bold flex items-center gap-0.5"
            >
              <span>Breakdown</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Metric Card 3: Unique Visitors */}
        <div
          className={`border rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all sm:col-span-2 lg:col-span-1 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-red-600/40'
              : 'bg-white border-zinc-200 text-zinc-900 hover:border-red-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Unique Visitors
            </span>
            <div className={`p-2.5 rounded-xl ${isDark ? 'bg-red-950 text-red-500 border border-red-900' : 'bg-red-50 text-red-600 border border-red-100'}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {realTimeUniqueVisitors}
            </span>
            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${isDark ? 'bg-red-950 text-red-400 border-red-900' : 'bg-red-50 text-red-700 border-red-200'}`}>
              99.2% Success
            </span>
          </div>

          <p className={`mt-2 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Unique user IDs tracked today
          </p>

          <div className={`mt-4 pt-3 border-t flex justify-between items-center text-xs ${isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
            <span>Avg Session: {formatDuration(avgDurationSeconds)}</span>
            <button
              onClick={onNavigateToUsers}
              className="text-red-600 hover:text-red-500 font-bold flex items-center gap-0.5"
            >
              <span>Explore</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MAIN TRAFFIC CHART CARD */}
      <div
        className={`border rounded-2xl p-6 shadow-sm transition-all ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight">
                Hourly Traffic Volume
              </h2>
              <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-red-950 text-red-400 border-red-900' : 'bg-red-50 text-red-700 border-red-200'}`}>
                12 AM to 11 PM
              </span>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Realtime traffic distribution logged in Firestore
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
              <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Hits
              </span>
            </div>
            <div
              className={`px-3 py-1 rounded-xl font-bold border ${
                isDark ? 'bg-zinc-800 text-zinc-200 border-zinc-700' : 'bg-zinc-100 text-zinc-800 border-zinc-200'
              }`}
            >
              Peak: {peakHourObj.hits} hits @ {peakHourObj.hourLabel}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="redTrafficGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? '#27272a' : '#f4f4f5'}
                vertical={false}
              />
              <XAxis
                dataKey="hourLabel"
                stroke={isDark ? '#71717a' : '#a1a1aa'}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: isDark ? '#27272a' : '#e4e4e7' }}
              />
              <YAxis
                stroke={isDark ? '#71717a' : '#a1a1aa'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#09090b' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e4e4e7',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                  color: isDark ? '#ffffff' : '#09090b',
                }}
                labelStyle={{ fontWeight: 'bold', color: '#dc2626' }}
                formatter={(value: any) => [`${value} hits`, 'Traffic Hits']}
              />
              <Area
                type="monotone"
                dataKey="hits"
                stroke="#dc2626"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#redTrafficGradient)"
                activeDot={{ r: 6, fill: '#ef4444', stroke: '#dc2626', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LOWER SECTION: DEVICE BREAKDOWN DONUT & LIVE TICKER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Breakdown Donut Card */}
        <div
          className={`border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div>
            <h3 className="text-base font-black flex items-center justify-between">
              <span>Device Breakdown</span>
              <span className={`text-xs font-normal ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {users.length} Users Total
              </span>
            </h3>

            {/* Donut Chart */}
            <div className="h-44 w-full my-2 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={devicePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {devicePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#09090b' : '#ffffff',
                      borderColor: isDark ? '#27272a' : '#e4e4e7',
                      borderRadius: '8px',
                      color: isDark ? '#ffffff' : '#09090b',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Device breakdown list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-red-600 inline-block" />
                  <span>Mobile</span>
                </span>
                <span>{totalMobile} users</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded inline-block ${isDark ? 'bg-white' : 'bg-zinc-900'}`} />
                  <span>Desktop</span>
                </span>
                <span>{totalDesktop} users</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-zinc-500 inline-block" />
                  <span>Tablet</span>
                </span>
                <span>{totalTablet} users</span>
              </div>
            </div>
          </div>

          <div className={`mt-6 pt-4 border-t flex items-center justify-between text-xs ${isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
            <span>Platform Mix</span>
            <span className="font-extrabold">Red / Black / Gray</span>
          </div>
        </div>

        {/* Live Activity Ticker Stream */}
        <div
          className={`lg:col-span-2 border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-600 animate-pulse" />
                <h3 className="text-base font-black">Live Event Stream</h3>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                  isDark
                    ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                }`}
              >
                Firestore Realtime
              </span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
              {activityFeed.length === 0 ? (
                <div className={`text-center py-8 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  No live events recorded yet. Turn on "Start Simulator" to generate live stream traffic!
                </div>
              ) : (
                activityFeed.slice(0, 7).map((ev) => {
                  const country = getCountryInfo(ev.country);
                  return (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                        isDark
                          ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                          : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CountryFlag code={ev.country} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold font-mono">{ev.userId}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                                isDark
                                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                  : 'bg-zinc-200 text-zinc-800 border-zinc-300'
                              }`}
                            >
                              {ev.deviceType}
                            </span>
                          </div>
                          <p className={`mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{ev.details}</p>
                        </div>
                      </div>

                      <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {formatTimeAgo(ev.timestamp)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t flex justify-between items-center text-xs ${isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
            <span>Synced in realtime</span>
            <button
              onClick={onNavigateToUsers}
              className="text-red-600 hover:text-red-500 font-bold"
            >
              Filter by User →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
