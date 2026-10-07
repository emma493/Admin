import { useEffect, useMemo, useState } from 'react';
import { Activity, Download, Eye, Heart, Loader2, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  subscribeToAdminAnalytics,
  subscribeToAllDailyAnalytics,
  subscribeToEventVisitors,
  subscribeToRecentEvents,
  subscribeToReferrerEvents,
  subscribeToUsers,
  subscribeToVideos,
  type ReferrerEvent,
} from '../lib/firebase';
import { subscribeToCreators } from '../lib/creators';
import {
  formatDuration,
  formatTimeAgo,
  getCountryInfo,
  getDateStrFromTimestamp,
  getFormattedDate,
  getPresetDates,
  isUserActiveWithin,
  isUserInDateRange,
  normalizeDateRange,
} from '../lib/utils';
import type {
  AdminAnalyticsDocument,
  CreatorDocument,
  DailyAnalyticsDocument,
  TelemetryEventDocument,
  UserDocument,
  VideoDocument,
} from '../types';
import DateRangeFilter, { type DatePreset } from '../components/DateRangeFilter';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };
const inputStyle = { background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' };

function creatorName(id: string | undefined, creators: CreatorDocument[]): string {
  if (!id) return 'Unlinked';
  return creators.find((c) => c.id === id)?.username ?? 'Unknown';
}

function videoTitle(v: VideoDocument): string {
  if (v.caption) return v.caption.length > 60 ? `${v.caption.slice(0, 60)}…` : v.caption;
  if (v.hashtags && v.hashtags.length > 0) return v.hashtags.slice(0, 3).join(' ');
  return v.id;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden min-w-0">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState(() => getFormattedDate(0));
  const [customEnd, setCustomEnd] = useState(() => getFormattedDate(0));
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [creators, setCreators] = useState<CreatorDocument[]>([]);
  const [days, setDays] = useState<DailyAnalyticsDocument[]>([]);
  const [events, setEvents] = useState<TelemetryEventDocument[]>([]);
  const [eventVisitors, setEventVisitors] = useState<{ userId: string; timestamp: unknown }[]>([]);
  const [refRows, setRefRows] = useState<ReferrerEvent[]>([]);
  const [refMode, setRefMode] = useState<'views' | 'uniques'>('views');
  const [ctyMode, setCtyMode] = useState<'views' | 'uniques'>('views');
  const [appStats, setAppStats] = useState<AdminAnalyticsDocument | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsubs = [
      subscribeToUsers(
        (list) => {
          setUsers(list);
          setConnected(true);
        },
        () => setConnected(false)
      ),
      subscribeToVideos((list) => setVideos(list)),
      subscribeToCreators((list) => setCreators(list)),
      subscribeToAllDailyAnalytics((list) => setDays(list)),
      subscribeToRecentEvents(30, (list) => setEvents(list)),
      subscribeToEventVisitors((list) => setEventVisitors(list)),
      subscribeToReferrerEvents((list) => setRefRows(list)),
      subscribeToAdminAnalytics((stats) => setAppStats(stats)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'custom') return normalizeDateRange(customStart, customEnd);
    return getPresetDates(preset);
  }, [preset, customStart, customEnd]);
  const rangeLabel =
    preset === 'all'
      ? 'All time'
      : preset === 'custom' && !startDate && !endDate
        ? 'Custom range'
        : startDate === endDate
          ? startDate
          : `${startDate} → ${endDate}`;

  const daysInRange = useMemo(
    () =>
      days.filter((d) => {
        if (preset === 'all') return true;
        if (startDate && d.date < startDate) return false;
        if (endDate && d.date > endDate) return false;
        return true;
      }),
    [days, preset, startDate, endDate]
  );

  const usersInRange = useMemo(
    () => (preset === 'all' ? users : users.filter((u) => isUserInDateRange(u, startDate, endDate))),
    [users, preset, startDate, endDate]
  );

  // ---- KPI strip ----
  // Unique visitors = union of user docs + distinct video_view event userIds
  // in range. Events are source of truth (tracking.js always writes them).
  // NOTE: user docs use "guest_<name>", events log raw "<name>" — normalize.
  const normId = (id: string) => (id || '').replace(/^guest_/, '');
  const eventIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const e of eventVisitors) {
      if (preset !== 'all') {
        const d = getDateStrFromTimestamp(e.timestamp);
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
      }
      if (e.userId) set.add(normId(e.userId));
    }
    return set;
  }, [eventVisitors, preset, startDate, endDate]);
  const kpis = useMemo(() => {
    const videoViews = videos.reduce((a, v) => a + (v.views || 0), 0);
    const watchSeconds = usersInRange.reduce((a, u) => a + (u.totalDurationSeconds || 0), 0);
    const online = usersInRange.filter((u) => u.status === 'Online' && isUserActiveWithin(u, 60)).length;
    const pwa = usersInRange.filter((u) => u.appType === 'PWA' || u.isPWA).length;
    const union = new Set<string>(eventIdsInRange);
    for (const u of usersInRange) union.add(normId(u.userId || u.id));
    return { videoViews, visitors: union.size, eventUniques: eventIdsInRange.size, watchSeconds, online, pwa };
  }, [videos, usersInRange, eventIdsInRange]);

  // Shared range-filtered event rows (single source for referrer + country stats).
  const refRowsInRange = useMemo(() => {
    if (preset === 'all') return refRows;
    return refRows.filter((r) => {
      const d = getDateStrFromTimestamp(r.timestamp);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [refRows, preset, startDate, endDate]);

  // ---- Content leaders ----
  const topVideos = useMemo(() => [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8), [videos]);  const maxVideoViews = topVideos[0]?.views || 1;

  const topCreators = useMemo(() => {
    const sums = new Map<string, { views: number; likes: number; count: number }>();
    for (const v of videos) {
      const key = v.creatorId ?? 'unlinked';
      const cur = sums.get(key) ?? { views: 0, likes: 0, count: 0 };
      cur.views += v.views || 0;
      cur.likes += v.likes || 0;
      cur.count += 1;
      sums.set(key, cur);
    }
    return [...sums.entries()]
      .map(([id, s]) => ({ id, label: creatorName(id === 'unlinked' ? undefined : id, creators), ...s }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6);
  }, [videos, creators]);
  const maxCreatorViews = topCreators[0]?.views || 1;

  const categorySplit = useMemo(() => {
    const counts = { girls: 0, couples: 0, legacy: 0 };
    for (const v of videos) {
      if (v.category === 'girls') counts.girls += 1;
      else if (v.category === 'couples') counts.couples += 1;
      else counts.legacy += 1;
    }
    return counts;
  }, [videos]);

  // ---- Audience splits ----
  const accessData = useMemo(() => {
    let pwa = 0;
    let mobile = 0;
    let desktop = 0;
    for (const u of usersInRange) {
      if (u.appType === 'PWA' || u.isPWA) pwa += 1;
      else if (u.deviceType === 'Desktop') desktop += 1;
      else mobile += 1;
    }
    return [
      { name: 'PWA App', value: pwa, color: '#FF2B55' },
      { name: 'Mobile Web', value: mobile, color: '#38bdf8' },
      { name: 'Desktop Web', value: desktop, color: '#a78bfa' },
    ];
  }, [usersInRange]);
  const accessTotal = accessData.reduce((a, d) => a + d.value, 0) || 1;

  const countries = useMemo(() => {
    // Event-based advanced stats (source of truth); fallback to user docs
    // when no video_view events exist yet in range.
    const views = new Map<string, { views: number; users: Set<string>; referrals: Record<string, number>; hosts: Record<string, number>; utms: Record<string, number>; defaulted: number; total: number }>();
    for (const r of refRowsInRange ?? []) {
      const code = (r.country || 'GH').toUpperCase();
      const cur = views.get(code) ?? { views: 0, users: new Set<string>(), referrals: {}, hosts: {}, utms: {}, defaulted: 0, total: 0 };
      cur.views += 1;
      cur.total += 1;
      if (r.userId && r.userId !== 'ANONYMOUS') cur.users.add(normId(r.userId));
      const g = r.referral_group || 'Direct';
      cur.referrals[g] = (cur.referrals[g] ?? 0) + 1;
      if (r.referrer_host && r.referrer_host !== 'Direct') cur.hosts[r.referrer_host] = (cur.hosts[r.referrer_host] ?? 0) + 1;
      if (r.utm_source) cur.utms[r.utm_source] = (cur.utms[r.utm_source] ?? 0) + 1;
      if (r.country_source === 'client-locale') cur.defaulted += 1;
      views.set(code, cur);
    }
    if (views.size === 0) {
      for (const u of usersInRange) {
        const code = (u.country || 'GH').toUpperCase();
        const cur = views.get(code) ?? { views: 0, users: new Set<string>(), referrals: {}, hosts: {}, utms: {}, defaulted: 0, total: 0 };
        cur.views += 1;
        cur.total += 1;
        cur.users.add(normId(u.userId || u.id));
        const ref = u.referralGroup || 'Direct';
        cur.referrals[ref] = (cur.referrals[ref] ?? 0) + 1;
        if (u.countrySource === 'client-locale') cur.defaulted += 1;
        views.set(code, cur);
      }
    }
    return [...views.entries()]
      .map(([code, s]) => ({
        code,
        views: s.views,
        uniques: s.users.size,
        topReferral: Object.entries(s.referrals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Direct',
        topHost: Object.entries(s.hosts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
        topUtm: Object.entries(s.utms).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
        defaultedPct: s.total ? Math.round((s.defaulted / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [refRowsInRange, usersInRange]);
  const maxCountryViews = countries[0]?.views || 1;
  const maxCountryUniques = countries.reduce((m, c) => Math.max(m, c.uniques), 1);
  const maxCountry = ctyMode === 'views' ? maxCountryViews : maxCountryUniques;

  const countryTrend = useMemo(() => {
    const top3 = new Set(countries.slice(0, 3).map((c) => c.code));
    const byDay = new Map<string, Record<string, number>>();
    for (const r of refRowsInRange ?? []) {
      const code = (r.country || 'GH').toUpperCase();
      if (!top3.has(code)) continue;
      const d = getDateStrFromTimestamp(r.timestamp);
      const cur = byDay.get(d) ?? {};
      cur[code] = (cur[code] ?? 0) + 1;
      byDay.set(d, cur);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [refRowsInRange, countries]);
  const maxCtyTrend = countryTrend.reduce((m, [, v]) => Math.max(m, ...Object.values(v)), 1);

  // ---- Advanced referrers (events source of truth, UTM-aware) ----
  const refGroups = useMemo(() => {
    const views = new Map<string, number>();
    const uniques = new Map<string, Set<string>>();
    for (const r of refRowsInRange) {
      const g = r.referral_group || 'Direct';
      views.set(g, (views.get(g) ?? 0) + 1);
      const s = uniques.get(g) ?? new Set<string>();
      if (r.userId && r.userId !== 'ANONYMOUS') s.add(normId(r.userId));
      uniques.set(g, s);
    }
    // Fallback to user docs when no events yet (fresh deploy / adblock).
    if (views.size === 0) {
      for (const u of usersInRange) {
        const g = u.referralGroup || 'Direct';
        views.set(g, (views.get(g) ?? 0) + 1);
        const s = uniques.get(g) ?? new Set<string>();
        s.add(normId(u.userId || u.id));
        uniques.set(g, s);
      }
    }
    const totalViews = [...views.values()].reduce((a, v) => a + v, 0) || 1;
    const totalUniques = new Set([...uniques.values()].flatMap((s) => [...s])).size || 1;
    return [...views.entries()]
      .map(([label, v]) => ({
        label,
        views: v,
        uniques: uniques.get(label)?.size ?? 0,
        pctViews: (v / totalViews) * 100,
        pctUniques: ((uniques.get(label)?.size ?? 0) / totalUniques) * 100,
      }))
      .sort((a, b) => b.views - a.views);
  }, [refRowsInRange, usersInRange]);

  const topDomains = useMemo(() => {
    const map = new Map<string, { views: number; users: Set<string>; utms: Record<string, number>; countries: Record<string, number> }>();
    for (const r of refRowsInRange) {
      const host = (r.referrer_host || 'Direct').toLowerCase() || 'Direct';
      const cur = map.get(host) ?? { views: 0, users: new Set<string>(), utms: {}, countries: {} };
      cur.views += 1;
      if (r.userId && r.userId !== 'ANONYMOUS') cur.users.add(normId(r.userId));
      if (r.utm_source) cur.utms[r.utm_source] = (cur.utms[r.utm_source] ?? 0) + 1;
      if (r.country) cur.countries[r.country] = (cur.countries[r.country] ?? 0) + 1;
      map.set(host, cur);
    }
    return [...map.entries()]
      .map(([host, s]) => ({
        host,
        views: s.views,
        uniques: s.users.size,
        topUtm: Object.entries(s.utms).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
        topCountry: Object.entries(s.countries).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [refRowsInRange]);
  const maxDomainViews = topDomains[0]?.views || 1;

  const topUtms = useMemo(() => {
    const map = new Map<string, { source: string; medium: string; campaign: string; views: number; users: Set<string> }>();
    for (const r of refRowsInRange) {
      if (!r.utm_source && !r.utm_campaign) continue;
      const key = `${r.utm_source || '—'}|${r.utm_medium || '—'}|${r.utm_campaign || '—'}`;
      const cur = map.get(key) ?? { source: r.utm_source || '—', medium: r.utm_medium || '—', campaign: r.utm_campaign || '—', views: 0, users: new Set<string>() };
      cur.views += 1;
      if (r.userId && r.userId !== 'ANONYMOUS') cur.users.add(normId(r.userId));
      map.set(key, cur);
    }
    return [...map.values()]
      .map((v) => ({ ...v, uniques: v.users.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [refRowsInRange]);
  const maxUtmViews = topUtms[0]?.views || 1;

  const refTrend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of refRowsInRange) {
      const d = getDateStrFromTimestamp(r.timestamp);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [refRowsInRange]);
  const maxTrend = refTrend.reduce((m, [, v]) => Math.max(m, v), 1);

  const authSplit = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usersInRange) {
      const a = u.authProvider || 'guest';
      map.set(a, (map.get(a) ?? 0) + 1);
    }
    const total = usersInRange.length || 1;
    return [...map.entries()].map(([label, count]) => ({
      label: label === 'google' ? 'Google' : label === 'email' ? 'Email' : 'Guest',
      count,
      pct: (count / total) * 100,
    }));
  }, [usersInRange]);

  const totalLikes = useMemo(() => videos.reduce((a, v) => a + (v.likes || 0), 0), [videos]);

  const exportCsv = () => {
    const esc = (v: unknown): string => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [`# Shortxx analytics export — ${rangeLabel}`];
    lines.push('day,pageViews,uniqueVisitors');
    for (const d of daysInRange) lines.push([d.date, d.pageViews, (d.uniqueVisitors || []).length].map(esc).join(','));
    lines.push('');
    lines.push('videoId,title,creator,category,views,likes');
    for (const v of topVideos)
      lines.push([v.id, videoTitle(v), creatorName(v.creatorId, creators), v.category ?? 'legacy', v.views || 0, v.likes || 0].map(esc).join(','));
    lines.push('');
    lines.push('country,views,uniques,topReferral,topHost,topUtm,defaultedPct');
    for (const c of countries) lines.push([c.code, c.views, c.uniques, c.topReferral, c.topHost, c.topUtm, `${c.defaultedPct}%`].map(esc).join(','));
    lines.push('');
    lines.push('referrer_group,views,uniques');
    for (const g of refGroups) lines.push([g.label, g.views, g.uniques].map(esc).join(','));
    lines.push('');
    lines.push('domain,views,uniques,topUtm,topCountry');
    for (const d of topDomains) lines.push([d.host, d.views, d.uniques, d.topUtm, d.topCountry].map(esc).join(','));
    lines.push('');
    lines.push('utm_source,utm_medium,utm_campaign,views,uniques');
    for (const u of topUtms) lines.push([u.source, u.medium, u.campaign, u.views, u.uniques].map(esc).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shortxx-analytics-${startDate || 'all'}-${endDate || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight">Analytics</h1>
          <p className="text-[#8A8B91] text-[13px] mt-1">
            {connected ? `Deep insights · ${rangeLabel} · live` : 'Connecting…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter
            ariaLabel="Analytics date range"
            preset={preset}
            onPresetChange={setPreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => {
              const n = normalizeDateRange(s, e);
              setCustomStart(n.startDate);
              setCustomEnd(n.endDate);
            }}
          />
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 text-[13px] font-bold px-4 py-2.5 rounded-[10px] text-[#E1E2E6] hover:text-white"
            style={inputStyle}
            title="Download scoped analytics as CSV"
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <Eye size={15} />, label: 'Video views', value: kpis.videoViews.toLocaleString(), sub: `${rangeLabel}` },
          { icon: <Users size={15} />, label: 'Unique visitors', value: kpis.visitors.toLocaleString(), sub: `${kpis.eventUniques} via events · ${usersInRange.length} user docs` },
          { icon: <Activity size={15} />, label: 'Watch time', value: formatDuration(kpis.watchSeconds), sub: 'lifetime sums · new tracker field' },
          { icon: <Heart size={15} />, label: 'Likes total', value: totalLikes.toLocaleString(), sub: `${kpis.online} online now · ${kpis.pwa} PWA` },
        ].map((k) => (
          <div key={k.label} className="rounded-[14px] p-5" style={surface}>
            <div className="flex items-center gap-2.5 text-[#8A8B91]">
              {k.icon}
              <span className="text-[12px] font-bold uppercase tracking-[0.12em]">{k.label}</span>
            </div>
            <div className="text-white text-[24px] font-black mt-2 tabular-nums truncate" title={k.value}>{k.value}</div>
            <div className="text-[#8A8B91] text-[12px] mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />
              <span className="truncate">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Content leaders */}
      <div className="mt-5 grid gap-3 lg:grid-cols-2 items-start">
        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">Top videos by views</h2>
          {topVideos.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No videos yet.</p>
          ) : (
            topVideos.map((v) => (
              <div key={v.id} className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                  <span className="text-white font-semibold truncate" title={videoTitle(v)}>
                    {videoTitle(v)} <span className="text-[#8A8B91] font-normal">@{creatorName(v.creatorId, creators)}</span>
                  </span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">{(v.views || 0).toLocaleString()} · {(v.likes || 0).toLocaleString()} ♥</span>
                </div>
                <Bar pct={((v.views || 0) / maxVideoViews) * 100} color="#FF2B55" />
              </div>
            ))
          )}
          <div className="text-[#8A8B91] text-[12px] mt-1">
            Categories — Girls {categorySplit.girls} · Couples {categorySplit.couples} · Legacy {categorySplit.legacy}
            {appStats ? ` · Lifetime installs ${appStats.totalAppInstalls}` : ''}
          </div>
        </div>

        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">Top creators by views</h2>
          {topCreators.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No creators yet.</p>
          ) : (
            topCreators.map((c) => (
              <div key={c.id} className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                  <span className="text-white font-semibold truncate">@{c.label}</span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">
                    {c.views.toLocaleString()} views · {c.count} clips
                  </span>
                </div>
                <Bar pct={(c.views / maxCreatorViews) * 100} color="#38bdf8" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audience splits */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3 items-start">
        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">Platform access</h2>
          {accessTotal <= 1 && usersInRange.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No users in range.</p>
          ) : (
            <>
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={accessData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={3} strokeWidth={0}>
                      {accessData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {accessData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-[13px] min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-[#E1E2E6] flex-1 truncate">{d.name}</span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">
                    {d.value} · {((d.value / accessTotal) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              <div className="grid gap-1.5 mt-1">
                {authSplit.map((a) => (
                  <div key={a.label} className="grid gap-1 min-w-0">
                    <div className="flex justify-between text-[12px] text-[#8A8B91]">
                      <span>{a.label}</span>
                      <span className="tabular-nums">{a.count} · {a.pct.toFixed(0)}%</span>
                    </div>
                    <Bar pct={a.pct} color="#a78bfa" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white text-[15px] font-bold">Countries</h2>
            <div className="flex rounded-[8px] overflow-hidden text-[11px] font-bold" style={inputStyle}>
              {(['views', 'uniques'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCtyMode(m)}
                  className={`px-2.5 py-1 capitalize ${ctyMode === m ? 'text-white' : 'text-[#8A8B91]'}`}
                  style={ctyMode === m ? { background: 'rgba(52,211,153,0.15)' } : undefined}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {countries.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No country data in range.</p>
          ) : (
            countries.map((c) => {
              const info = getCountryInfo(c.code);
              const val = ctyMode === 'views' ? c.views : c.uniques;
              return (
                <div key={c.code} className="grid gap-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                    <span className="text-white font-semibold truncate" title={`${info.name} · via ${c.topReferral}${c.topHost !== '—' ? ` (${c.topHost})` : ''}`}>
                      {info.flag} {c.code} <span className="text-[#8A8B91] font-normal">· {c.topReferral}{c.topUtm !== '—' ? ` · ${c.topUtm}` : ''}</span>
                      {c.defaultedPct >= 50 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(251,191,36,0.14)', color: '#fbbf24' }} title={`${c.defaultedPct}% of ${c.code} rows fell back to locale default — treat as low confidence`}>
                          ~default
                        </span>
                      )}
                    </span>
                    <span className="text-[#8A8B91] tabular-nums shrink-0">{c.views} views · {c.uniques} uniq</span>
                  </div>
                  <Bar pct={(val / maxCountry) * 100} color="#34d399" />
                </div>
              );
            })
          )}
          {countryTrend.length > 0 && (
            <div className="grid gap-1.5 mt-1">
              <div className="text-[#8A8B91] text-[12px]">Top-3 countries · 14-day trend</div>
              <div className="flex items-end gap-1 h-[44px]">
                {countryTrend.map(([day, per]) => {
                  const tot = Object.values(per).reduce((a, v) => a + (v as number), 0) || 1;
                  return (
                    <div key={day} className="flex-1 grid gap-1 justify-items-center" title={`${day}: ${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', ')}`}>
                      <div
                        className="w-full rounded-[3px]"
                        style={{ height: `${Math.max(4, (tot / maxCtyTrend) * 36)}px`, background: '#34d399', opacity: 0.85 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white text-[15px] font-bold">Referral sources</h2>
            <div className="flex rounded-[8px] overflow-hidden text-[11px] font-bold" style={inputStyle}>
              {(['views', 'uniques'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setRefMode(m)}
                  className={`px-2.5 py-1 capitalize ${refMode === m ? 'text-white' : 'text-[#8A8B91]'}`}
                  style={refMode === m ? { background: 'rgba(251,191,36,0.15)' } : undefined}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[#8A8B91] text-[12px]">
            {refRowsInRange.length} video views in range · events source of truth
          </p>
          {refGroups.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No referrer data in range.</p>
          ) : (
            refGroups.map((r) => {
              const val = refMode === 'views' ? r.views : r.uniques;
              const pct = refMode === 'views' ? r.pctViews : r.pctUniques;
              return (
                <div key={r.label} className="grid gap-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                    <span className="text-white font-semibold truncate">{r.label}</span>
                    <span className="text-[#8A8B91] tabular-nums shrink-0">
                      {r.views} views · {r.uniques} uniq · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <Bar pct={pct} color="#fbbf24" />
                  <div className="sr-only">{val}</div>
                </div>
              );
            })
          )}
          {refTrend.length > 0 && (
            <div className="grid gap-1.5 mt-1">
              <div className="text-[#8A8B91] text-[12px]">14-day trend (views/day)</div>
              <div className="flex items-end gap-1 h-[44px]">
                {refTrend.map(([day, v]) => (
                  <div key={day} className="flex-1 grid gap-1 justify-items-center" title={`${day}: ${v}`}>
                    <div
                      className="w-full rounded-[3px]"
                      style={{ height: `${Math.max(4, (v / maxTrend) * 36)}px`, background: '#fbbf24', opacity: 0.85 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced referrer detail: domains + UTM */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2 items-start">
        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">Top domains</h2>
          {topDomains.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No domain data in range — share a link with UTM to test.</p>
          ) : (
            topDomains.map((d) => (
              <div key={d.host} className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                  <span className="text-white font-semibold truncate" title={d.host}>
                    {d.host} <span className="text-[#8A8B91] font-normal">· {d.topUtm} · {d.topCountry}</span>
                  </span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">
                    {d.views} views · {d.uniques} uniq
                  </span>
                </div>
                <Bar pct={(d.views / maxDomainViews) * 100} color="#38bdf8" />
              </div>
            ))
          )}
        </div>

        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">UTM campaigns</h2>
          {topUtms.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">
              No UTM tagged visits in range. Try <span className="text-white">?utm_source=tiktok&amp;utm_medium=social&amp;utm_campaign=launch</span>
            </p>
          ) : (
            topUtms.map((u) => (
              <div key={`${u.source}|${u.medium}|${u.campaign}`} className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                  <span className="text-white font-semibold truncate" title={`${u.source} / ${u.medium} / ${u.campaign}`}>
                    {u.source} <span className="text-[#8A8B91] font-normal">· {u.medium} · {u.campaign}</span>
                  </span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">
                    {u.views} views · {u.uniques} uniq
                  </span>
                </div>
                <Bar pct={(u.views / maxUtmViews) * 100} color="#a78bfa" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live activity */}
      <div className="mt-3 rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-white text-[15px] font-bold">Live activity</h2>
          <span className="text-[#8A8B91] text-[12px]">Latest 30 events · live</span>
        </div>
        {events.length === 0 && connected ? (
          <p className="text-[#8A8B91] text-[13px]">No events yet — activity appears here as users watch, comment and install.</p>
        ) : (
          <div className="grid gap-2 content-start">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-[13px] min-w-0 rounded-[10px] px-3 py-2" style={inputStyle}>
                <span
                  className="text-[11px] font-black uppercase tracking-[0.08em] px-2 py-0.5 rounded-full shrink-0"
                  style={
                    e.event_type === 'video_view'
                      ? { background: 'rgba(52,211,153,0.14)', color: '#34d399' }
                      : e.event_type === 'comment'
                        ? { background: 'rgba(56,189,248,0.14)', color: '#7dd3fc' }
                        : { background: 'rgba(255,255,255,0.07)', color: '#A1A2A7' }
                  }
                >
                  {e.event_type}
                </span>
                <span className="text-white font-semibold truncate">{e.userId}</span>
                <span className="text-[#8A8B91] truncate hidden sm:inline">
                  {e.video_id ? `▸ ${e.video_id}` : ''} {e.country ? `· ${e.country}` : ''} {e.device_type ? `· ${e.device_type}` : ''}{e.referral_group ? ` · ${e.referral_group}` : ''}{e.referrer_host && e.referrer_host !== 'Direct' ? ` (${e.referrer_host})` : ''}{e.utm_source ? ` · utm:${e.utm_source}` : ''}
                </span>
                <span className="text-[#8A8B91] ml-auto shrink-0">{formatTimeAgo(e.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
        {!connected && (
          <div className="flex items-center gap-2 text-[#8A8B91] text-[13px]">
            <Loader2 size={15} className="animate-spin" /> Loading analytics…
          </div>
        )}
      </div>

      <p className="text-[#8A8B91] text-[12px] mt-4">
        Ranged by {preset === 'all' || (!startDate && !endDate) ? 'all data' : `date ${getDateStrFromTimestamp(startDate || endDate)} → ${getDateStrFromTimestamp(endDate || startDate)}`} ·
        leaders show all-time totals (per-day video views aren't stored) ·
        countries + referrers aggregate video_view events (user docs fallback when empty) · ~default flags low-confidence locale fallback ·
        watch time sums lifetime per-user counters (legacy docs read 0 until the tracker backfills) · bandwidth/storage excluded (unmetered).
      </p>
    </div>
  );
}
