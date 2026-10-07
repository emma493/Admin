import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Link2, Clock3, CheckCircle2, Copy } from 'lucide-react';
import { subscribeToOgPreview, saveOgPreview, type OgPreviewData } from '../lib/sitePreview';
import { bakePreview } from '../lib/previewBake';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };
const DURATION_RE = /^\d{1,3}:\d{2}$/;
const SHARE_URL = 'https://shortxx.live/';

export default function PhotoPage() {
  const [photoUrl, setPhotoUrl] = useState('');
  const [duration, setDuration] = useState('2:56');
  const [baked, setBaked] = useState<string | null>(null);
  const [baking, setBaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState<OgPreviewData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => subscribeToOgPreview(
    (doc) => {
      setLive(doc);
      setConnected(true);
    },
    () => setConnected(false)
  ), []);

  const durationValid = DURATION_RE.test(duration.trim());
  const canBake = !baking && photoUrl.trim().length > 0 && durationValid;
  const canSave = !saving && !!baked && durationValid;

  const onBake = async () => {
    if (!canBake) return;
    setBaking(true);
    setError(null);
    setSaved(false);
    try {
      const dataUrl = await bakePreview(photoUrl, duration);
      setBaked(dataUrl);
    } catch (e) {
      setBaked(null);
      setError(
        e instanceof Error && e.message !== 'load-failed'
          ? e.message
          : 'Could not load that photo (host blocked cross-origin access). Try another URL or an image proxy link.'
      );
    } finally {
      setBaking(false);
    }
  };

  const onSave = async () => {
    if (!canSave || !baked) return;
    setSaving(true);
    setError(null);
    try {
      await saveOgPreview({ sourceUrl: photoUrl, imageData: baked, duration });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Try a smaller photo.');
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <h1 className="text-white text-[22px] font-extrabold tracking-tight">Photo</h1>
      <p className="text-[#8A8B91] text-[13px] mt-1">
        Paste a photo URL — it gets baked into a fake video thumbnail (▶ play button + duration pill)
        and becomes the preview when you share <span className="font-mono">shortxx.live</span> on X / WhatsApp / Telegram.
      </p>

      <div className="mt-5 grid gap-4">
        {/* 1 · Source */}
        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">1 · Photo URL + duration</h2>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Photo link</span>
            <div className="relative">
              <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8B91]" />
              <input
                value={photoUrl}
                onChange={(e) => { setPhotoUrl(e.target.value); setSaved(false); }}
                placeholder="https://cdn.site.com/photo.jpg"
                inputMode="url"
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91] font-mono"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </label>
          <label className="grid gap-1.5 mt-3 max-w-[220px]">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Duration pill</span>
            <div className="relative">
              <Clock3 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8B91]" />
              <input
                value={duration}
                onChange={(e) => { setDuration(e.target.value); setSaved(false); }}
                placeholder="2:56"
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91] font-mono"
                style={{ background: '#16171D', border: !durationValid ? '1px solid #FF2B55' : '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            {!durationValid && (
              <span className="text-[12px] font-semibold text-[#FF2B55]">Use m:ss format, e.g. 2:56</span>
            )}
          </label>
          <button
            type="button"
            onClick={onBake}
            disabled={!canBake}
            className="mt-4 flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-40"
            style={{ background: '#FF2B55' }}
          >
            {baking ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={16} />}
            {baking ? 'Baking thumbnail…' : baked ? 'Re-bake thumbnail' : 'Generate thumbnail'}
          </button>
          {error && <p className="mt-2 text-[12px] font-semibold text-[#FF2B55]">{error}</p>}
        </section>

        {/* 2 · Preview + publish */}
        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">2 · Preview + publish</h2>
          {!baked ? (
            <div className="rounded-[10px] p-10 text-center text-[#8A8B91] text-[13px]" style={{ background: '#16171D' }}>
              No thumbnail yet — paste a URL above and hit Generate.
            </div>
          ) : (
            <>
              <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={baked} alt="Baked link preview with play button and duration" className="w-full block aspect-[1200/630] object-cover" />
              </div>
              <p className="mt-2 text-[#8A8B91] text-[12px]">
                This exact image is what X / WhatsApp / Telegram will show. No Storage used — pixels are stored in Firestore.
              </p>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className="mt-3 flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-40"
                style={{ background: '#16a34a' }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Publishing…' : saved ? 'Published — publish again to update' : 'Publish as link preview'}
              </button>
              {saved && (
                <p className="mt-2 text-[12px] font-semibold text-emerald-400">
                  Live. Re-scrape the URL in X Card Validator / @webpagebot to refresh their cache.
                </p>
              )}
            </>
          )}
        </section>

        {/* 3 · Currently live */}
        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">
            3 · Currently live{' '}
            <span className="text-[#8A8B91] font-semibold">({connected ? 'live' : 'connecting…'})</span>
          </h2>
          {!live ? (
            <p className="text-[#8A8B91] text-[13px]">Nothing published yet — homepage shares show the default logo.</p>
          ) : (
            <>
              <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={live.imageData} alt="Currently live link preview" className="w-full block aspect-[1200/630] object-cover" />
              </div>
              <p className="mt-2 text-[#8A8B91] text-[12px] font-mono truncate" title={live.sourceUrl}>
                src: {live.sourceUrl} · pill: {live.duration}
              </p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <code className="px-3 py-2 rounded-[10px] text-white text-[13px] font-mono" style={{ background: '#16171D' }}>
              {SHARE_URL}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-bold text-[#E1E2E6] hover:text-white"
              style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy share link'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
