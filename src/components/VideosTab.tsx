import React, { useState, useMemo } from 'react';
import {
  Video,
  Play,
  Pause,
  Plus,
  Trash2,
  Search,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  Film,
  Sparkles,
  Activity,
  ShieldAlert,
  RefreshCw,
  CopyX,
  Layers,
  ExternalLink,
  AlertTriangle,
  Radio,
  Code2,
  Terminal,
  Zap,
  TrendingUp,
  Globe,
  ShieldCheck,
  ArrowRight,
  EyeOff,
  LayoutGrid,
  List,
} from 'lucide-react';
import { VideoDocument, TelemetryEventDocument, ThemeMode } from '../types';
import { extractLinksFromString, verifyVideoLink, verifyVideoLinksInSessions } from '../lib/videoUtils';
import { incrementVideoViews, logTelemetryEvent, fetchNextVideoAndTrackView, saveVideoDocsBatch } from '../lib/firebase';
import { LazyVideoPreviewPlayer } from './LazyVideoPreviewPlayer';

interface DuplicateGroup {
  url: string;
  items: VideoDocument[];
  keepId: string;
}

interface VideosTabProps {
  videos: VideoDocument[];
  events?: TelemetryEventDocument[];
  realtimeTotalViews?: number;
  realtimeViews24h?: number;
  onSaveVideo: (data: Omit<VideoDocument, 'id'> & { id?: string }) => Promise<void>;
  onDeleteVideo: (id: string) => Promise<void>;
  onToggleVideoStatus: (id: string, currentIsActive: boolean) => Promise<void>;
  theme: ThemeMode;
}

