import { memo, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Film, Users, Eye, UserCheck } from 'lucide-react';
import { subscribeToUsers, subscribeToVideos } from '../lib/firebase';
import { subscribeToCreators } from '../lib/creators';
import {
  getDateStrFromTimestamp,
  getFormattedDate,
  getPresetDates,
  isDateInRange,
  normalizeDateRange,
} from '../lib/utils';
import type { CreatorDocument, UserDocument, VideoDocument } from '../types';
import DateRangeFilter, { type DatePreset } from '../components/DateRangeFilter';

// Memoized — re-renders only when its own count changes, not on every snapshot.
const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="rounded-[14px] p-5"
      style={{ background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2.5 text-[#8A8B91]">
        {icon}
        <span className="text-[12px] font-bold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="text-white text-[28px] font-black mt-2 tabular-nums">{value}</div>
      <div className="text-[#8A8B91] text-[12px] mt-0.5 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        {sub}
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState(() => getFormattedDate(0));
  const [customEnd, setCustomEnd] = useState(() => getFormattedDate(0));
  const [creatorList, setCreatorList] = useState<CreatorDocument[]>([]);
  const [videoList, setVideoList] = useState<VideoDocument[]>([]);
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const unsubs = [
      subscribeToCreators(
        (list) => {
          setCreatorList(list);
          setLive(true);
        },
        () => setLive(false)
      ),
      subscribeToVideos((list) => {
        setVideoList(list);
        setLive(true);
      }),
      subscribeToUsers(
        (list) => {
          setUsers(list);
          setLive(true);
        },
        () => setLive(false)
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'custom') return normalizeDateRange(customStart, customEnd);
    return getPresetDates(preset);
  }, [preset, customStart, customEnd]);
  const rangeLabel =
    preset === 'all' || (!startDate && !endDate)
      ? 'All time'
      : startDate === endDate
        ? startDate
        : `${startDate} → ${endDate}`;

  const inRange = (ts: unknown): boolean => {
    if (preset === 'all' || (!startDate && !endDate)) return true;
    return isDateInRange(getDateStrFromTimestamp(ts), startDate || undefined, endDate || undefined);
  };

  const videosInRange = useMemo(() => videoList.filter((v) => inRange(v.created_at)), [videoList, startDate, endDate, preset]);
  const creatorsInRange = useMemo(
    () => creatorList.filter((c) => inRange(c.created_at)),
    [creatorList, startDate, endDate, preset]
  );
  const ready = videosInRange.filter((v) => v.status === 'ready').length;
  const processing = videosInRange.filter((v) => v.status === 'processing' || !v.status).length;
  // Video views (original card): lifetime sum of the views counter across videos.
  const videoViews = videosInRange.reduce((a, v) => a + (v.views || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-[#8A8B91] text-[13px] mt-1">
            {live ? `Live — Firestore real-time · ${rangeLabel}` : 'Connecting to Firestore…'}
          </p>
        </div>
        <DateRangeFilter
          ariaLabel="Dashboard date range"
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
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users size={15} />} label="Creators" value={String(creatorsInRange.length)} sub={rangeLabel} />
        <StatCard
          icon={<Film size={15} />}
          label="Videos"
          value={String(videosInRange.length)}
          sub={`${ready} ready · ${processing} pending`}
        />
        <StatCard icon={<Eye size={15} />} label="Video views" value={videoViews.toLocaleString()} sub={rangeLabel} />
        <StatCard
          icon={<UserCheck size={15} />}
          label="Unique visitors"
          value={users.length.toLocaleString()}
          sub="total users visited"
        />
      </div>
    </div>
  );
}
