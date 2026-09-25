import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Film, Users, Eye, Clapperboard } from 'lucide-react';
import { subscribeToVideos, subscribeToTotalViews } from '../lib/firebase';
import { subscribeToCreators } from '../lib/creators';

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
  const [creators, setCreators] = useState(0);
  const [videos, setVideos] = useState(0);
  const [ready, setReady] = useState(0);
  const [processing, setProcessing] = useState(0);
  const [views, setViews] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const unsubs = [
      subscribeToCreators(
        (list) => {
          setCreators(list.length);
          setLive(true);
        },
        () => setLive(false)
      ),
      subscribeToVideos((list) => {
        setVideos(list.length);
        setReady(list.filter((v) => v.status === 'ready').length);
        setProcessing(list.filter((v) => v.status === 'processing' || !v.status).length);
        setLive(true);
      }),
      subscribeToTotalViews((total) => setViews(total)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div>
      <h1 className="text-white text-[22px] font-extrabold tracking-tight">Dashboard</h1>
      <p className="text-[#8A8B91] text-[13px] mt-1">
        {live ? 'Live — Firestore real-time' : 'Connecting to Firestore…'}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users size={15} />} label="Creators" value={String(creators)} sub="creators collection" />
        <StatCard icon={<Film size={15} />} label="Videos" value={String(videos)} sub="videos collection" />
        <StatCard
          icon={<Eye size={15} />}
          label="Total views"
          value={views.toLocaleString()}
          sub="sum of videos.views"
        />
        <StatCard
          icon={<Clapperboard size={15} />}
          label="HLS ready"
          value={`${ready}/${videos}`}
          sub={`${processing} pending transcode`}
        />
      </div>
      <div
        className="mt-4 rounded-[14px] p-5 text-[13px] text-[#8A8B91] leading-relaxed"
        style={{ background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        Pipeline: Admin saves <span className="text-[#E1E2E6] font-semibold">direct_url</span> →{' '}
        <span className="text-[#E1E2E6] font-semibold">transcodeVideo</span> function →{' '}
        <span className="text-[#E1E2E6] font-semibold">hls_url + poster_url (status = ready)</span> →
        public site plays HLS. Everything on this page updates live from Firestore.
      </div>
    </div>
  );
}
