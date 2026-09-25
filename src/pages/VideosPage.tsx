import { memo, useEffect, useMemo, useState } from 'react';
import { Clapperboard, Eye, Heart, Loader2, Search, Trash2 } from 'lucide-react';
import {
  subscribeToVideos,
  deleteVideoDoc,
  toggleVideoStatus,
} from '../lib/firebase';
import { subscribeToCreators } from '../lib/creators';
import type { CreatorDocument, VideoCategory, VideoDocument } from '../types';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };

function creatorName(id: string | undefined, creators: CreatorDocument[]): string {
  if (!id) return 'Unlinked';
  return creators.find((c) => c.id === id)?.username ?? 'Unknown';
}

function hlsLabel(v: VideoDocument): { text: string; color: string } {
  if (v.status === 'ready' && v.hls_url) return { text: 'HLS ready', color: '#34d399' };
  if (v.status === 'failed') return { text: 'Failed', color: '#FF2B55' };
  return { text: 'Processing', color: '#fbbf24' };
}

const VideoRow = memo(function VideoRow({
  v,
  creatorLabel,
  onToggle,
  onDelete,
  busy,
}: {
  v: VideoDocument;
  creatorLabel: string;
  onToggle: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const hls = hlsLabel(v);
  return (
    <div className="rounded-[14px] p-4 grid gap-2.5" style={surface}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[11px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
          style={
            v.category === 'couples'
              ? { background: 'rgba(168,85,247,0.15)', color: '#c4b5fd' }
              : { background: 'rgba(255,43,85,0.12)', color: '#ff8fa3' }
          }
        >
          {v.category ?? 'legacy'}
        </span>
        <span className="text-[#E1E2E6] text-[13px] font-bold">@{creatorLabel}</span>
        <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: hls.color }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: hls.color }} />
          {hls.text}
        </span>
        {!v.is_active && (
          <span className="text-[11px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-white/[0.08] text-[#8A8B91]">
            Hidden
          </span>
        )}
      </div>

      {v.caption && <div className="text-white text-[14px] font-semibold">“{v.caption}”</div>}
      {v.hashtags && v.hashtags.length > 0 && (
        <div className="text-[#8A8B91] text-[12px]">{v.hashtags.join(' ')}</div>
      )}
      <div className="text-[#8A8B91] text-[12px] font-mono truncate" title={v.direct_url}>
        {v.direct_url}
      </div>

      <div className="flex items-center gap-4 text-[#8A8B91] text-[12px]">
        <span className="flex items-center gap-1">
          <Eye size={13} /> {(v.views ?? 0).toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Heart size={13} /> {(v.likes ?? 0).toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(v.id, v.is_active)}
          className="px-3.5 py-1.5 rounded-[8px] text-[12px] font-bold text-[#E1E2E6] hover:text-white hover:bg-white/[0.08] disabled:opacity-50"
          style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {v.is_active ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(v.id)}
          aria-label="Delete video"
          className="p-2 rounded-[8px] text-[#8A8B91] hover:text-[#FF2B55] hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
});

type CategoryFilter = 'all' | VideoCategory;

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [creators, setCreators] = useState<CreatorDocument[]>([]);
  const [connected, setConnected] = useState(false);
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const unsubs = [
      subscribeToVideos(
        (list) => {
          setVideos(list);
          setConnected(true);
        },
        () => setConnected(false)
      ),
      subscribeToCreators((list) => setCreators(list)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (creatorFilter === 'unlinked') {
        if (v.creatorId) return false;
      } else if (creatorFilter !== 'all' && v.creatorId !== creatorFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && v.category !== categoryFilter) return false;
      if (q) {
        const hay = [v.caption ?? '', (v.hashtags ?? []).join(' '), v.direct_url, creatorName(v.creatorId, creators)]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [videos, creators, creatorFilter, categoryFilter, query]);

  const counts = useMemo(() => {
    const perCreator = new Map<string, number>();
    for (const v of videos) {
      const key = v.creatorId ?? 'unlinked';
      perCreator.set(key, (perCreator.get(key) ?? 0) + 1);
    }
    return perCreator;
  }, [videos]);

  const onToggle = async (id: string, current: boolean) => {
    setBusyId(id);
    try {
      await toggleVideoStatus(id, current);
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (id: string) => setConfirmId(id);

  const confirmDelete = async () => {
    if (!confirmId) return;
    setBusyId(confirmId);
    try {
      await deleteVideoDoc(confirmId);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight">Videos</h1>
          <p className="text-[#8A8B91] text-[13px] mt-1">
            {connected
              ? `${filtered.length} of ${videos.length} video${videos.length === 1 ? '' : 's'} · live`
              : 'Connecting…'}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[220px_1fr]">
        {/* Filters */}
        <div className="rounded-[14px] p-4 grid gap-3 content-start" style={surface}>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Creator</span>
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className="px-3 py-2.5 rounded-[10px] text-white text-[13px] font-semibold outline-none"
              style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="all">All creators ({videos.length})</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  @{c.username} ({counts.get(c.id) ?? 0})
                </option>
              ))}
              <option value="unlinked">Unlinked ({counts.get('unlinked') ?? 0})</option>
            </select>
          </label>

          <div className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Group</span>
            <div className="flex gap-2">
              {(['all', 'girls', 'couples'] as CategoryFilter[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setCategoryFilter(g)}
                  aria-pressed={categoryFilter === g}
                  className="px-4 py-2 rounded-[10px] text-[13px] font-bold capitalize"
                  style={
                    categoryFilter === g
                      ? { background: '#FF2B55', color: '#fff' }
                      : { background: '#16171D', color: '#A1A2A7', border: '1px solid rgba(255,255,255,0.1)' }
                  }
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Search</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8B91]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Caption, #tag, url…"
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91]"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </label>
        </div>

        {/* List */}
        <div className="grid gap-3 content-start">
          {filtered.length === 0 && connected ? (
            <div
              className="rounded-[14px] p-10 text-center text-[#8A8B91] text-[14px] flex flex-col items-center gap-2"
              style={surface}
            >
              <Clapperboard size={22} />
              No videos match these filters.
            </div>
          ) : (
            filtered.map((v) => (
              <VideoRow
                key={v.id}
                v={v}
                creatorLabel={creatorName(v.creatorId, creators)}
                onToggle={onToggle}
                onDelete={onDelete}
                busy={busyId === v.id}
              />
            ))
          )}
          {!connected && (
            <div className="flex items-center gap-2 text-[#8A8B91] text-[13px]">
              <Loader2 size={15} className="animate-spin" /> Loading videos…
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmId(null)}
        >
          <div
            className="rounded-[14px] p-5 max-w-sm w-full"
            style={surface}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white text-[16px] font-bold">Delete this video?</h2>
            <p className="text-[#8A8B91] text-[13px] mt-1">
              Removes the Firestore doc. The public feed stops showing it. This can’t be undone.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 rounded-[10px] text-[13px] font-bold text-[#E1E2E6] hover:text-white"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyId === confirmId}
                className="px-4 py-2 rounded-[10px] text-[13px] font-bold text-white disabled:opacity-60 flex items-center gap-1.5"
                style={{ background: '#FF2B55' }}
              >
                {busyId === confirmId && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
