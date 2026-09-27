import { useEffect, useMemo, useState } from 'react';
import { Activity, Download, Eye, Heart, Loader2, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  subscribeToAdminAnalytics,
  subscribeToAllDailyAnalytics,
  subscribeToRecentEvents,
  subscribeToUsers,
  subscribeToVideos,
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
  // NOTE: daily_analytics docs are never written by public traffic (no public
  // emitter exists), so these KPIs derive from live collections instead:
  // video views = lifetime sum of videos.views, visitors = user docs in range.
  const kpis = useMemo(() => {
    const videoViews = videos.reduce((a, v) => a + (v.views || 0), 0);
    const watchSeconds = usersInRange.reduce((a, u) => a + (u.totalDurationSeconds || 0), 0);
    const online = usersInRange.filter((u) => u.status === 'Online' && isUserActiveWithin(u, 60)).length;
    const pwa = usersInRange.filter((u) => u.appType === 'PWA' || u.isPWA).length;
    return { videoViews, visitors: usersInRange.length, watchSeconds, online, pwa };
  }, [videos, usersInRange]);

  // ---- Content leaders ----
  const topVideos = useMemo(() => [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8), [videos]);
  const maxVideoViews = topVideos[0]?.views || 1;

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
    const map = new Map<string, { count: number; referrals: Record<string, number> }>();
    for (const u of usersInRange) {
      const code = (u.country || 'GH').toUpperCase();
      const cur = map.get(code) ?? { count: 0, referrals: {} };
      cur.count += 1;
      const ref = u.referralGroup || 'Direct';
      cur.referrals[ref] = (cur.referrals[ref] ?? 0) + 1;
      map.set(code, cur);
    }
    return [...map.entries()]
      .map(([code, s]) => ({
        code,
        ...s,
        topReferral: Object.entries(s.referrals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Direct',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [usersInRange]);
  const maxCountry = countries[0]?.count || 1;

  const referrals = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usersInRange) {
      const ref = u.referralGroup || 'Direct';
      map.set(ref, (map.get(ref) ?? 0) + 1);
    }
    const total = usersInRange.length || 1;
    return [...map.entries()]
      .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [usersInRange]);

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
    lines.push('country,sessions,topReferral');
    for (const c of countries) lines.push([c.code, c.count, c.topReferral].map(esc).join(','));
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
          { icon: <Users size={15} />, label: 'Unique visitors', value: kpis.visitors.toLocaleString(), sub: `${usersInRange.length} user docs in range` },
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
          <h2 className="text-white text-[15px] font-bold">Countries</h2>
          {countries.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No users in range.</p>
          ) : (
            countries.map((c) => {
              const info = getCountryInfo(c.code);
              return (
                <div key={c.code} className="grid gap-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                    <span className="text-white font-semibold truncate">
                      {info.flag} {c.code} <span className="text-[#8A8B91] font-normal">· {c.topReferral}</span>
                    </span>
                    <span className="text-[#8A8B91] tabular-nums shrink-0">{c.count}</span>
                  </div>
                  <Bar pct={(c.count / maxCountry) * 100} color="#34d399" />
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-[14px] p-5 grid gap-3 content-start min-w-0" style={surface}>
          <h2 className="text-white text-[15px] font-bold">Referral sources</h2>
          {referrals.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">No users in range.</p>
          ) : (
            referrals.map((r) => (
              <div key={r.label} className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[13px] min-w-0">
                  <span className="text-white font-semibold truncate">{r.label}</span>
                  <span className="text-[#8A8B91] tabular-nums shrink-0">
                    {r.count} · {r.pct.toFixed(0)}%
                  </span>
                </div>
                <Bar pct={r.pct} color="#fbbf24" />
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
                  {e.video_id ? `▸ ${e.video_id}` : ''} {e.country ? `· ${e.country}` : ''} {e.device_type ? `· ${e.device_type}` : ''}
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
        watch time sums lifetime per-user counters (legacy docs read 0 until the tracker backfills) · bandwidth/storage excluded (unmetered).
      </p>
    </div>
  );
}
