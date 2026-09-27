import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  subscribeToCreators,
  saveCreatorDoc,
  deleteCreatorDoc,
  uploadCreatorAvatar,
} from '../lib/creators';
import { subscribeToVideos } from '../lib/firebase';
import type { CreatorDocument, VideoCategory, VideoDocument } from '../types';
import SUGGESTED_USERNAMES from '../lib/suggested-usernames.json';

const schema = z.object({
  username: z.string().trim().min(2, 'Min 2 characters').max(30, 'Max 30 characters'),
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^https?:\/\/.+/i.test(v), 'Must be http(s) URL'),
});

type FormValues = z.infer<typeof schema>;

function formatDate(ts: CreatorDocument['created_at']): string {
  try {
    if ((ts as any)?.toDate) return (ts as any).toDate().toLocaleDateString();
    const d = ts instanceof Date ? ts : new Date(ts as any);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  } catch {
    return '—';
  }
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '••';
}

// Surfaces the real cause when a save never reaches the server (e.g. the
// creator vanishes on refresh): most often unpublished Firestore/Storage
// rules rather than a validation problem.
function friendlySaveError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  const msg = e instanceof Error ? e.message : 'Save failed';
  if (code === 'permission-denied' || code === 'unauthorized' || /permission|insufficient/i.test(msg)) {
    return 'Saving blocked by Firestore Security Rules — publish the latest firestore.rules (and storage.rules for pictures) in Firebase console, then retry.';
  }
  if (code === 'unavailable' || /network|offline/i.test(msg)) {
    return 'Network error — check connection and retry.';
  }
  return msg;
}

// Category badge derived from the creator's videos (category lives on video
// docs, not creator docs). Only Girls and Couples creators exist, so the
// badge is binary: majority wins, exact ties read as Girls. Creators with no
// categorized videos yet get no badge.
type CreatorBadge = 'Girls' | 'Couples' | null;

function badgeFor(girls: number, couples: number): CreatorBadge {
  if (girls === 0 && couples === 0) return null;
  return girls >= couples ? 'Girls' : 'Couples';
}

const BADGE_STYLE: Record<Exclude<CreatorBadge, null>, { background: string; color: string }> = {
  Girls: { background: 'rgba(255,43,85,0.12)', color: '#ff8fa3' },
  Couples: { background: 'rgba(168,85,247,0.15)', color: '#c4b5fd' },
};

