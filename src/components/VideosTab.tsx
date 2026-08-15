import React, { useState } from 'react';
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
} from 'lucide-react';
import { VideoDocument, TelemetryEventDocument, ThemeMode } from '../types';
import { extractLinksFromString, verifyVideoLink } from '../lib/videoUtils';
import { incrementVideoViews, logTelemetryEvent } from '../lib/firebase';

interface VideosTabProps {
  videos: VideoDocument[];
  events?: TelemetryEventDocument[];
  onSaveVideo: (data: Omit<VideoDocument, 'id'> & { id?: string }) => Promise<void>;
  onDeleteVideo: (id: string) => Promise<void>;
  onToggleVideoStatus: (id: string, currentIsActive: boolean) => Promise<void>;
  theme: ThemeMode;
}

export const VideosTab: React.FC<VideosTabProps> = ({
  videos,
  events,
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

  // Clipboard Copied indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Universal link extraction (handles double quotes "vid2.mp4", single quotes, commas, brackets, etc.)
  const parsedDirectUrls = extractLinksFromString(directUrl);

  // View count calculation helper for each video (supports Firestore views field & telemetry event fallback)
  const getVideoViewCount = (video: VideoDocument): number => {
    const directViews = typeof video.views === 'number' ? video.views : 0;
    const eventViews = events
      ? events.filter(
          (e) =>
            (e.event_type?.toLowerCase() === 'video_view' || e.event_type?.toLowerCase() === 'page_view') &&
            (e.video_id === video.id ||
              e.video_id === video.direct_url ||
              (e.details && e.details.includes(video.id)))
        ).length
      : 0;
    return Math.max(directViews, eventViews);
  };

  // Summary Metrics
  const totalVideos = videos.length;
  const activeVideos = videos.filter((v) => v.is_active).length;
  const brokenCount = Object.values(healthMap).filter((status) => status === 'broken').length;

  // Handle Test Play video with instant view count increment
  const handleTestPlayVideo = async (video: VideoDocument) => {
    setPreviewVideo(video);
    try {
      await incrementVideoViews(video.id);
      await logTelemetryEvent({
        event_type: 'video_view',
        userId: 'ADMIN_TESTER',
        timestamp: new Date(),
        device_type: 'Desktop',
        video_id: video.id,
        details: `Admin test played stream: ${video.id}`,
      });
    } catch (err) {
      console.warn('Error recording test play video view:', err);
    }
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

    let addedCount = 0;
    let skippedCount = 0;
    const errorMessages: string[] = [];

    try {
      for (let i = 0; i < directList.length; i++) {
        const dUrl = directList[i];

        if (verifyBeforeAdd) {
          setStatusMessage(`Testing direct stream playability (${i + 1}/${directList.length}): ${dUrl}`);
          const health = await verifyVideoLink(dUrl, 5000);

          if (health.status === 'broken') {
            skippedCount++;
            errorMessages.push(`Direct link failed playability check: ${dUrl}`);
            continue;
          }
        }

        setStatusMessage(`Saving video stream (${i + 1}/${directList.length})...`);
        await onSaveVideo({
          direct_url: dUrl,
          is_active: true,
          views: 0,
          created_at: new Date(),
        });
        addedCount++;
      }

      if (addedCount > 0) {
        setFeedback({
          type: 'success',
          message:
            skippedCount > 0
              ? `Successfully stored ${addedCount} video stream${addedCount > 1 ? 's' : ''}! (${skippedCount} link${skippedCount > 1 ? 's' : ''} failed playability check)`
              : `Successfully added and verified ${addedCount} video stream${addedCount > 1 ? 's' : ''} to Firestore!`,
        });
        setDirectUrl('');
      } else {
        setFeedback({
          type: 'error',
          message:
            errorMessages.length > 0
              ? errorMessages.join(' | ')
              : 'Failed to add video streams. Please check your links.',
        });
      }
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

        {/* Metric 2: Active Videos */}
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

        {/* Table Content */}
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
                <th className="py-3.5 px-4">Firestore Doc ID</th>
                <th className="py-3.5 px-4">Direct Stream URL</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Stream Health</th>
                <th className="py-3.5 px-4 text-center">Views</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-100'}`}>
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-12 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
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
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(video.id)}
                          className="rounded border-zinc-700 text-red-600 focus:ring-red-600 bg-zinc-900 cursor-pointer"
                        />
                      </td>

                      {/* Firestore Doc ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-red-500">
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
                      <td className="py-3.5 px-4 max-w-md truncate font-mono text-[11px]">
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
                      <td className="py-3.5 px-4 text-center">
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

                      {/* Stream Health */}
                      <td className="py-3.5 px-4 text-center">
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
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-blue-500">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {getVideoViewCount(video).toLocaleString()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
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
    </div>
  );
};
