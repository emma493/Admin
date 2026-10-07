import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Link2, Clock3, CheckCircle2, Copy, Dices, CloudUpload } from 'lucide-react';
import { subscribeToOgPreview, saveOgPreview, type OgPreviewData } from '../lib/sitePreview';
import { bakePreview, randomDuration } from '../lib/previewBake';
import { uploadBakedImage } from '../lib/cloudinary';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };
const DURATION_RE = /^\d{1,3}:\d{2}$/;
const SHARE_URL = 'https://shortxx.live/';

export default function PhotoPage() {
  const [photoUrl, setPhotoUrl] = useState('');
  const [duration, setDuration] = useState('2:56');
  const [baked, setBaked] = useState<string | null>(null);
  const [bakedDuration, setBakedDuration] = useState<string | null>(null);
  const [baking, setBaking] = useState(false);
  const [publishPhase, setPublishPhase] = useState<null | 'uploading' | 'saving'>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
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
  const canBake = !baking && !publishPhase && photoUrl.trim().length > 0;
  const canSave = !publishPhase && !!baked && durationValid;
  const durationEdited = baked !== null && bakedDuration !== null && duration.trim() !== bakedDuration;

  const doBake = async (pill: string) => {
    setBaking(true);
    setError(null);
    setSaved(false);
    try {
      const dataUrl = await bakePreview(photoUrl, pill);
      setBaked(dataUrl);
      setBakedDuration(pill.trim());
    } catch (e) {
      setBaked(null);
      setBakedDuration(null);
      setError(
        e instanceof Error && e.message !== 'load-failed'
          ? e.message
          : 'Could not load that photo (host blocked cross-origin access). Try another URL or an image proxy link.'
      );
    } finally {
      setBaking(false);
    }
  };

  // First Generate (or fresh photo): roll a new random pill, then bake it.
  const onGenerate = async () => {
    if (!canBake) return;
    const pill = randomDuration();
    setDuration(pill);
    await doBake(pill);
  };

  // Re-bake: apply whatever is currently in the duration field
  // (your manual edit, or a dice-rolled value).
  const onRebake = async () => {
    if (!canBake || !durationValid) return;
    await doBake(duration);
  };

  const onDice = () => {
    setDuration(randomDuration());
    setSaved(false);
  };

  const onSave = async () => {
    if (!canSave || !baked) return;
    setPublishPhase('uploading');
    setError(null);
    try {
      const { secureUrl, publicId } = await uploadBakedImage(baked);
      setPublishPhase('saving');
      await saveOgPreview({ sourceUrl: photoUrl, imageUrl: secureUrl, publicId, duration: bakedDuration ?? duration });
      setPublishedUrl(secureUrl);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed. Try again.');
    } finally {
      setPublishPhase(null);
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
        Paste a photo URL — it gets baked into a fake video thumbnail (▶ play button + random duration pill),
        uploaded to Cloudinary, and becomes the preview when you share <span className="font-mono">shortxx.live</span> on X / WhatsApp / Telegram.
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
          <div className="grid gap-1.5 mt-3 max-w-[280px]">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Duration pill (auto-random)</span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Clock3 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8B91]" />
                <input
                  value={duration}
                  onChange={(e) => { setDuration(e.target.value); setSaved(false); }}
                  placeholder="2:56"
                  className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91] font-mono"
                  style={{ background: '#16171D', border: !durationValid ? '1px solid #FF2B55' : '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <button
                type="button"
                onClick={onDice}
                title="Roll a new random duration"
                aria-label="Roll a new random duration"
                className="px-3 rounded-[10px] text-[#E1E2E6] hover:text-white shrink-0"
                style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Dices size={16} />
              </button>
            </div>
            {!durationValid ? (
              <span className="text-[12px] font-semibold text-[#FF2B55]">Use m:ss format, e.g. 2:56</span>
            ) : durationEdited ? (
              <span className="text-[12px] font-semibold text-[#fbbf24]">Edited — hit Re-bake to apply it.</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={baked ? onRebake : onGenerate}
            disabled={!canBake || (baked !== null && !durationValid)}
            className="mt-4 flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-40"
            style={{ background: '#FF2B55' }}
          >
            {baking ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={16} />}
            {baking ? 'Baking thumbnail…' : baked ? 'Re-bake thumbnail' : 'Generate thumbnail (random pill)'}
          </button>
          {error && <p className="mt-2 text-[12px] font-semibold text-[#FF2B55]">{error}</p>}
        </section>

        {/* 2 · Preview + publish */}
        <section className="rounded-[14px] p-5" style={surface}>
          <h2 className="text-white text-[14px] font-bold mb-3">2 · Preview + publish to Cloudinary</h2>
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
                This exact image uploads to Cloudinary and becomes what X / WhatsApp / Telegram show. Nothing stored in Firestore except the URL.
              </p>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className="mt-3 flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-40"
                style={{ background: '#16a34a' }}
              >
                {publishPhase ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <CloudUpload size={16} />}
                {publishPhase === 'uploading'
                  ? 'Uploading to Cloudinary…'
                  : publishPhase === 'saving'
                    ? 'Saving…'
                    : saved
                      ? 'Published — publish again to update'
                      : 'Publish as link preview'}
              </button>
              {saved && (
                <div className="mt-2">
                  <p className="text-[12px] font-semibold text-emerald-400">
                    Live. Re-scrape the URL in X Card Validator / @webpagebot to refresh their cache.
                  </p>
                  {publishedUrl && (
                    <p className="mt-1 text-[#8A8B91] text-[11px] font-mono truncate" title={publishedUrl}>
                      {publishedUrl}
                    </p>
                  )}
                </div>
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
                <img src={live.imageUrl} alt="Currently live link preview" className="w-full block aspect-[1200/630] object-cover" />
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
