import { memo, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, UploadCloud } from 'lucide-react';
import { saveVideoDoc } from '../lib/firebase';
import { subscribeToCreators } from '../lib/creators';
import { extractLinksFromString } from '../lib/videoUtils';
import { suggestFor } from '../lib/captionAI';
import type { CreatorDocument, VideoCategory } from '../types';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };

const CreatorPick = memo(function CreatorPick({
  c,
  selected,
  onToggle,
}: {
  c: CreatorDocument;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(c.id)}
      aria-pressed={selected}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left transition-colors w-full"
      style={
        selected
          ? { background: 'rgba(255,43,85,0.12)', border: '1px solid rgba(255,43,85,0.5)' }
          : { background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }
      }
    >
      {c.avatarUrl ? (
        <img src={c.avatarUrl} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-black shrink-0"
          style={{ background: '#FF2B55' }}
        >
          {c.username.trim().slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-white text-[14px] font-bold truncate">@{c.username}</span>
      <span
        className="ml-auto w-4 h-4 rounded-full shrink-0"
        style={
          selected
            ? { background: '#FF2B55' }
            : { border: '1.5px solid rgba(255,255,255,0.25)' }
        }
      />
    </button>
  );
});

export default function UploadPage() {
  const [creators, setCreators] = useState<CreatorDocument[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<VideoCategory>('girls');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => subscribeToCreators((list) => setCreators(list)), []);

  const links = useMemo(() => extractLinksFromString(raw), [raw]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const perCreator = selected.length > 0 ? Math.ceil(links.length / selected.length) : 0;
  const canSubmit = !busy && selected.length > 0 && links.length > 0;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setDone(0);
    setTotal(links.length);
    setFailed([]);
    setFinished(false);

    // Round-robin: link[i] → selected[i % n], so links spread evenly.
    // AI caption + hashtags rotate per link for SEO variety.
    const jobs = links.map((direct_url, i) => {
      const seo = suggestFor(category, i, 0);
      return {
        direct_url,
        creatorId: selected[i % selected.length],
        category,
        caption: seo.caption,
        hashtags: seo.hashtags,
        is_active: true,
        views: 0,
      };
    });

    let cursor = 0;
    let completed = 0;
    const errs: string[] = [];
    const workers = Array(Math.min(5, jobs.length))
      .fill(0)
      .map(async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          try {
            await saveVideoDoc(job);
          } catch {
            errs.push(job.direct_url);
          }
          completed++;
          setDone(completed);
        }
      });
    await Promise.all(workers);

    setFailed(errs);
    setFinished(true);
    setBusy(false);
    if (errs.length === 0) setRaw('');
  };

  return (
    <div>
      <h1 className="text-white text-[22px] font-extrabold tracking-tight">Upload</h1>
      <p className="text-[#8A8B91] text-[13px] mt-1">
        Pick creators, pick a group, paste links — videos post as URLs, split evenly.
      </p>

      <div className="mt-5 grid gap-4">
        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">
            1 · Creators <span className="text-[#8A8B91] font-semibold">({selected.length} selected)</span>
          </h2>
          {creators.length === 0 ? (
            <p className="text-[#8A8B91] text-[13px]">
              No creators yet — create one on the Creators page first.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {creators.map((c) => (
                <CreatorPick key={c.id} c={c} selected={selected.includes(c.id)} onToggle={toggle} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">2 · Group</h2>
          <div className="flex gap-2">
            {(['girls', 'couples'] as VideoCategory[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setCategory(g)}
                aria-pressed={category === g}
                className="px-5 py-2.5 rounded-[10px] text-[14px] font-bold capitalize transition-colors"
                style={
                  category === g
                    ? { background: '#FF2B55', color: '#fff' }
                    : { background: '#16171D', color: '#A1A2A7', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">
            3 · Links <span className="text-[#8A8B91] font-semibold">(bulk, comma separated)</span>
          </h2>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder="https://cdn.site.com/v1.mp4, https://cdn.site.com/v2.mp4, …"
            className="w-full px-3.5 py-3 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91] font-mono"
            style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#8A8B91]">
            <Link2 size={14} />
            {links.length} link{links.length === 1 ? '' : 's'} detected
            {links.length > 0 && selected.length > 0 && (
              <span>
                → ~{perCreator} per creator ({category})
              </span>
            )}
          </div>

          {(busy || finished) && total > 0 && (
            <div className="mt-3">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#16171D' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round((done / total) * 100)}%`, background: '#FF2B55' }}
                />
              </div>
              <div className="mt-1.5 text-[12px] text-[#8A8B91]">
                {done}/{total} posted{finished && (failed.length === 0 ? ' — all live' : ` — ${failed.length} failed`)}
              </div>
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="mt-4 flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-40"
            style={{ background: '#FF2B55' }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={16} />}
            {busy ? `Posting ${done}/${total}…` : `Post ${links.length} video${links.length === 1 ? '' : 's'}`}
          </button>
          {!busy && links.length > 0 && selected.length === 0 && (
            <p className="mt-2 text-[12px] text-[#FF2B55]">Select at least one creator first.</p>
          )}
        </section>
      </div>
    </div>
  );
}