export const VideosTab: React.FC<VideosTabProps> = ({
  videos,
  events,
  realtimeTotalViews,
  realtimeViews24h,
  onSaveVideo,
  onDeleteVideo,
  onToggleVideoStatus,
  theme,
}) => {
  const isDark = theme === 'dark';

  // Add / Edit Video Form State
  const [directUrl, setDirectUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [verifyBeforeAdd, setVerifyBeforeAdd] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');

  // Table Row Selection for Bulk Operations (Copy, Delete, Toggle)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // Video Health Checking State
  const [healthMap, setHealthMap] = useState<Record<string, 'healthy' | 'broken' | 'checking'>>({});
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Video Test Play Modal State
  const [previewVideo, setPreviewVideo] = useState<VideoDocument | null>(null);

  // Duplicate Scanner State
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState<boolean>(false);

  // Clipboard Copied indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live Auto-Play Stream Preview Mode (persisted in localStorage)
  const [isPreviewEnabled, setIsPreviewEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_stream_preview_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [previewLayout, setPreviewLayout] = useState<'table' | 'grid'>('table');

  const handleTogglePreviewMode = () => {
    setIsPreviewEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_stream_preview_mode', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Universal link extraction (handles double quotes "vid2.mp4", single quotes, commas, brackets, etc.)
  const parsedDirectUrls = extractLinksFromString(directUrl);

  // Real-time calculation of duplicate links in the current video list
  const liveDuplicatesSummary = useMemo(() => {
    const urlMap = new Map<string, number>();
    for (const v of videos) {
      const u = (v.direct_url || '').trim();
      if (u) {
        urlMap.set(u, (urlMap.get(u) || 0) + 1);
      }
    }
    let duplicateUrlCount = 0;
    let redundantRecordsCount = 0;
    urlMap.forEach((count) => {
      if (count > 1) {
        duplicateUrlCount++;
        redundantRecordsCount += count - 1;
      }
    });
    return { duplicateUrlCount, redundantRecordsCount };
  }, [videos]);

  // View count calculation helper for each video (reads from Firestore views field)
  const getVideoViewCount = (video: VideoDocument): number => {
    const directViews = typeof video.views === 'number' ? video.views : 0;
    return directViews;
  };

  // Summary Metrics
  const totalVideos = videos.length;
  const activeVideos = videos.filter((v) => v.is_active).length;
  // All-time total, summed straight from the `views` counter on each video document in Firestore
  const calculatedTotalViews = videos.reduce((acc, v) => acc + getVideoViewCount(v), 0);
  const totalViews = typeof realtimeTotalViews === 'number' ? realtimeTotalViews : calculatedTotalViews;

  // Rolling 24h count, querying 'events' for 'video_view' entries generated within the last 24h
  const fallbackViews24h = useMemo(() => {
    if (!events || events.length === 0) return 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.reduce((count, ev) => {
      if (ev.event_type !== 'video_view') return count;
      let millis: number | null = null;
      const ts: any = ev.timestamp;
      if (ts) {
        millis = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
      } else if ((ev as any).createdAt || (ev as any).created_at) {
        const raw = (ev as any).createdAt || (ev as any).created_at;
        millis = raw?.toMillis ? raw.toMillis() : new Date(raw).getTime();
      } else {
        millis = Date.now();
      }
      return millis !== null && !isNaN(millis) && millis >= cutoff ? count + 1 : count;
    }, 0);
  }, [events]);

  const viewsLast24h = typeof realtimeViews24h === 'number' ? realtimeViews24h : fallbackViews24h;
  const brokenCount = Object.values(healthMap).filter((status) => status === 'broken').length;

  // Handle Test Play video for admin preview (strictly does NOT increment views)
  const handleTestPlayVideo = (video: VideoDocument) => {
    setPreviewVideo(video);
  };

  // Filtered Videos
  const filteredVideos = videos.filter((video) => {
    // Search by URL or ID
    const matchesSearch =
      searchQuery.trim() === '' ||
      video.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.direct_url.toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by status
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && video.is_active) ||
      (statusFilter === 'Inactive' && !video.is_active);

    return matchesSearch && matchesStatus;
  });

  // Health Inspection & Auto-Purging function
  const runHealthCheckAndPurge = async (autoPurge: boolean = true) => {
    if (videos.length === 0 || isCheckingHealth) return;

    setIsCheckingHealth(true);
    setFeedback(null);
    let purgedCount = 0;
    let checkedCount = 0;

    const newMap: Record<string, 'healthy' | 'broken' | 'checking'> = { ...healthMap };

    for (const video of videos) {
      newMap[video.id] = 'checking';
      setHealthMap({ ...newMap });

      const check = await verifyVideoLink(video.direct_url, 4000);
      checkedCount++;

      if (check.status === 'broken') {
        newMap[video.id] = 'broken';
        setHealthMap({ ...newMap });

        if (autoPurge) {
          try {
            await onDeleteVideo(video.id);
            purgedCount++;
          } catch (err) {
            console.error('Failed to auto-purge broken video:', video.id, err);
          }
        }
      } else {
        newMap[video.id] = 'healthy';
        setHealthMap({ ...newMap });
      }
    }

    setIsCheckingHealth(false);

    if (purgedCount > 0) {
      setFeedback({
        type: 'success',
        message: `Health Monitor: Checked ${checkedCount} streams. Automatically purged ${purgedCount} broken link${purgedCount > 1 ? 's' : ''}!`,
      });
    } else if (checkedCount > 0) {
      setFeedback({
        type: 'success',
        message: `Health Monitor: Checked ${checkedCount} video streams. All links are healthy & operational!`,
      });
    }
  };

  // Toggle selection for single item
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select / Deselect all filtered
  const handleSelectAll = () => {
    if (selectedIds.length === filteredVideos.length && filteredVideos.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredVideos.map((v) => v.id));
    }
  };

  // Copy Comma Separated Links
  const handleCopyCommaSeparated = (type: 'direct' | 'all-direct') => {
    let targets: VideoDocument[] = [];

    if (type === 'all-direct') {
      targets = filteredVideos;
    } else {
      targets = filteredVideos.filter((v) => selectedIds.includes(v.id));
    }

    if (targets.length === 0) {
      setFeedback({ type: 'error', message: 'No videos selected to copy.' });
      return;
    }

    const links = targets
      .map((v) => v.direct_url)
      .filter((l) => l && l.length > 0)
      .join(', ');

    if (!links) {
      setFeedback({ type: 'error', message: 'No valid links found in selection.' });
      return;
    }

    navigator.clipboard.writeText(links);
    setCopiedId(`batch-${type}`);
    setFeedback({
      type: 'success',
      message: `Copied ${targets.length} comma-separated direct stream link${targets.length > 1 ? 's' : ''} to clipboard!`,
    });
    setTimeout(() => setCopiedId(null), 3000);
  };

  // Delete all selected video documents permanently
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete ${selectedIds.length} selected video${selectedIds.length > 1 ? 's' : ''} from Firestore?`
    );

    if (!confirmDelete) return;

    setIsDeletingBatch(true);
    setFeedback(null);

    try {
      const idsToDelete = [...selectedIds];
      await Promise.all(idsToDelete.map((id) => onDeleteVideo(id)));

      setSelectedIds([]);
      setFeedback({
        type: 'success',
        message: `Successfully deleted ${idsToDelete.length} video document${idsToDelete.length > 1 ? 's' : ''} from Firestore.`,
      });
    } catch (err) {
      console.error('Error deleting batch videos:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to delete selected videos. Please try again.',
      });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Scan and detect duplicate direct stream URLs across all video documents
  const handleScanDuplicates = () => {
    if (videos.length === 0) {
      setFeedback({
        type: 'error',
        message: 'No videos found to scan for duplicates.',
      });
      return;
    }

    // Group videos by trimmed, normalized direct_url
    const urlMap = new Map<string, VideoDocument[]>();
    for (const v of videos) {
      const normUrl = (v.direct_url || '').trim();
      if (!normUrl) continue;
      if (!urlMap.has(normUrl)) {
        urlMap.set(normUrl, []);
      }
      urlMap.get(normUrl)!.push(v);
    }

    const dupes: DuplicateGroup[] = [];
    urlMap.forEach((items, url) => {
      if (items.length > 1) {
        // Sort items: preserve the one with the highest views or earliest created_at as primary
        const sorted = [...items].sort((a, b) => {
          const viewsA = typeof a.views === 'number' ? a.views : 0;
          const viewsB = typeof b.views === 'number' ? b.views : 0;
          if (viewsB !== viewsA) return viewsB - viewsA;
          const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.created_at || 0).getTime();
          const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        dupes.push({
          url,
          items: sorted,
          keepId: sorted[0].id, // Default keep candidate
        });
      }
    });

    if (dupes.length === 0) {
      setFeedback({
        type: 'success',
        message: `Scan Complete: No duplicate links found! All ${videos.length} video streams are unique.`,
      });
      return;
    }

    setDuplicateGroups(dupes);
    setShowDuplicateModal(true);
  };

  // Switch which document in a duplicate group should be preserved
  const handleSetKeepId = (url: string, newKeepId: string) => {
    setDuplicateGroups((prev) =>
      prev.map((g) => (g.url === url ? { ...g, keepId: newKeepId } : g))
    );
  };

  // Confirm and execute removal of all redundant duplicate records
  const handleConfirmDeleteDuplicates = async () => {
    const idsToDelete: string[] = [];
    for (const group of duplicateGroups) {
      for (const item of group.items) {
        if (item.id !== group.keepId) {
          idsToDelete.push(item.id);
        }
      }
    }

    if (idsToDelete.length === 0) {
      setShowDuplicateModal(false);
      return;
    }

    setIsDeletingDuplicates(true);
    try {
      await Promise.all(idsToDelete.map((id) => onDeleteVideo(id)));
      setShowDuplicateModal(false);
      setDuplicateGroups([]);
      setFeedback({
        type: 'success',
        message: `Successfully removed ${idsToDelete.length} duplicate video link${idsToDelete.length > 1 ? 's' : ''}! Each link now appears exactly once.`,
      });
    } catch (err) {
      console.error('Failed to delete duplicate links:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to remove some duplicate links. Please check connection and try again.',
      });
    } finally {
      setIsDeletingDuplicates(false);
    }
  };

  // Handle Add Video Form Submit (Direct stream URLs)
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();

    const directList = parsedDirectUrls;

    if (directList.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Please enter at least one direct stream URL (.mp4, .m3u8, .webm, etc.) to add.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setStatusMessage('');

    try {
      let validUrls: string[] = directList;
      let brokenUrls: string[] = [];

      if (verifyBeforeAdd) {
        if (directList.length === 1) {
          setStatusMessage(`Testing stream playability: ${directList[0]}`);
          const health = await verifyVideoLink(directList[0], 4000);
          if (health.status === 'broken') {
            brokenUrls.push(directList[0]);
            validUrls = [];
          }
        } else {
          // Multi-session concurrent verification
          const verifyRes = await verifyVideoLinksInSessions(directList, {
            onProgress: (checked, total, sessionCount) => {
              setStatusMessage(
                `Verifying ${total} stream links across ${sessionCount} parallel sessions... (${checked}/${total})`
              );
            },
          });
          validUrls = verifyRes.healthy;
          brokenUrls = verifyRes.broken;
        }
      }

      if (validUrls.length === 0) {
        setFeedback({
          type: 'error',
          message:
            brokenUrls.length > 0
              ? `All ${brokenUrls.length} links failed playability check. Please check the URLs and try again.`
              : 'No valid video links found to add.',
        });
        return;
      }

      // Save valid streams in parallel sessions via fast batch commits
      const docsToSave = validUrls.map((url) => ({
        direct_url: url,
        source_webpage: url,
        page_url: url,
        is_active: true,
        views: 0,
        created_at: new Date(),
      }));

      if (docsToSave.length === 1) {
        setStatusMessage('Saving video stream to Firestore...');
        await onSaveVideo(docsToSave[0]);
      } else {
        setStatusMessage(
          `Saving ${docsToSave.length} video streams across parallel worker sessions in Firestore...`
        );
        await saveVideoDocsBatch(docsToSave, {
          onProgress: (saved, total, sessionCount) => {
            setStatusMessage(
              `Saving ${total} video streams across ${sessionCount} parallel sessions... (${saved}/${total})`
            );
          },
        });
      }

      setFeedback({
        type: 'success',
        message:
          brokenUrls.length > 0
            ? `Successfully stored ${validUrls.length} video stream${validUrls.length > 1 ? 's' : ''}! (${brokenUrls.length} broken link${brokenUrls.length > 1 ? 's' : ''} filtered out)`
            : `Successfully stored and verified ${validUrls.length} video stream${validUrls.length > 1 ? 's' : ''} to Firestore!`,
      });
      setDirectUrl('');
    } catch (err: any) {
      console.error('Error adding video:', err);
      setFeedback({
        type: 'error',
        message: `Failed to process links: ${err?.message || 'Please check input format.'}`,
      });
    } finally {
      setIsSubmitting(false);
      setStatusMessage('');
    }
  };

  // Copy URL to Clipboard helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* 1. HEADER / SUMMARY BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Metric 1: Total Videos */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Total Videos
            </span>
            <div className="p-2.5 rounded-xl bg-red-600/10 text-red-500 border border-red-600/20">
              <Film className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight font-mono">{totalVideos}</span>
            <span className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>documents</span>
          </div>
        </div>

        {/* Metric 2: Active Streams */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Active Streams
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-600/10 text-emerald-500 border border-emerald-600/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight font-mono text-emerald-500">{activeVideos}</span>
            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${isDark ? 'bg-emerald-950/80 text-emerald-400 border-emerald-900' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {totalVideos > 0 ? `${Math.round((activeVideos / totalVideos) * 100)}% active` : '0%'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ADD VIDEO FORM CARD */}
      <div
        className={`border rounded-2xl p-5 sm:p-6 shadow-sm transition-all ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="pb-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-600/10 text-red-500 border border-red-600/20">
              <Video className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">Add New Video Stream</h2>
          </div>
          <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Register direct video stream links (.mp4, .m3u8, .webm, CDN) in Firestore.
          </p>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                : 'bg-red-950/60 text-red-400 border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleAddVideo} className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`block text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Direct Stream Link(s)
              </label>
              {parsedDirectUrls.length > 0 && (
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 border border-red-600/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-red-400" />
                  {parsedDirectUrls.length} direct link{parsedDirectUrls.length > 1 ? 's' : ''} detected
                </span>
              )}
            </div>
            <div className="relative">
              <textarea
                rows={3}
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="Paste direct stream URL(s)&#10;e.g., https://cdn.example.com/video1.mp4, https://stream.example.com/master.m3u8"
                className={`w-full p-3.5 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-red-600 ${
                  isDark
                    ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                    : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
                }`}
              />
            </div>
            <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Tip: You can paste a single URL or multiple stream links separated by commas (<code>,</code>) or line breaks.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyBeforeAdd}
                  onChange={(e) => setVerifyBeforeAdd(e.target.checked)}
                  className="rounded border-zinc-700 text-red-600 focus:ring-red-600 bg-zinc-950"
                />
                <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>
                  Verify stream playability before adding
                </span>
              </label>

              <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {parsedDirectUrls.length > 0
                  ? `(${parsedDirectUrls.length} link entry${parsedDirectUrls.length > 1 ? 's' : ''} ready)`
                  : ''}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || parsedDirectUrls.length === 0}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? 'Verifying & Saving Stream...'
                  : parsedDirectUrls.length > 1
                  ? `Add ${parsedDirectUrls.length} Direct Streams`
                  : '+ Add Video'}
              </span>
            </button>
          </div>

          {statusMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs font-mono text-red-300 flex items-center gap-2 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </form>
      </div>

      {/* HEALTH MONITOR & AUTO-PURGE PANEL */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/10 text-emerald-500 border border-emerald-600/20">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <span>Automated Link Health Monitor</span>
                {brokenCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold">
                    {brokenCount} Broken Detected
                  </span>
                )}
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Scans existing stream links for 404s/network errors and automatically purges broken streams from Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => runHealthCheckAndPurge(true)}
              disabled={isCheckingHealth || videos.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
              <span>{isCheckingHealth ? 'Scanning & Purging...' : 'Scan & Auto-Purge Broken Links'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. VIDEOS DATA TABLE */}
      <div
        className={`border rounded-2xl shadow-sm overflow-hidden ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Table Controls & Batch Export Bar */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Film className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-black">Registered Videos Directory</h2>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold border ${
                isDark ? 'bg-red-950 text-red-400 border-red-900' : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {filteredVideos.length} Items
            </span>

            {/* Quick Button: Copy All Filtered Direct Links as Comma-Separated */}
            {filteredVideos.length > 0 && (
              <button
                onClick={() => handleCopyCommaSeparated('all-direct')}
                className="ml-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-extrabold flex items-center gap-1.5 border border-zinc-700 transition-all active:scale-95"
                title="Copy all visible direct stream links comma-separated"
              >
                {copiedId === 'batch-all-direct' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-red-400" />
                )}
                <span>
                  {copiedId === 'batch-all-direct'
                    ? 'Copied All Comma-Separated!'
                    : 'Copy All Direct Links (Comma Separated)'}
                </span>
              </button>
            )}

            {/* Quick Button: Scan & Remove Duplicate Links */}
            {videos.length > 0 && (
              <button
                onClick={handleScanDuplicates}
                className={`ml-2 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all active:scale-95 shadow-sm ${
                  liveDuplicatesSummary.duplicateUrlCount > 0
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                    : isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                }`}
                title="Scan for duplicate direct stream links, review occurrences, and confirm deletion so each link appears only once"
              >
                <CopyX className="w-3.5 h-3.5 text-amber-400" />
                <span>Scan & Remove Duplicates</span>
                {liveDuplicatesSummary.duplicateUrlCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black leading-none ml-0.5">
                    {liveDuplicatesSummary.redundantRecordsCount}
                  </span>
                )}
              </button>
            )}

            {/* Feature: Live Viewport-Aware Auto-Play Video Previews Toggle */}
            <button
              onClick={handleTogglePreviewMode}
              className={`ml-2 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-2 border transition-all active:scale-95 shadow-sm ${
                isPreviewEnabled
                  ? 'bg-red-600 hover:bg-red-500 text-white border-red-500 shadow-red-600/30 ring-2 ring-red-500/20'
                  : isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
              }`}
              title="Toggle Live Video Previews: Viewport-aware video players auto-play looped & muted only when scrolled into view, freeing RAM & CPU/GPU when scrolled off-screen."
            >
              {isPreviewEnabled ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-white" />
                  <span>Live Previews: ON</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Live Previews: OFF</span>
                </>
              )}
            </button>

            {/* Layout switch when Preview is enabled */}
            {isPreviewEnabled && (
              <div className="flex items-center p-0.5 rounded-xl border bg-zinc-950 border-zinc-800 text-xs ml-1">
                <button
                  onClick={() => setPreviewLayout('table')}
                  className={`p-1.5 rounded-lg transition-all ${
                    previewLayout === 'table'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Table layout with Mini Stream Player"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewLayout('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    previewLayout === 'grid'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Gallery Grid layout with Auto-Play Video Cards"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by URL or ID..."
                className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:border-red-600 ${
                  isDark ? 'bg-zinc-950 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-300'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-zinc-950 border-zinc-800 text-xs">
              {(['All', 'Active', 'Inactive'] as const).map((filterOpt) => (
                <button
                  key={filterOpt}
                  onClick={() => setStatusFilter(filterOpt)}
                  className={`px-3 py-1 rounded-lg font-extrabold transition-all ${
                    statusFilter === filterOpt
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {filterOpt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Rows Action Toolbar */}
        {selectedIds.length > 0 && (
          <div className="p-3 bg-red-950/40 border-b border-red-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-red-400">
                {selectedIds.length} video{selectedIds.length > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleCopyCommaSeparated('direct')}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold flex items-center gap-1.5 transition-all"
              >
                <Copy className="w-3.5 h-3.5 text-red-400" />
                <span>Copy Selected Direct Links (Comma Separated)</span>
              </button>

              <button
                onClick={handleBatchDelete}
                disabled={isDeletingBatch}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-extrabold flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
                title="Permanently delete all selected videos from Firestore"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingBatch ? 'Deleting Selected...' : `Delete Selected (${selectedIds.length})`}</span>
              </button>

              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* Table Content or Grid View */}
        {isPreviewEnabled && previewLayout === 'grid' ? (
          /* GRID GALLERY PREVIEW VIEW */
          <div className="p-4 sm:p-6">
            {filteredVideos.length === 0 ? (
              <div className={`py-16 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <Film className="w-10 h-10 mx-auto mb-3 text-zinc-600 opacity-60" />
                <p className="font-black text-base">No videos matching filter.</p>
                <p className="text-xs mt-1">Adjust search parameters or add video streams above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredVideos.map((video) => {
                  const isSelected = selectedIds.includes(video.id);

                  return (
                    <div
                      key={video.id}
                      className={`relative rounded-2xl border transition-all overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'border-red-500 ring-2 ring-red-500/30'
                          : isDark
                          ? 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                          : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      {/* Top Checkbox & ID Bar */}
                      <div className="p-2.5 flex items-center justify-between border-b border-zinc-800/40 bg-zinc-900/30 text-xs">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(video.id)}
                            className="rounded border-zinc-700 text-red-600 focus:ring-red-600 bg-zinc-900 cursor-pointer"
                          />
                          <span className="font-mono font-bold text-red-500 text-[11px] truncate max-w-[100px]" title={video.id}>
                            {video.id}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopy(video.id, `grid-id-${video.id}`)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                          title="Copy Document ID"
                        >
                          {copiedId === `grid-id-${video.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {/* Viewport-Aware Lazy Video Player */}
                      <div className="p-2.5">
                        <LazyVideoPreviewPlayer
                          video={video}
                          onDelete={onDeleteVideo}
                          onExpand={handleTestPlayVideo}
                          isDark={isDark}
                          aspectRatio="video"
                        />
                      </div>

                      {/* Video Details & Meta */}
                      <div className="p-3 pt-1 space-y-2 text-xs flex-1 flex flex-col justify-between">
                        {/* URL snippet */}
                        <div className="flex items-center justify-between gap-1 p-1.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40 text-[11px] font-mono">
                          <span className="truncate text-zinc-300" title={video.direct_url}>
                            {video.direct_url}
                          </span>
                          <button
                            onClick={() => handleCopy(video.direct_url, `grid-url-${video.id}`)}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white flex-shrink-0"
                            title="Copy Direct URL"
                          >
                            {copiedId === `grid-url-${video.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        {/* Status & Views Row */}
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <button
                            onClick={() => onToggleVideoStatus(video.id, video.is_active)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black transition-all active:scale-95"
                          >
                            {video.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                                Inactive
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-1 font-mono font-bold text-blue-500">
                            <Eye className="w-3 h-3" />
                            <span>{getVideoViewCount(video).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Action Buttons Row */}
                        <div className="pt-2 border-t border-zinc-800/40 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleTestPlayVideo(video)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold flex items-center justify-center gap-1 text-[11px] transition-all"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>Fullscreen</span>
                          </button>

                          <button
                            onClick={() => onDeleteVideo(video.id)}
                            className="py-1.5 px-2.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 text-[11px] font-black flex items-center justify-center gap-1 transition-all"
                            title="Delete this video"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b text-[11px] font-black uppercase tracking-wider ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                  }`}
                >
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredVideos.length && filteredVideos.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-zinc-700 text-red-600 focus:ring-red-600 bg-zinc-900 cursor-pointer"
                      title="Select / Deselect All"
                    />
                  </th>
                  {isPreviewEnabled && (
                    <th className="py-3.5 px-4 text-center min-w-[170px]">Live Stream Preview</th>
                  )}
                  <th className="py-3.5 px-4">Firestore Doc ID</th>
                  <th className="py-3.5 px-4">Direct Stream URL</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">HLS / ABR</th>
                  <th className="py-3.5 px-4 text-center">Stream Health</th>
                  <th className="py-3.5 px-4 text-center">Views</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-100'}`}>
                {filteredVideos.length === 0 ? (
                  <tr>
                    <td colSpan={isPreviewEnabled ? 9 : 8} className={`py-12 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      <Film className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                      <p className="font-bold text-sm">No videos found.</p>
                      <p className="text-xs mt-1">Add direct stream links using the form above or adjust your search filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredVideos.map((video) => {
                    const isSelected = selectedIds.includes(video.id);

                    return (
                      <tr
                        key={video.id}
                        className={`transition-colors ${
                          isSelected
                            ? isDark
                              ? 'bg-red-950/20'
                              : 'bg-red-50/50'
                            : isDark
                            ? 'hover:bg-zinc-800/50'
                            : 'hover:bg-zinc-50'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(video.id)}
                            className="rounded border-zinc-700 text-red-600 focus:ring-red-600 bg-zinc-900 cursor-pointer"
                          />
                        </td>

                        {/* Live Mini Preview Player (Viewport-Aware RAM Saver) */}
                        {isPreviewEnabled && (
                          <td className="py-2.5 px-4 w-44 min-w-[170px] align-middle">
                            <LazyVideoPreviewPlayer
                              video={video}
                              onDelete={onDeleteVideo}
                              onExpand={handleTestPlayVideo}
                              isDark={isDark}
                              aspectRatio="video"
                            />
                          </td>
                        )}

                        {/* Firestore Doc ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-red-500 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[120px]" title={video.id}>
                              {video.id}
                            </span>
                            <button
                              onClick={() => handleCopy(video.id, `id-${video.id}`)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                              title="Copy ID"
                            >
                              {copiedId === `id-${video.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Direct Stream URL */}
                        <td className="py-3.5 px-4 max-w-md truncate font-mono text-[11px] align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className={`truncate ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`} title={video.direct_url}>
                              {video.direct_url}
                            </span>
                            <button
                              onClick={() => handleCopy(video.direct_url, `url-${video.id}`)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white flex-shrink-0"
                              title="Copy Direct URL"
                            >
                              {copiedId === `url-${video.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Status Toggle Badge */}
                        <td className="py-3.5 px-4 text-center align-middle">
                          <button
                            onClick={() => onToggleVideoStatus(video.id, video.is_active)}
                            className="transition-transform active:scale-95"
                            title="Click to toggle status"
                          >
                            {video.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-sm hover:bg-emerald-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                Inactive
                              </span>
                            )}
                          </button>
                        </td>

                        {/* HLS / ABR Transcode Status */}
                        <td className="py-3.5 px-4 text-center align-middle">
                          {video.status === 'ready' && video.hls_url ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold"
                              title={video.hls_url}
                            >
                              <Layers className="w-3 h-3" />
                              Ready
                            </span>
                          ) : video.status === 'processing' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Processing
                            </span>
                          ) : video.status === 'failed' ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 border border-red-600/30 text-[10px] font-extrabold"
                              title={video.status_error || 'Transcode failed - still serving from direct_url'}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Failed
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-700/40 text-zinc-400 border border-zinc-700 text-[10px] font-extrabold"
                              title="Not yet picked up by the transcode pipeline - still serving from direct_url"
                            >
                              Legacy
                            </span>
                          )}
                        </td>

                        {/* Stream Health */}
                        <td className="py-3.5 px-4 text-center align-middle">
                          {healthMap[video.id] === 'checking' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Testing...
                            </span>
                          ) : healthMap[video.id] === 'healthy' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Healthy
                            </span>
                          ) : healthMap[video.id] === 'broken' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 border border-red-600/30 text-[10px] font-extrabold">
                              <ShieldAlert className="w-3 h-3 text-red-400" />
                              Broken Link
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                setHealthMap((prev) => ({ ...prev, [video.id]: 'checking' }));
                                const res = await verifyVideoLink(video.direct_url, 4000);
                                setHealthMap((prev) => ({ ...prev, [video.id]: res.status }));
                              }}
                              className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[10px] font-extrabold border border-zinc-700 transition-all"
                              title="Click to check link health"
                            >
                              Verify Link
                            </button>
                          )}
                        </td>

                        {/* Views */}
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-blue-500 align-middle">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            {getVideoViewCount(video).toLocaleString()}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right align-middle">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Test Play Button */}
                            <button
                              onClick={() => handleTestPlayVideo(video)}
                              title="Test Play Stream"
                              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-extrabold flex items-center gap-1 shadow-sm transition-all active:scale-95 text-[11px]"
                            >
                              <Play className="w-3.5 h-3.5 fill-white" />
                              <span>Test Play</span>
                            </button>

                            {/* Toggle Status Button */}
                            <button
                              onClick={() => onToggleVideoStatus(video.id, video.is_active)}
                              title={video.is_active ? 'Deactivate Video' : 'Activate Video'}
                              className={`p-1.5 rounded-lg transition-all ${
                                video.is_active
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900/60'
                                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                              }`}
                            >
                              {video.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => onDeleteVideo(video.id)}
                              title="Delete Video"
                              className="p-1.5 rounded-lg bg-red-950/40 text-red-500 hover:bg-red-900/60 border border-red-900/40 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. TEST PLAY VIDEO PREVIEW MODAL */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-red-600 text-white">
                  <Play className="w-4 h-4 fill-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Video Stream Player Preview</h3>
                  <p className="text-[11px] text-zinc-400 font-mono truncate max-w-md">
                    ID: {previewVideo.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Player */}
            <div className="bg-black relative aspect-video flex items-center justify-center">
              <video
                controls
                autoPlay
                playsInline
                src={previewVideo.direct_url}
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.warn('Video failed to play natively:', e);
                }}
              >
                Your browser does not support HTML5 video streaming.
              </video>
            </div>

            {/* Modal Footer Details */}
            <div className="p-4 space-y-2 text-xs font-mono">
              <div>
                <span className="text-zinc-500 font-bold uppercase block text-[10px]">Direct Stream URL:</span>
                <span className="text-red-400 break-all select-all font-semibold">{previewVideo.direct_url}</span>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
                <span className="text-zinc-400">
                  Status: <strong className={previewVideo.is_active ? 'text-emerald-400' : 'text-zinc-500'}>{previewVideo.is_active ? 'Active' : 'Inactive'}</strong>
                </span>

                <button
                  onClick={() => setPreviewVideo(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-extrabold"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. DUPLICATE LINKS REVIEW & CONFIRM DELETION MODAL */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-4 sm:p-5 border-b flex items-center justify-between flex-shrink-0 ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <CopyX className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black flex items-center gap-2">
                    <span>Duplicate Stream Links Scanner</span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase">
                      {duplicateGroups.length} Unique URL{duplicateGroups.length > 1 ? 's' : ''} Duplicated
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Review identical video stream links. One copy will be retained, and redundant copies will be removed so each link appears only once.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isDeletingDuplicates) setShowDuplicateModal(false);
                }}
                disabled={isDeletingDuplicates}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub-Header Stats Banner */}
            <div
              className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-4 text-xs font-semibold ${
                isDark ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300' : 'bg-zinc-100/80 border-zinc-200 text-zinc-700'
              }`}
            >
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Duplicate URL Groups:</span>
                  <span className="font-extrabold text-amber-400">{duplicateGroups.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Redundant Copies to Delete:</span>
                  <span className="font-extrabold text-red-400">
                    {duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Links Retained:</span>
                  <span className="font-extrabold text-emerald-400">{duplicateGroups.length}</span>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 hidden sm:block">
                Select which document to keep for each URL
              </div>
            </div>

            {/* Modal Body: List of Duplicate URL Groups */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {duplicateGroups.map((group, groupIdx) => {
                const totalCopies = group.items.length;
                const redundantInGroup = totalCopies - 1;

                return (
                  <div
                    key={group.url + groupIdx}
                    className={`rounded-2xl border overflow-hidden ${
                      isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    {/* Group Header */}
                    <div
                      className={`p-3.5 sm:p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase flex-shrink-0 mt-0.5">
                          {totalCopies} Copies
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-mono text-xs font-bold text-red-400 break-all select-all leading-relaxed"
                            title={group.url}
                          >
                            {group.url}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                        <button
                          onClick={() => handleCopy(group.url, `dupe-url-${groupIdx}`)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-bold flex items-center gap-1 transition-all"
                          title="Copy direct stream link"
                        >
                          {copiedId === `dupe-url-${groupIdx}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-400" />
                          )}
                          <span>{copiedId === `dupe-url-${groupIdx}` ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          onClick={() => setPreviewVideo(group.items[0])}
                          className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-[11px] font-bold flex items-center gap-1 transition-all"
                          title="Test play stream preview"
                        >
                          <Play className="w-3 h-3 fill-red-400" />
                          <span>Test Play</span>
                        </button>
                      </div>
                    </div>

                    {/* Group Documents Comparison List */}
                    <div className="p-3 sm:p-4 space-y-2.5">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                        Found {totalCopies} Firestore records with this identical stream URL:
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {group.items.map((item, itemIdx) => {
                          const isKept = item.id === group.keepId;
                          const views = getVideoViewCount(item);
                          const createdTime = item.created_at
                            ? item.created_at?.toDate
                              ? item.created_at.toDate().toLocaleString()
                              : new Date(item.created_at).toLocaleString()
                            : 'Unknown';

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleSetKeepId(group.url, item.id)}
                              className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all ${
                                isKept
                                  ? isDark
                                    ? 'bg-emerald-950/20 border-emerald-700/60 shadow-sm'
                                    : 'bg-emerald-50/80 border-emerald-300 shadow-sm'
                                  : isDark
                                  ? 'bg-zinc-900/60 border-zinc-800/80 opacity-70 hover:opacity-100 hover:border-zinc-700'
                                  : 'bg-white border-zinc-200 opacity-70 hover:opacity-100 hover:border-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Radio Circle */}
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                    isKept
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : isDark
                                      ? 'border-zinc-700 bg-zinc-800'
                                      : 'border-zinc-300 bg-zinc-100'
                                  }`}
                                >
                                  {isKept && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>

                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-extrabold text-zinc-300">
                                      ID: <strong className="text-red-400">{item.id}</strong>
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                        item.is_active
                                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                                          : 'bg-zinc-800 text-zinc-400'
                                      }`}
                                    >
                                      {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap">
                                    <span>Added: {createdTime}</span>
                                    <span>•</span>
                                    <span className="text-zinc-300 font-semibold">{views} views</span>
                                  </div>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                                {isKept ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Will Keep (Retained)</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg bg-red-600/20 text-red-400 border border-red-500/40 text-xs font-black flex items-center gap-1.5">
                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    <span>Will Delete</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Action Footer */}
            <div
              className={`p-4 sm:p-5 border-t flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0 ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="text-xs text-zinc-400 text-center sm:text-left">
                <span>
                  Confirming will permanently remove{' '}
                  <strong className="text-red-400 font-extrabold">
                    {duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0)} redundant document(s)
                  </strong>{' '}
                  from Firestore, making each link appear exactly once.
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  disabled={isDeletingDuplicates}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={handleConfirmDeleteDuplicates}
                  disabled={isDeletingDuplicates || duplicateGroups.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isDeletingDuplicates ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting Duplicates...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        Confirm Deletion & Remove (
                        {duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0)}) Duplicates
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
