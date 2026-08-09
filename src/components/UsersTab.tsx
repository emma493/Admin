import React, { useState, useMemo } from 'react';
import {
  Search,
  Eye,
  Trash2,
  SlidersHorizontal,
  Bell,
  BellOff,
  Download,
} from 'lucide-react';
import {
  UserDocument,
  UserFilterState,
  UserStatus,
  ThemeMode,
  DateRangeState,
} from '../types';
import {
  formatDuration,
  getCountryInfo,
  isUserInDateRange,
} from '../lib/utils';
import { CountryFlag, SocialLogo, DeviceLogo } from './LogosAndFlags';
import { CustomDropdown } from './CustomDropdown';
import { DateRangeFilter } from './DateRangeFilter';

interface UsersTabProps {
  users: UserDocument[];
  onSelectUser: (user: UserDocument) => void;
  onToggleStatus: (userId: string, newStatus: UserStatus) => void;
  onToggleNotificationSubscribed?: (userId: string, currentSubscribed: boolean) => void;
  onDeleteUser: (userId: string) => void;
  onOpenAddUser: () => void;
  theme: ThemeMode;
  dateRange: DateRangeState;
  onDateRangeChange: (newRange: DateRangeState) => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  onSelectUser,
  onToggleStatus,
  onToggleNotificationSubscribed,
  onDeleteUser,
  onOpenAddUser,
  theme,
  dateRange,
  onDateRangeChange,
}) => {
  const isDark = theme === 'dark';

  // Filter & Search State
  const [filters, setFilters] = useState<UserFilterState>({
    searchQuery: '',
    status: 'All',
    deviceType: 'All',
    country: 'All',
    sortBy: 'durationDesc',
  });

  // Filtered and Sorted Users
  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        // Date range filter
        if (!isUserInDateRange(user, dateRange.startDate, dateRange.endDate)) {
          return false;
        }

        if (filters.searchQuery) {
          const q = filters.searchQuery.toLowerCase().trim();
          const matchUuid = user.userId.toLowerCase().includes(q);
          const matchCountry = user.country.toLowerCase().includes(q);
          const matchSource = user.trafficSource.toLowerCase().includes(q);
          const matchPage = user.currentPage.toLowerCase().includes(q);
          if (!matchUuid && !matchCountry && !matchSource && !matchPage) {
            return false;
          }
        }

        if (filters.status !== 'All' && user.status !== filters.status) {
          return false;
        }

        if (filters.deviceType !== 'All' && user.deviceType !== filters.deviceType) {
          return false;
        }

        if (filters.country !== 'All' && user.country.toUpperCase() !== filters.country) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === 'durationDesc') {
          return (b.totalDurationSeconds || 0) - (a.totalDurationSeconds || 0);
        }
        if (filters.sortBy === 'durationAsc') {
          return (a.totalDurationSeconds || 0) - (b.totalDurationSeconds || 0);
        }
        if (filters.sortBy === 'recentActive') {
          const tA = new Date(a.lastActive || 0).getTime();
          const tB = new Date(b.lastActive || 0).getTime();
          return tB - tA;
        }
        if (filters.sortBy === 'userId') {
          return a.userId.localeCompare(b.userId);
        }
        return 0;
      });
  }, [users, filters, dateRange]);

  return (
    <div className="space-y-6">
      {/* DATE RANGE FILTER BAR */}
      <DateRangeFilter value={dateRange} onChange={onDateRangeChange} isDark={isDark} />

      {/* FILTER & SEARCH CONTROLS BAR */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>User Directory</span>
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Realtime live user monitoring, duration tracking, and session controls.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-between sm:justify-end">
            <span
              className={`px-2.5 py-1 rounded-lg font-extrabold border ${
                isDark
                  ? 'bg-red-950 text-red-400 border-red-900'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {filteredUsers.length} / {users.length} Sessions
            </span>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search UUID (e.g. GH2156790) or Country..."
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
              className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-red-600 ${
                isDark
                  ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-500'
                  : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
              }`}
            />
          </div>

          {/* Status Filter Dropdown */}
          <div>
            <CustomDropdown
              isDark={isDark}
              value={filters.status}
              onChange={(val) => setFilters({ ...filters, status: val as any })}
              options={[
                { value: 'All', label: 'Status: All', badge: `${users.length}` },
                {
                  value: 'Online',
                  label: 'Online',
                  icon: <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />,
                  badge: `${users.filter((u) => u.status === 'Online').length}`,
                },
                {
                  value: 'Offline',
                  label: 'Offline',
                  icon: <span className="w-2 h-2 rounded-full bg-red-500" />,
                  badge: `${users.filter((u) => u.status === 'Offline').length}`,
                },
              ]}
            />
          </div>

          {/* Device Filter Dropdown */}
          <div>
            <CustomDropdown
              isDark={isDark}
              value={filters.deviceType}
              onChange={(val) => setFilters({ ...filters, deviceType: val as any })}
              options={[
                { value: 'All', label: 'Device: All' },
                { value: 'Mobile', label: 'Mobile', icon: <DeviceLogo type="Mobile" size="xs" /> },
                { value: 'Desktop', label: 'Desktop', icon: <DeviceLogo type="Desktop" size="xs" /> },
                { value: 'Tablet', label: 'Tablet', icon: <DeviceLogo type="Tablet" size="xs" /> },
              ]}
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="sm:col-span-2 lg:col-span-1">
            <CustomDropdown
              isDark={isDark}
              value={filters.sortBy}
              onChange={(val) => setFilters({ ...filters, sortBy: val as any })}
              options={[
                { value: 'durationDesc', label: 'Duration (High → Low)' },
                { value: 'durationAsc', label: 'Duration (Low → High)' },
                { value: 'recentActive', label: 'Recent Activity' },
                { value: 'userId', label: 'User UUID' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* MOBILE CARD VIEW (Shown on mobile screens < md) */}
      <div className="block md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div
            className={`border rounded-2xl p-8 text-center ${
              isDark ? 'bg-zinc-900/90 border-zinc-800 text-zinc-500' : 'bg-white border-zinc-200 text-zinc-400'
            }`}
          >
            <p className="font-bold text-sm">No users match your filters.</p>
            <p className="text-xs mt-1">Try resetting search filters.</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const countryInfo = getCountryInfo(user.country);
            return (
              <div
                key={user.id}
                className={`border rounded-2xl p-4 space-y-3 transition-all ${
                  isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
                }`}
              >
                {/* Header Row: UUID & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CountryFlag code={user.country} size="md" />
                    <div>
                      <button
                        onClick={() => onSelectUser(user)}
                        className="font-mono font-black text-sm hover:text-red-600 transition-colors block text-left"
                      >
                        {user.userId}
                      </button>
                      <span className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {countryInfo.name} ({user.country})
                      </span>
                    </div>
                  </div>

                  {user.status === 'Online' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-600 text-white shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                      Offline
                    </span>
                  )}
                </div>

                {/* Details Grid */}
                <div
                  className={`grid grid-cols-2 gap-2 text-xs p-3 rounded-xl border ${
                    isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Duration
                    </span>
                    <span className="font-mono font-black text-red-600 text-xs">
                      {formatDuration(user.totalDurationSeconds)}
                    </span>
                  </div>

                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Device
                    </span>
                    <DeviceLogo type={user.deviceType} size="xs" showLabel={true} />
                  </div>

                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Notifications
                    </span>
                    <button
                      onClick={() =>
                        onToggleNotificationSubscribed &&
                        onToggleNotificationSubscribed(user.userId, !!user.notificationsSubscribed)
                      }
                      className="inline-flex items-center gap-1.5 py-0.5"
                    >
                      {user.notificationsSubscribed ? (
                        <span className="flex items-center gap-1 text-emerald-500 font-extrabold text-[11px]" title="Subscribed to Notifications">
                          <Bell className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/20" />
                          Subscribed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-400 font-bold text-[11px]" title="Not Subscribed">
                          <BellOff className="w-3.5 h-3.5 text-zinc-400" />
                          Not Subscribed
                        </span>
                      )}
                    </button>
                  </div>

                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Downloads
                    </span>
                    <span className="font-mono font-black text-xs inline-flex items-center gap-1 text-red-500">
                      <Download className="w-3 h-3 text-red-500" />
                      {user.totalDownloads || 0}
                    </span>
                  </div>

                  <div className="col-span-2 pt-1 border-t border-zinc-800/40 flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      Page: <code className="text-red-500 font-mono">{user.currentPage}</code>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Source:
                      </span>
                      <SocialLogo name={user.trafficSource} size="xs" showLabel={true} />
                    </div>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="flex items-center justify-between pt-1 gap-2">
                  <button
                    onClick={() => onSelectUser(user)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
                      isDark
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-red-500" />
                    <span>Inspect</span>
                  </button>

                  <button
                    onClick={() =>
                      onToggleStatus(
                        user.userId,
                        user.status === 'Online' ? 'Offline' : 'Online'
                      )
                    }
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
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
                    onClick={() => onDeleteUser(user.userId)}
                    className="p-2 rounded-xl bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-900/40 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (Shown on md and larger screens) */}
      <div
        className={`hidden md:block border rounded-2xl shadow-sm overflow-hidden ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-[11px] font-black uppercase tracking-wider ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                }`}
              >
                <th className="py-3.5 px-4">Custom UUID</th>
                <th className="py-3.5 px-4 text-center" title="Notification Subscription Status">Notif.</th>
                <th className="py-3.5 px-4 text-center" title="Total Downloads Completed">Downloads</th>
                <th className="py-3.5 px-4">Country</th>
                <th className="py-3.5 px-4">Device Spec</th>
                <th className="py-3.5 px-4">Total Duration</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Current Page</th>
                <th className="py-3.5 px-4">Traffic Source</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y text-xs ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-100'}`}>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`py-12 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <p className="font-bold text-sm">No users match your filters.</p>
                    <p className="text-xs mt-1">Try resetting search filters.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const countryInfo = getCountryInfo(user.country);

                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors ${
                        isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-50'
                      }`}
                    >
                      {/* UUID */}
                      <td className="py-3.5 px-4 font-mono font-bold flex items-center gap-2">
                        <button
                          onClick={() => onSelectUser(user)}
                          className="hover:text-red-600 transition-colors flex items-center gap-1.5"
                        >
                          <span>{user.userId}</span>
                        </button>
                      </td>

                      {/* Notification Subscribed Icon */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() =>
                            onToggleNotificationSubscribed &&
                            onToggleNotificationSubscribed(user.userId, !!user.notificationsSubscribed)
                          }
                          className="p-1 rounded-lg hover:bg-zinc-800/40 transition-all inline-block"
                        >
                          {user.notificationsSubscribed ? (
                            <Bell
                              className="w-4 h-4 text-emerald-500 fill-emerald-500/20 mx-auto transition-transform hover:scale-110"
                              title="Subscribed to Notifications (Click to toggle)"
                            />
                          ) : (
                            <BellOff
                              className="w-4 h-4 text-zinc-400 mx-auto transition-transform hover:scale-110"
                              title="Not Subscribed (Click to toggle)"
                            />
                          )}
                        </button>
                      </td>

                      {/* Total Downloads */}
                      <td className="py-3.5 px-4 text-center font-mono font-black text-xs text-red-500">
                        <span className="inline-flex items-center gap-1">
                          <Download className="w-3.5 h-3.5 text-red-500" />
                          {user.totalDownloads || 0}
                        </span>
                      </td>

                      {/* Country */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-medium">
                          <CountryFlag code={user.country} size="md" />
                          <span className="font-bold">{countryInfo.name}</span>
                          <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            ({user.country})
                          </span>
                        </div>
                      </td>

                      {/* Device Type */}
                      <td className="py-3.5 px-4">
                        <DeviceLogo type={user.deviceType} size="sm" showLabel={true} />
                      </td>

                      {/* Total Duration */}
                      <td className="py-3.5 px-4 font-mono font-bold text-red-600">
                        {formatDuration(user.totalDurationSeconds)}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        {user.status === 'Online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Current Page */}
                      <td className={`py-3.5 px-4 max-w-[140px] truncate font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {user.currentPage}
                      </td>

                      {/* Traffic Source */}
                      <td className="py-3.5 px-4">
                        <SocialLogo name={user.trafficSource} size="sm" showLabel={true} />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => onSelectUser(user)}
                            title="Inspect User Details"
                            className={`p-1.5 rounded-lg transition-all ${
                              isDark
                                ? 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
                                : 'bg-zinc-100 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5 text-red-500" />
                          </button>

                          {/* Toggle Status */}
                          <button
                            onClick={() =>
                              onToggleStatus(
                                user.userId,
                                user.status === 'Online' ? 'Offline' : 'Online'
                              )
                            }
                            title={`Toggle to ${user.status === 'Online' ? 'Offline' : 'Online'}`}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              user.status === 'Online'
                                ? isDark
                                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                                : 'bg-red-600 text-white border-red-600 hover:bg-red-500'
                            }`}
                          >
                            {user.status === 'Online' ? 'Disconnect' : 'Connect'}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => onDeleteUser(user.userId)}
                            title="Delete User Document"
                            className="p-1.5 rounded-lg bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-900/40 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
