import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Check,
  CheckCircle,
  CheckCircle2,
  Trash2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  Sliders,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Film,
  Layers,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { VideoDocument, ThemeMode } from '../types';

interface TestTabProps {
  videos: VideoDocument[];
  onDeleteVideo: (id: string) => Promise<void>;
  onToggleApproval: (id: string, currentIsApproved: boolean) => Promise<void>;
  onBatchApprove: (ids: string[]) => Promise<void>;
  theme: ThemeMode;
}

/**
 * Lightweight, viewport-aware Test Player Card.
 * Keeps memory/CPU usage minimal by only streaming when in the viewport.
 */
const TestVideoCard: React.FC<{
  video: VideoDocument;
  onApprove: (id: string, currentStatus: boolean) => void;
  onDelete: (id: string) => void;
  isDark: boolean;
}> = ({ video, onApprove, onDelete, isDark }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isInView, setIsInView] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isApproved = video.is_approved === true || video.approved === true;

  // Viewport Observer - only load & play when on screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.2);
      },
      {
        root: null,
        rootMargin: '100px 0px 100px 0px',
        threshold: [0, 0.2, 0.5],
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Control playback based on intersection
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let isCancelled = false;

    if (isInView) {
      if (!vid.src || vid.src === '' || vid.src === window.location.href) {
        vid.src = video.direct_url;
        vid.load();
      }
      vid.muted = isMuted;
      vid
        .play()
        .then(() => {
          if (!isCancelled) setIsPlaying(true);
        })
        .catch(() => {
          if (!isCancelled) setIsPlaying(false);
        });
    } else {
      vid.pause();
      setIsPlaying(false);
    }

    return () => {
      isCancelled = true;
      if (vid) vid.pause();
    };
  }, [isInView, video.direct_url]);

  const handleToggleApprove = async () => {
    if (isApproving) return;
    setIsApproving(true);
    try {
      await onApprove(video.id, isApproved);
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(video.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const next = !isMuted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between shadow-sm ${
        isApproved
          ? isDark
            ? 'bg-zinc-950 border-emerald-500/40 ring-1 ring-emerald-500/20'
            : 'bg-white border-emerald-400 ring-1 ring-emerald-400/20'
          : isDark
          ? 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
          : 'bg-white border-zinc-200 hover:border-zinc-300'
      }`}
    >
      {/* Top Header Controls: Approve Button (above frame) + Delete Button */}
      <div
        className={`p-2.5 flex items-center justify-between border-b ${
          isDark ? 'bg-zinc-900/60 border-zinc-800/80' : 'bg-zinc-100/70 border-zinc-200'
        }`}
      >
        {/* Approve Button */}
        <button
          onClick={handleToggleApprove}
          disabled={isApproving}
          title={isApproved ? 'Click to unapprove' : 'Click to approve this video'}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${
            isApproved
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              : isDark
              ? 'bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white border border-zinc-700 hover:border-emerald-500'
              : 'bg-zinc-200 hover:bg-emerald-600 text-zinc-700 hover:text-white border border-zinc-300 hover:border-emerald-500'
          }`}
        >
          {isApproving ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : isApproved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-white fill-emerald-400/20" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span>{isApproved ? 'Approved' : 'Approve'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          {/* Mute toggle */}
          <button
            onClick={handleToggleMute}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'
            }`}
            title={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete this video permanently"
            className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-transform active:scale-95 shadow-sm"
          >
            {isDeleting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Video Frame */}
      <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center">
        {isInView ? (
          <video
            ref={videoRef}
            src={video.direct_url}
            muted={isMuted}
            loop
            playsInline
            preload="metadata"
            onPlaying={() => {
              setIsPlaying(true);
              setHasError(false);
            }}
            onError={() => {
              setHasError(true);
              setIsPlaying(false);
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-600 p-4 text-center">
            <Film className="w-6 h-6 mb-1 opacity-30" />
            <span className="text-[10px] font-mono opacity-50">Paused (Off-screen)</span>
          </div>
        )}

        {/* Error Fallback */}
        {hasError && isInView && (
          <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center p-3 text-center text-white z-10">
            <AlertTriangle className="w-5 h-5 text-red-400 mb-1" />
            <span className="text-xs font-bold text-red-200">Failed to play stream</span>
            <button
              onClick={handleDelete}
              className="mt-2 px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-black flex items-center gap-1 shadow-sm"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Now</span>
            </button>
          </div>
        )}

        {/* Live Status indicator overlay */}
        <div className="absolute bottom-2 left-2 pointer-events-none">
          {isInView && isPlaying ? (
            <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-black text-emerald-300 backdrop-blur-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              PLAYING
            </span>
          ) : isInView ? (
            <span className="px-2 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-700 text-[9px] font-bold text-zinc-300 backdrop-blur-sm">
              BUFFERING
            </span>
          ) : null}
        </div>
      </div>

      {/* Footer Details */}
      <div className={`p-2.5 border-t text-[11px] ${isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-zinc-100 text-zinc-500'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-red-500 font-bold truncate max-w-[120px]" title={video.id}>
            ID: {video.id}
          </span>
          <span className="font-mono text-[10px] truncate max-w-[160px]" title={video.direct_url}>
            {video.direct_url}
          </span>
        </div>
      </div>
    </div>
  );
};

export const TestTab: React.FC<TestTabProps> = ({
  videos,
  onDeleteVideo,
  onToggleApproval,
  onBatchApprove,
  theme,
}) => {
  const isDark = theme === 'dark';

  // Batch Quantity state: 10 to 50 (or custom quantity)
  const [quantity, setQuantity] = useState<number>(20);
  const [customQuantity, setCustomQuantity] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Review Filter: 'unapproved' (default) | 'all' | 'approved'
  const [filterMode, setFilterMode] = useState<'unapproved' | 'all' | 'approved'>('unapproved');

  // Batch processing feedback state
  const [isApprovingBatch, setIsApprovingBatch] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Calculate video counts
  const unapprovedVideos = useMemo(() => {
    return videos.filter((v) => v.is_approved !== true && v.approved !== true);
  }, [videos]);

  const approvedVideos = useMemo(() => {
    return videos.filter((v) => v.is_approved === true || v.approved === true);
  }, [videos]);

  // Determine the pool to test from
  const candidatePool = useMemo(() => {
    if (filterMode === 'unapproved') return unapprovedVideos;
    if (filterMode === 'approved') return approvedVideos;
    return videos;
  }, [filterMode, unapprovedVideos, approvedVideos, videos]);

  // Current batch to display (e.g. 10 to 50 items)
  const displayBatch = useMemo(() => {
    return candidatePool.slice(0, quantity);
  }, [candidatePool, quantity]);

  // Handle setting quantity preset
  const handleSetQuantity = (val: number) => {
    setQuantity(val);
    setIsCustomMode(false);
    setCustomQuantity('');
  };

  // Handle custom quantity change
  const handleCustomQuantitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customQuantity, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(Math.min(parsed, 500));
      setIsCustomMode(true);
    }
  };

  // Handle "Approve All Loaded / Current Batch"
  const handleApproveCurrentBatch = async () => {
    const unapprovedInBatch = displayBatch
      .filter((v) => v.is_approved !== true && v.approved !== true)
      .map((v) => v.id);

    if (unapprovedInBatch.length === 0) {
      setStatusMessage('All loaded videos in this batch are already approved!');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    setIsApprovingBatch(true);
    setStatusMessage(`Approving ${unapprovedInBatch.length} videos...`);

    try {
      await onBatchApprove(unapprovedInBatch);
      setStatusMessage(`Successfully approved ${unapprovedInBatch.length} videos!`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setStatusMessage(`Error approving batch: ${err?.message || 'Failed'}`);
    } finally {
      setIsApprovingBatch(false);
    }
  };

  // Handle "Next Test" button: approves current unapproved batch and automatically presents next unapproved videos
  const handleNextTest = async () => {
    const unapprovedInBatch = displayBatch
      .filter((v) => v.is_approved !== true && v.approved !== true)
      .map((v) => v.id);

    setIsApprovingBatch(true);
    setStatusMessage('Loading next test batch of non-approved videos...');

    try {
      if (unapprovedInBatch.length > 0) {
        await onBatchApprove(unapprovedInBatch);
      }
      setStatusMessage(
        unapprovedInBatch.length > 0
          ? `Approved ${unapprovedInBatch.length} videos & loaded next non-approved test batch!`
          : 'Refreshed non-approved test queue.'
      );
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setStatusMessage(`Error during next test: ${err?.message || 'Failed'}`);
    } finally {
      setIsApprovingBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & CONTROL BAR */}
      <div
        className={`p-4 sm:p-6 rounded-2xl border transition-all ${
          isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-red-600/10 border border-red-600/20 text-red-500">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <span>Video Quality Test & Approval</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-600 text-white">
                    Test Mode
                  </span>
                </h2>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'} mt-0.5`}>
                  Fast, lag-free batch review: only visible frames stream to conserve RAM. Approve valid streams or delete unexpected videos immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Pending Review:</span>
              <span className="font-black text-amber-500">{unapprovedVideos.length}</span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Approved:</span>
              <span className="font-black text-emerald-500">{approvedVideos.length}</span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
              }`}
            >
              <span>Total in DB:</span>
              <span className="font-black">{videos.length}</span>
            </div>
          </div>
        </div>

        {/* 2. ACTION CONTROLS & BATCH QUANTITY SELECTOR */}
        <div className="mt-6 pt-4 border-t border-zinc-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Left: Quantity Selectors (10, 20, 30, 50, or custom) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              Batch Size:
            </span>

            {[10, 20, 30, 50].map((qty) => (
              <button
                key={qty}
                onClick={() => handleSetQuantity(qty)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                  quantity === qty && !isCustomMode
                    ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                    : isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'
                }`}
              >
                {qty} videos
              </button>
            ))}

            {/* Custom Quantity input */}
            <form onSubmit={handleCustomQuantitySubmit} className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="500"
                placeholder="Custom #"
                value={customQuantity}
                onChange={(e) => setCustomQuantity(e.target.value)}
                className={`w-20 px-2.5 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-red-500 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500'
                    : 'bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400'
                }`}
              />
              <button
                type="submit"
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  isCustomMode
                    ? 'bg-red-600 text-white border-red-500'
                    : isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                    : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 border-zinc-300'
                }`}
              >
                Set
              </button>
            </form>
          </div>

          {/* Right: Main Action Buttons (Approve Batch & Next Test) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter mode pill */}
            <div className="flex items-center p-0.5 rounded-xl border bg-zinc-950 border-zinc-800 text-xs">
              <button
                onClick={() => setFilterMode('unapproved')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  filterMode === 'unapproved'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Non-Approved ({unapprovedVideos.length})
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  filterMode === 'all'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All ({videos.length})
              </button>
              <button
                onClick={() => setFilterMode('approved')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  filterMode === 'approved'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Approved ({approvedVideos.length})
              </button>
            </div>

            {/* Approve All in Current Batch Button */}
            <button
              onClick={handleApproveCurrentBatch}
              disabled={isApprovingBatch || displayBatch.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
              title="Approve all videos currently shown on this page"
            >
              {isApprovingBatch ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Approve Current Batch</span>
            </button>

            {/* Next Test Button */}
            <button
              onClick={handleNextTest}
              disabled={isApprovingBatch || unapprovedVideos.length === 0}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-red-600/20 transition-all active:scale-95"
              title="Approve current batch and load next non-approved videos"
            >
              <span>Next Test</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Message Notification */}
        {statusMessage && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* 3. TEST VIDEO GRID (Minimalist Frame + Delete Button + Approve Button) */}
      <div>
        {displayBatch.length === 0 ? (
          <div
            className={`py-20 text-center rounded-2xl border ${
              isDark ? 'bg-zinc-950/40 border-zinc-800 text-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-400'
            }`}
          >
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-70" />
            <h3 className="text-base font-black text-zinc-200">
              {filterMode === 'unapproved'
                ? 'All videos have been reviewed and approved!'
                : 'No videos found for this filter.'}
            </h3>
            <p className="text-xs mt-1 text-zinc-400">
              {filterMode === 'unapproved'
                ? 'All stream links in the database are approved. You can switch filter mode or add more links in the Videos tab.'
                : 'Try adjusting your batch size or filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayBatch.map((video) => (
              <TestVideoCard
                key={video.id}
                video={video}
                onApprove={onToggleApproval}
                onDelete={onDeleteVideo}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