// Memoized card — adding/deleting one creator no longer re-renders every card.
const CreatorCard = memo(function CreatorCard({
  c,
  badge,
  onEdit,
}: {
  c: CreatorDocument;
  badge: CreatorBadge;
  onEdit: (c: CreatorDocument) => void;
}) {
  return (
    <div
      className="rounded-[14px] p-4 flex items-center gap-3.5"
      style={{ background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {c.avatarUrl ? (
        <img
          src={c.avatarUrl}
          alt={c.username}
          loading="lazy"
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-black shrink-0"
          style={{ background: '#FF2B55' }}
        >
          {initials(c.username)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-white text-[15px] font-bold truncate flex items-center gap-2">
          <span className="truncate">@{c.username}</span>
          {badge && (
            <span
              className="text-[11px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full shrink-0"
              style={BADGE_STYLE[badge]}
              title={`${badge} group`}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="text-[#8A8B91] text-[12px]">Joined {formatDate(c.created_at)}</div>
      </div>
      <button
        onClick={() => onEdit(c)}
        aria-label={`Edit ${c.username}`}
        className="p-2 rounded-[8px] text-[#8A8B91] hover:text-white hover:bg-white/[0.08] transition-colors"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => deleteCreatorDoc(c.id)}
        aria-label={`Delete ${c.username}`}
        className="p-2 rounded-[8px] text-[#8A8B91] hover:text-white hover:bg-white/[0.08] transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
});

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorDocument[]>([]);
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [connected, setConnected] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [category, setCategory] = useState<VideoCategory>('girls');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const urlValue = watch('avatarUrl') || '';
  const [suggSeed, setSuggSeed] = useState(0);

  // Scraped handle ideas: short + not already in Firestore (unique).
  // UNVERIFIED — owner must confirm each is an adult woman before creating.
  const takenNames = new Set(creators.map((c) => c.username.toLowerCase()));
  const suggPool = (SUGGESTED_USERNAMES as string[]).filter(
    (n) => !takenNames.has(n.toLowerCase())
  );
  const suggStart = suggPool.length ? (suggSeed * 6) % suggPool.length : 0;
  const suggestions = suggPool.length
    ? Array.from(
        { length: Math.min(6, suggPool.length) },
        (_, i) => suggPool[(suggStart + i) % suggPool.length]
      )
    : [];

  useEffect(() => {
    const unsubs = [
      subscribeToCreators(
        (list) => {
          setCreators(list);
          setConnected(true);
        },
        () => setConnected(false)
      ),
      subscribeToVideos((list) => setVideos(list)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Per-creator category counts from linked videos (videos carry creatorId).
  const badgeByCreator = useMemo(() => {
    const counts = new Map<string, { girls: number; couples: number }>();
    for (const v of videos) {
      if (!v.creatorId) continue;
      if (v.category !== 'girls' && v.category !== 'couples') continue;
      const cur = counts.get(v.creatorId) ?? { girls: 0, couples: 0 };
      if (v.category === 'girls') cur.girls += 1;
      else cur.couples += 1;
      counts.set(v.creatorId, cur);
    }
    const out = new Map<string, CreatorBadge>();
    counts.forEach((c, id) => out.set(id, badgeFor(c.girls, c.couples)));
    return out;
  }, [videos]);

  useEffect(() => {
    if (file) {
      const obj = URL.createObjectURL(file);
      setPreview(obj);
      return () => URL.revokeObjectURL(obj);
    }
    setPreview(urlValue.trim());
  }, [file, urlValue]);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setError('');
    try {
      const id = await saveCreatorDoc({
        id: editingId ?? undefined,
        username: values.username,
        avatarUrl: values.avatarUrl?.trim() || '',
        category,
      });
      if (file) {
        const downloadUrl = await uploadCreatorAvatar(file, id);
        await saveCreatorDoc({ id, username: values.username, avatarUrl: downloadUrl, category });
      }
      reset();
      setFile(null);
      setCategory('girls');
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: CreatorDocument) => {
    setEditingId(c.id);
    setFile(null);
    setError('');
    setCategory(c.category === 'couples' ? 'couples' : 'girls');
    setValue('username', c.username, { shouldValidate: true });
    setValue('avatarUrl', c.avatarUrl ?? '', { shouldValidate: true });
    setPreview(c.avatarUrl ?? '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFile(null);
    setCategory('girls');
    setError('');
    reset();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight">Creators</h1>
          <p className="text-[#8A8B91] text-[13px] mt-1">
            {connected ? `${creators.length} creator${creators.length === 1 ? '' : 's'} · live` : 'Connecting…'}
          </p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : (setEditingId(null), setShowForm(true)))}
          className="flex items-center gap-2 text-white text-[14px] font-bold px-4 py-2.5 rounded-[10px] transition-colors"
          style={{ background: '#FF2B55' }}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Close' : 'New creator'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-5 rounded-[14px] p-5 grid gap-4 md:grid-cols-[120px_1fr]"
          style={{ background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-[120px] h-[120px] rounded-[12px] flex flex-col items-center justify-center gap-2 overflow-hidden text-[#8A8B91] text-[12px] font-semibold"
            style={{ background: '#16171D', border: '1px dashed rgba(255,255,255,0.16)' }}
          >
            {preview ? (
              <img src={preview} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <>
                <ImagePlus size={22} />
                Add picture
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="grid gap-3 content-start">
            <label className="grid gap-1.5">
              <span className="text-[#E1E2E6] text-[13px] font-bold">Username</span>
              <input
                {...register('username')}
                placeholder="e.g. LilyGrace"
                className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {errors.username && <span className="text-[#FF2B55] text-[12px]">{errors.username.message}</span>}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-[#8A8B91] text-[12px] font-semibold">Scraped ideas:</span>
                  {suggestions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setValue('username', n, { shouldValidate: true })}
                      className="px-2.5 py-1 rounded-full text-[12px] font-bold text-[#E1E2E6] hover:text-white hover:bg-white/[0.08] transition-colors"
                      style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      @{n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSuggSeed((s) => s + 1)}
                    className="px-2.5 py-1 rounded-full text-[12px] font-bold text-[#A1A2A7] hover:text-white"
                  >
                    Shuffle
                  </button>
                </div>
              )}
              <p className="text-[#8A8B91] text-[11px]">
                Real scraped nuditok handles — open nuditok.com/@name and confirm girl 18+ before creating.
              </p>
            </label>
            <div className="grid gap-1.5">
              <span className="text-[#E1E2E6] text-[13px] font-bold">Group</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Creator group">
                {(['girls', 'couples'] as VideoCategory[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={category === g}
                    onClick={() => setCategory(g)}
                    className="px-4 py-2 rounded-[10px] text-[13px] font-bold capitalize transition-colors"
                    style={
                      category === g
                        ? g === 'couples'
                          ? { background: 'rgba(168,85,247,0.15)', color: '#c4b5fd', border: '1px solid rgba(168,85,247,0.5)' }
                          : { background: 'rgba(255,43,85,0.12)', color: '#ff8fa3', border: '1px solid rgba(255,43,85,0.5)' }
                        : { background: '#16171D', color: '#8A8B91', border: '1px solid rgba(255,255,255,0.1)' }
                    }
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[#E1E2E6] text-[13px] font-bold">Image URL <span className="text-[#8A8B91] font-semibold">(or upload a picture)</span></span>
              <input
                {...register('avatarUrl')}
                placeholder="https://…"
                className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {errors.avatarUrl && <span className="text-[#FF2B55] text-[12px]">{errors.avatarUrl.message}</span>}
            </label>
            {error && <span className="text-[#FF2B55] text-[13px]">{error}</span>}
            <div>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-60"
                style={{ background: '#FF2B55' }}
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create creator'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {creators.map((c) => (
          <CreatorCard
            key={c.id}
            c={c}
            badge={
              c.category === 'girls'
                ? 'Girls'
                : c.category === 'couples'
                  ? 'Couples'
                  : (badgeByCreator.get(c.id) ?? null)
            }
            onEdit={startEdit}
          />
        ))}
      </div>

      {connected && creators.length === 0 && !showForm && (
        <div
          className="mt-5 rounded-[14px] p-10 text-center text-[#8A8B91] text-[14px]"
          style={{ background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          No creators yet — click <span className="text-white font-bold">New creator</span> to create the first account.
        </div>
      )}
    </div>
  );
}
