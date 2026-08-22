import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Trash2,
  Maximize2,
  AlertTriangle,
  RefreshCw,
  Film,
} from 'lucide-react';
import { VideoDocument } from '../types';

interface LazyVideoPreviewPlayerProps {
  video: VideoDocument;
  onDelete: (id: string) => Promise<void> | void;
  onExpand?: (video: VideoDocument) => void;
  isDark?: boolean;
  aspectRatio?: 'video' | 'vertical' | 'square';
  showControls?: boolean;
}

/**
 * High-performance viewport-aware video preview player.
 * Only loads and streams video when visible in the viewport.
 * Automatically pauses and frees hardware/RAM resources when scrolled out of view.
 */
export const LazyVideoPreviewPlayer: React.FC<LazyVideoPreviewPlayerProps> = ({
  video,
  onDelete,
  onExpand,
  isDark = true,
  aspectRatio = 'video',
  showControls = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isInView, setIsInView] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Determine aspect ratio class
  const aspectClass =
    aspectRatio === 'vertical'
      ? 'aspect-[9/16]'
      : aspectRatio === 'square'
      ? 'aspect-square'
      : 'aspect-video';

  // 1. Intersection Observer to detect viewport visibility and preserve RAM/GPU resources
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        setIsInView(visible);
      },
      {
        root: null, // viewport
        rootMargin: '100px 0px 100px 0px', // slight buffer for smoother scroll experience
        threshold: [0, 0.2, 0.5, 1.0],
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  // 2. Play / Pause & Stream management based on viewport intersection
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let isCancelled = false;

    if (isInView) {
      // In viewport: load & play
      setIsLoading(true);
      setHasError(false);

      // If video src isn't set, assign it now to start streaming
      if (!vid.src || vid.src === '' || vid.src === window.location.href) {
        vid.src = video.direct_url;
        vid.load();
      }

      vid.muted = isMuted;
      vid
        .play()
        .then(() => {
          if (!isCancelled) {
            setIsPlaying(true);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            // Autoplay could be constrained or video failed
            setIsPlaying(false);
            setIsLoading(false);
          }
        });
    } else {
      // Out of viewport: pause and release memory to save RAM & CPU/GPU decoding
      vid.pause();
      setIsPlaying(false);
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
      if (vid) {
        vid.pause();
      }
    };
  }, [isInView, video.direct_url]);

  // Handle Video error
  const handleVideoError = () => {
    setHasError(true);
    setIsLoading(false);
    setIsPlaying(false);
    setErrorMessage('Failed to decode or reach stream');
  };

  // Toggle Mute
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  // Toggle Play / Pause manually
  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  // Instant Delete Handler
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;

    if (window.confirm(`Delete this video immediately?\nID: ${video.id}\nURL: ${video.direct_url}`)) {
      setIsDeleting(true);
      try {
        await onDelete(video.id);
      } catch (err) {
        console.error('Failed to delete video from preview:', err);
        setIsDeleting(false);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-xl border transition-all select-none ${aspectClass} ${
        isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900 border-zinc-300'
      } ${isInView ? 'ring-1 ring-red-500/30' : 'opacity-85'}`}
    >
      {/* Video Element (Only actively loaded when isInView is true) */}
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
            setIsLoading(false);
          }}
          onWaiting={() => setIsLoading(true)}
          onError={handleVideoError}
          className="h-full w-full object-cover"
        />
      ) : (
        /* Dormant / Scrolled-past state to conserve 100% RAM & GPU */
        <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-950/80 p-2 text-center text-zinc-600">
          <Film className="h-5 w-5 mb-1 opacity-40" />
          <span className="text-[10px] font-mono opacity-50">Paused (Off-screen)</span>
        </div>
      )}

      {/* Loading Spinner Overlay */}
      {isInView && isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] pointer-events-none">
          <RefreshCw className="h-5 w-5 animate-spin text-red-500" />
        </div>
      )}

      {/* Broken Stream / Error State */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 p-2 text-center text-white">
          <AlertTriangle className="h-5 w-5 text-red-400 mb-1" />
          <span className="text-[10px] font-bold text-red-200">Stream Error</span>
          <span className="text-[9px] text-red-300/80 line-clamp-1">{errorMessage}</span>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="mt-1.5 px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-[10px] font-black text-white flex items-center gap-1 shadow-sm transition-all"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Top Bar Badges & Quick Action Controls */}
      <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none z-10">
        {/* Status Indicator */}
        <div className="flex items-center gap-1">
          {isInView && isPlaying ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-black text-emerald-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              PLAYING
            </span>
          ) : isInView ? (
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-700 text-[9px] font-bold text-zinc-300 backdrop-blur-sm">
              PAUSED
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-800 text-[9px] font-bold text-zinc-500 backdrop-blur-sm">
              SLEEP
            </span>
          )}
        </div>

        {/* Quick Direct Delete Button (Always accessible or on hover) */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete this unexpected video immediately"
          className="pointer-events-auto p-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white shadow-lg transition-transform active:scale-90 hover:scale-105"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom Control Bar */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="flex items-center gap-1">
            {/* Play / Pause */}
            <button
              onClick={handleTogglePlay}
              className="p-1 rounded hover:bg-white/20 text-white transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>

            {/* Sound Toggle */}
            <button
              onClick={handleToggleMute}
              className="p-1 rounded hover:bg-white/20 text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-zinc-300" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Expand Modal Preview */}
            {onExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand(video);
                }}
                className="p-1 rounded hover:bg-white/20 text-white transition-colors"
                title="Fullscreen Preview"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
