import React from 'react';
import {
  BarChart3,
  Globe,
  PieChart as PieIcon,
  Smartphone,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { DailyAnalyticsDocument, UserDocument, ThemeMode, DateRangeState } from '../types';
import { getCountryInfo, getFormattedDate, isDateInRange, isUserInDateRange } from '../lib/utils';
import { CountryFlag } from './LogosAndFlags';
import { DateRangeFilter } from './DateRangeFilter';

interface AnalyticsTabProps {
  dailyAnalytics: DailyAnalyticsDocument | null;
  allDailyAnalytics: DailyAnalyticsDocument[];
  users: UserDocument[];
  selectedDate?: string;
  setSelectedDate?: (date: string) => void;
  theme: ThemeMode;
  dateRange: DateRangeState;
  onDateRangeChange: (newRange: DateRangeState) => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  dailyAnalytics,
  allDailyAnalytics,
  users,
  theme,
  dateRange,
  onDateRangeChange,
}) => {
  const isDark = theme === 'dark';

  // Strict Red, White, Black & Gray palette
  const RED_BLACK_PALETTE = [
    '#dc2626', // Red-600
    isDark ? '#ffffff' : '#09090b', // High-contrast White/Black
    '#991b1b', // Red-800
    isDark ? '#71717a' : '#52525b', // Zinc Gray
    '#ef4444', // Red-500
    isDark ? '#27272a' : '#e4e4e7', // Subtle Gray
  ];

  // Filter users and daily analytics docs based on date range
  const filteredUsers = users.filter((u) => isUserInDateRange(u, dateRange.startDate, dateRange.endDate));
  const matchingDocs = (allDailyAnalytics || []).filter((doc) =>
    isDateInRange(doc.date, dateRange.startDate, dateRange.endDate)
  );

  // Helper to count frequency of items
  const countFrequencies = (items: string[]): Record<string, number> => {
    const res: Record<string, number> = {};
    items.forEach((item) => {
      if (item) res[item] = (res[item] || 0) + 1;
    });
    return res;
  };

  // Aggregate Traffic Sources Data
  const aggregatedSources: Record<string, number> = {};
  if (matchingDocs.length > 0) {
    matchingDocs.forEach((doc) => {
      Object.entries(doc.trafficSources || {}).forEach(([src, count]) => {
        aggregatedSources[src] = (aggregatedSources[src] || 0) + Number(count);
      });
    });
  }
  const trafficSourcesData = Object.keys(aggregatedSources).length
    ? Object.entries(aggregatedSources).map(([name, value]) => ({ name, value }))
    : Object.entries(countFrequencies(filteredUsers.map((u) => u.trafficSource))).map(
        ([name, value]) => ({ name, value })
      );

  // Aggregate Device Types Data
  const aggregatedDevices: Record<string, number> = {};
  if (matchingDocs.length > 0) {
    matchingDocs.forEach((doc) => {
      Object.entries(doc.deviceTypes || {}).forEach(([dev, count]) => {
        aggregatedDevices[dev] = (aggregatedDevices[dev] || 0) + Number(count);
      });
    });
  }
  const deviceTypesData = Object.keys(aggregatedDevices).length
    ? Object.entries(aggregatedDevices).map(([name, value]) => ({ name, value }))
    : Object.entries(countFrequencies(filteredUsers.map((u) => u.deviceType))).map(
        ([name, value]) => ({ name, value })
      );

  // Aggregate Countries Data
  const aggregatedCountries: Record<string, number> = {};
  if (matchingDocs.length > 0) {
    matchingDocs.forEach((doc) => {
      Object.entries(doc.countries || {}).forEach(([c, count]) => {
        aggregatedCountries[c] = (aggregatedCountries[c] || 0) + Number(count);
      });
    });
  }
  const countryEntries: [string, number][] = Object.keys(aggregatedCountries).length
    ? Object.entries(aggregatedCountries).map(([k, v]) => [k, Number(v)])
    : Object.entries(countFrequencies(filteredUsers.map((u) => u.country)));

  const totalCountryHits = countryEntries.reduce((acc, [, val]) => acc + val, 0) || 1;
  const geographicData = countryEntries
    .map(([code, count]) => {
      const info = getCountryInfo(code);
      const percentage = Math.round((count / totalCountryHits) * 100);
      return {
        code,
        name: info.name,
        flag: info.flag,
        count,
        percentage,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Peak Time Hourly Data
  const aggregatedHourly: Record<string, number> = {};
  if (matchingDocs.length > 0) {
    matchingDocs.forEach((doc) => {
      Object.entries(doc.hourlyTraffic || {}).forEach(([h, count]) => {
        aggregatedHourly[h] = (aggregatedHourly[h] || 0) + Number(count);
      });
    });
  }
  const peakTimeData = Array.from({ length: 24 }, (_, h) => {
    const key = h.toString();
    const count = aggregatedHourly[key] || dailyAnalytics?.hourlyTraffic?.[key] || 0;
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
      count,
    };
  });

  // Find Peak Hour
  let peakHour = { hourLabel: '12 PM', count: 0 };
  peakTimeData.forEach((pt) => {
    if (pt.count > peakHour.count) {
      peakHour = pt;
    }
  });

  return (
    <div className="space-y-6">
      {/* DATE RANGE FILTER BAR */}
      <DateRangeFilter value={dateRange} onChange={onDateRangeChange} isDark={isDark} />

      {/* HEADER BAR */}
      <div
        className={`border rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-600" />
            <span>Traffic & Audience Analytics</span>
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Detailed breakdown of referral origins, device distribution, geographic visitors, and peak times.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-red-600/20 text-red-400 border border-red-500/30">
            {matchingDocs.length} Days Aggregated
          </span>
        </div>
      </div>

      {/* TOP ROW: TRAFFIC SOURCES & DEVICE TYPES CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources Chart */}
        <div
          className={`border rounded-2xl p-5 shadow-sm ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-red-600" />
                <span>Traffic Sources</span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Referral origin distribution
              </p>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                isDark
                  ? 'bg-red-950 text-red-400 border-red-900'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {trafficSourcesData.length} Origins
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {trafficSourcesData.length === 0 ? (
              <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                No traffic source data recorded for this date.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={trafficSourcesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {trafficSourcesData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={RED_BLACK_PALETTE[index % RED_BLACK_PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#09090b' : '#ffffff',
                      borderColor: isDark ? '#27272a' : '#e4e4e7',
                      borderRadius: '10px',
                      color: isDark ? '#ffffff' : '#09090b',
                    }}
                    formatter={(value: any) => [`${value} visitors`, 'Count']}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '11px', color: isDark ? '#a1a1aa' : '#52525b' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Device Types Chart */}
        <div
          className={`border rounded-2xl p-5 shadow-sm ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-red-600" />
                <span>Device Types</span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Mobile vs Desktop vs Tablet proportion
              </p>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                isDark
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-800 border-zinc-200'
              }`}
            >
              Hardware Breakdown
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {deviceTypesData.length === 0 ? (
              <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                No device data recorded for this date.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={deviceTypesData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#27272a' : '#f4f4f5'}
                    horizontal={false}
                  />
                  <XAxis type="number" stroke={isDark ? '#71717a' : '#a1a1aa'} fontSize={11} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke={isDark ? '#71717a' : '#a1a1aa'}
                    fontSize={11}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#09090b' : '#ffffff',
                      borderColor: isDark ? '#27272a' : '#e4e4e7',
                      borderRadius: '10px',
                      color: isDark ? '#ffffff' : '#09090b',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {deviceTypesData.map((entry, index) => (
                      <Cell
                        key={`dev-${index}`}
                        fill={RED_BLACK_PALETTE[index % RED_BLACK_PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* PEAK TIME HOURLY BAR GRAPH */}
      <div
        className={`border rounded-2xl p-6 shadow-sm ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-600" />
              <span>Peak Time Hourly Graph</span>
            </h3>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Hourly visitor concentration highlighting peak activity hours
            </p>
          </div>

          <div
            className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              isDark
                ? 'bg-red-950 text-red-400 border-red-900'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-red-600" />
            <span>Peak Hour: {peakHour.count} hits at {peakHour.hourLabel}</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peakTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? '#27272a' : '#f4f4f5'}
                vertical={false}
              />
              <XAxis
                dataKey="hourLabel"
                stroke={isDark ? '#71717a' : '#a1a1aa'}
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke={isDark ? '#71717a' : '#a1a1aa'}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#09090b' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e4e4e7',
                  borderRadius: '10px',
                  color: isDark ? '#ffffff' : '#09090b',
                }}
                formatter={(val: any) => [`${val} visitors`, 'Traffic Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {peakTimeData.map((entry, idx) => (
                  <Cell
                    key={`peak-${idx}`}
                    fill={
                      entry.count === peakHour.count && peakHour.count > 0
                        ? '#dc2626'
                        : isDark
                        ? '#27272a'
                        : '#e4e4e7'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GEOGRAPHIC LOCATION TABLE */}
      <div
        className={`border rounded-2xl p-6 shadow-sm ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Globe className="w-4 h-4 text-red-600" />
              <span>Geographic Location Distribution</span>
            </h3>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Visitor traffic grouped by country ISO codes
            </p>
          </div>
          <span className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {geographicData.length} Countries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-xs font-bold uppercase tracking-wider ${
                  isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-200 text-zinc-500'
                }`}
              >
                <th className="py-3 px-4">Country</th>
                <th className="py-3 px-4">ISO Code</th>
                <th className="py-3 px-4 text-right">Visitor Hits</th>
                <th className="py-3 px-4">Percentage Share</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y text-xs ${
                isDark ? 'divide-zinc-800/60 text-zinc-200' : 'divide-zinc-100 text-zinc-800'
              }`}
            >
              {geographicData.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`py-6 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    No country traffic logged for this period.
                  </td>
                </tr>
              ) : (
                geographicData.map((item) => (
                  <tr
                    key={item.code}
                    className={`transition-colors ${
                      isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <td className="py-3 px-4 flex items-center gap-2.5 font-bold">
                      <CountryFlag code={item.code} size="md" />
                      <span>{item.name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-extrabold text-red-600">
                      {item.code}
                    </td>
                    <td className="py-3 px-4 text-right font-black">
                      {item.count.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-full h-2 rounded-full overflow-hidden max-w-[150px] ${
                            isDark ? 'bg-zinc-800' : 'bg-zinc-200'
                          }`}
                        >
                          <div
                            className="bg-red-600 h-full rounded-full"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className={`font-bold min-w-[32px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {item.percentage}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
