import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Play,
  Pause,
  Plus,
  Trash2,
  ExternalLink,
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
  RefreshCw,
  Zap,
  Globe,
  Layers,
} from 'lucide-react';
import { VideoDocument, TelemetryEventDocument, ThemeMode } from '../types';
import { extractLinksFromString, verifyVideoLink } from '../lib/videoUtils';
import { incrementVideoViews, logTelemetryEvent } from '../lib/firebase';
import { extractVideoFromWebpage } from '../lib/videoScraper';

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
  const [pageUrl, setPageUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [verifyBeforeAdd, setVerifyBeforeAdd] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [linkTypeFilter, setLinkTypeFilter] = useState<'All' | 'Direct' | 'Webpage'>('All');

  // Table Row Selection for Bulk Operations (Copy, Delete, Toggle)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // Video Health Checking State (Stores only healthy or checking states)
  const [healthMap, setHealthMap] = useState<Record<string, 'healthy' | 'checking'>>({});
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Video Test Play Modal State
  const [previewVideo, setPreviewVideo] = useState<VideoDocument | null>(null);

  // Clipboard Copied indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-validation tracking set
  const autoValidatedIdsRef = useRef<Set<string>>(new Set());
  const isAutoValidatingRef = useRef<boolean>(false);

  // Universal link extraction (handles double quotes "vid2.mp4", single quotes, commas, brackets, etc.)
  const parsedDirectUrls = extractLinksFromString(directUrl);
  const parsedPageUrls = extractLinksFromString(pageUrl);

  // AUTOMATED SILENT LINK VALIDATION & INSTANT PURGING EFFECT
  useEffect(() => {
    if (videos.length === 0 || isAutoValidatingRef.current) return;

    const unverifiedVideos = videos.filter((v) => !autoValidatedIdsRef.current.has(v.id));
    if (unverifiedVideos.length === 0) return;

    const autoValidateAndPurge = async () => {
      isAutoValidatingRef.current = true;

      for (const video of unverifiedVideos) {
        autoValidatedIdsRef.current.add(video.id);
        setHealthMap((prev) => ({ ...prev, [video.id]: 'checking' }));

        try {
          const health = await verifyVideoLink(video.direct_url, 4500);

          if (health.status === 'broken') {
            // Silently purge broken link from Firestore without any notice or memory storage
            console.log(`[Auto-Purge] Silently removing broken stream link: ${video.id}`);
            await onDeleteVideo(video.id);
            setHealthMap((prev) => {
              const copy = { ...prev };
              delete copy[video.id];
              return copy;
            });
          } else {
            setHealthMap((prev) => ({ ...prev, [video.id]: 'healthy' }));
          }
        } catch (err) {
          console.warn('Auto verification error:', video.id, err);
        }
      }

      isAutoValidatingRef.current = false;
    };

    autoValidateAndPurge();
  }, [videos, onDeleteVideo]);

  // View count calculation helper for each video (supports Firestore views field & telemetry event fallback)
  const getVideoViewCount = (video: VideoDocument): number => {
    const directViews = typeof video.views === 'number' ? video.views : 0;
    const eventViews = events
      ? events.filter(
          (e) =>
            (e.event_type?.toLowerCase() === 'video_view' || e.event_type?.toLowerCase() === 'page_view') &&
            (e.video_id === video.id ||
              e.video_id === video.direct_url ||
              e.video_id === video.page_url ||
              (e.details && e.details.includes(video.id)))
        ).length
      : 0;
    return Math.max(directViews, eventViews);
  };

  // Helper to categorize link type: Webpage Link vs Direct Stream
  const isWebpageLink = (video: VideoDocument): boolean => {
    const webpage = (video.source_webpage || video.page_url || '').trim();
    const direct = (video.direct_url || '').trim();
    return Boolean(webpage && webpage !== direct);
  };

  // Summary Metrics
  const totalVideos = videos.length;
  const activeVideos = videos.filter((v) => v.is_active).length;
  const totalWebpageLinks = videos.filter(isWebpageLink).length;
  const totalDirectLinks = videos.filter((v) => !isWebpageLink(v)).length;

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

  // Filtered Videos based on Category Toggle, Search, and Status
  const filteredVideos = videos.filter((video) => {
    // 1. Link Type Category Filter
    const isWeb = isWebpageLink(video);
    if (linkTypeFilter === 'Direct' && isWeb) return false;
    if (linkTypeFilter === 'Webpage' && !isWeb) return false;

    // 2. Search by URL, ID, or Source Webpage
    const matchesSearch =
      searchQuery.trim() === '' ||
      video.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.direct_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (video.page_url && video.page_url.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (video.source_webpage && video.source_webpage.toLowerCase().includes(searchQuery.toLowerCase()));

    // 3. Filter by status
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && video.is_active) ||
      (statusFilter === 'Inactive' && !video.is_active);

    return matchesSearch && matchesStatus;
  });

  // Manual Health Sweep function - silently purges broken links without prompt
  const runHealthCheckAndPurge = async () => {
    if (videos.length === 0 || isCheckingHealth) return;

    setIsCheckingHealth(true);
    setFeedback(null);
    let purgedCount = 0;

    for (const video of videos) {
      setHealthMap((prev) => ({ ...prev, [video.id]: 'checking' }));

      const check = await verifyVideoLink(video.direct_url, 4000);

      if (check.status === 'broken') {
        try {
          await onDeleteVideo(video.id);
          purgedCount++;
        } catch (err) {
          console.error('Failed to purge broken video:', video.id, err);
        }
      } else {
        setHealthMap((prev) => ({ ...prev, [video.id]: 'healthy' }));
      }
    }

    setIsCheckingHealth(false);

    if (purgedCount > 0) {
      setFeedback({
        type: 'success',
        message: `Validation complete: Silently removed ${purgedCount} broken link${purgedCount > 1 ? 's' : ''}. Total link count updated!`,
      });
    } else {
      setFeedback({
        type: 'success',
        message: 'Validation complete: All active stream links are verified & healthy!',
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
  const handleCopyCommaSeparated = (type: 'direct' | 'page' | 'all-direct') => {
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

    const linksList = targets
      .map((v) => (type === 'page' ? v.page_url || v.source_webpage || v.direct_url : v.direct_url))
      .filter((url) => url && url.length > 0);

    const commaSeparated = linksList.join(', ');
    navigator.clipboard.writeText(commaSeparated);

    setCopiedId(type === 'all-direct' ? 'batch-all-direct' : `batch-${type}`);
    setTimeout(() => setCopiedId(null), 2500);

    setFeedback({
      type: 'success',
      message: `Copied ${linksList.length} ${type === 'page' ? 'webpage' : 'direct stream'} link${linksList.length > 1 ? 's' : ''} to clipboard!`,
    });
  };

  // Bulk Delete Selected Videos
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeletingBatch(true);
    setFeedback(null);

    try {
      let count = 0;
      for (const id of selectedIds) {
        await onDeleteVideo(id);
        count++;
      }
      setSelectedIds([]);
      setFeedback({
        type: 'success',
        message: `Deleted ${count} video link${count > 1 ? 's' : ''}.`,
      });
    } catch (err) {
      console.error('Batch delete error:', err);
      setFeedback({ type: 'error', message: 'Failed to delete selected videos.' });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Handle Add Video Form Submit
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();

    const directList = parsedDirectUrls;
    const pageList = parsedPageUrls;

    if (directList.length === 0 && pageList.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Please enter at least one direct stream URL or webpage URL to process.',
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
      // 1. Process Direct Stream URLs if entered in Field 1
      for (let i = 0; i < directList.length; i++) {
        const dUrl = directList[i];
        const pUrl = pageList[i] || '';

        if (verifyBeforeAdd) {
          setStatusMessage(`Testing direct stream playability (${i + 1}/${directList.length}): ${dUrl}`);
          const health = await verifyVideoLink(dUrl, 5000);

          if (health.status === 'broken') {
            skippedCount++;
            errorMessages.push(`Stream link failed validation test: ${dUrl}`);
            continue;
          }
        }

        setStatusMessage(`Saving video stream (${i + 1}/${directList.length})...`);
        await onSaveVideo({
          direct_url: dUrl,
          source_webpage: pUrl,
          page_url: pUrl,
          is_active: true,
          views: 0,
          created_at: new Date(),
        });
        addedCount++;
      }

      // 2. Process Webpage URLs entered in Field 2 (Scrape & Extract Embedded Video Streams)
      if (pageList.length > 0) {
        const webpagesToScrape = directList.length === 0 ? pageList : pageList.slice(directList.length);

        if (webpagesToScrape.length > 0) {
          setStatusMessage(`Scraping webpage HTML & extracting video source (${webpagesToScrape.length} page${webpagesToScrape.length > 1 ? 's' : ''})...`);

          const extractionResults = await extractVideoFromWebpage(webpagesToScrape);

          for (const res of extractionResults) {
            if (res.success && res.direct_url) {
              if (verifyBeforeAdd) {
                setStatusMessage(`Testing extracted stream playability: ${res.direct_url}`);
                const health = await verifyVideoLink(res.direct_url, 5000);
                if (health.status === 'broken') {
                  skippedCount++;
                  errorMessages.push(`Extracted stream from ${res.source_webpage} failed playability test.`);
                  continue;
                }
              }

              setStatusMessage(`Storing extracted video stream from ${res.source_webpage}...`);
              await onSaveVideo({
                direct_url: res.direct_url,
                source_webpage: res.source_webpage,
                page_url: res.source_webpage,
                is_active: true,
                views: 0,
                created_at: new Date(),
              });
              addedCount++;
            } else {
              skippedCount++;
              errorMessages.push(
                res.error || `Could not extract video stream from webpage: ${res.source_webpage}`
              );
            }
          }
        }
      }

      // 3. UI Toast/Feedback Result
      if (addedCount > 0) {
        setFeedback({
          type: 'success',
          message:
            skippedCount > 0
              ? `Successfully saved ${addedCount} stream link${addedCount > 1 ? 's' : ''}! (${skippedCount} broken or invalid link${skippedCount > 1 ? 's' : ''} skipped)`
              : `Successfully added ${addedCount} stream link${addedCount > 1 ? 's' : ''}!`,
        });
        setDirectUrl('');
        setPageUrl('');
      } else {
        setFeedback({
          type: 'error',
          message:
            errorMessages.length > 0
              ? errorMessages.join(' | ')
              : 'Extraction failed: No valid video stream (.mp4, .m3u8) was found.',
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
      {/* 1. TOP SUMMARY METRICS & CATEGORY TOTALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Metric 1: Total Videos */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Total Active Videos
            </span>
            <div className="p-2.5 rounded-xl bg-red-600/10 text-red-500 border border-red-600/20">
              <Film className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight font-mono">{totalVideos}</span>
              <span className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>validated streams</span>
            </div>
            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
              isDark ? 'bg-emerald-950/80 text-emerald-400 border-emerald-900' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {activeVideos} Active ({totalVideos > 0 ? Math.round((activeVideos / totalVideos) * 100) : 0}%)
            </span>
          </div>
        </div>

        {/* Metric 2: Category Totals (Direct Stream Links vs Webpage Links) */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Category Breakdown
            </span>
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-500 border border-blue-600/20">
              <Layers className="w-4 h-4 text-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-1">
            {/* Direct Stream Total */}
            <button
              onClick={() => setLinkTypeFilter('Direct')}
              className={`p-3 rounded-xl border text-left transition-all ${
                linkTypeFilter === 'Direct'
                  ? 'bg-amber-500/20 border-amber-500 text-white ring-2 ring-amber-500/30'
                  : isDark
                  ? 'bg-zinc-950 border-zinc-800 hover:border-amber-500/50'
                  : 'bg-zinc-50 border-zinc-200 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-400 uppercase tracking-wider">
                <Video className="w-3.5 h-3.5 text-amber-400" />
                <span>Direct Streams</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono">{totalDirectLinks}</span>
                <span className="text-[10px] text-zinc-400 font-medium">links</span>
              </div>
            </button>

            {/* Webpage Links Total */}
            <button
              onClick={() => setLinkTypeFilter('Webpage')}
              className={`p-3 rounded-xl border text-left transition-all ${
                linkTypeFilter === 'Webpage'
                  ? 'bg-blue-500/20 border-blue-500 text-white ring-2 ring-blue-500/30'
                  : isDark
                  ? 'bg-zinc-950 border-zinc-800 hover:border-blue-500/50'
                  : 'bg-zinc-50 border-zinc-200 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-blue-400 uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Webpage Links</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono">{totalWebpageLinks}</span>
                <span className="text-[10px] text-zinc-400 font-medium">scraped</span>
              </div>
            </button>
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
            Register direct video links (.mp4, .m3u8, webm) or enter webpage URLs to automatically scrape raw video streams.
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field 1: Direct Stream Link (Single or Comma Separated) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`block text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Direct Stream Link(s)
                </label>
                {parsedDirectUrls.length > 0 && (
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 border border-red-600/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-red-400" />
                    {parsedDirectUrls.length} stream link{parsedDirectUrls.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="relative">
                <textarea
                  rows={3}
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="Paste single link or multiple comma-separated / newline-separated links&#10;e.g., https://cdn.com/1.mp4, https://cdn.com/2.m3u8"
                  className={`w-full p-3 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-red-600 ${
                    isDark
                      ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                      : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
                  }`}
                />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Direct stream URLs (.mp4, .m3u8, .webm).
              </p>
            </div>

            {/* Field 2: Webpage Link(s) (Scrape & Extract Stream) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`block text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Webpage Link(s) (Scrape & Extract Stream)
                </label>
                {parsedPageUrls.length > 0 && (
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-400 border border-blue-600/30 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-blue-400 animate-pulse" />
                    {parsedPageUrls.length} page link{parsedPageUrls.length > 1 ? 's' : ''} to scrape
                  </span>
                )}
              </div>
              <div className="relative">
                <textarea
                  rows={3}
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  placeholder="Paste webpage URL(s) to scrape raw video source&#10;e.g., https://www.xxxfollow.com/adalyndiary/1396577-..."
                  className={`w-full p-3 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-red-600 ${
                    isDark
                      ? 'bg-zinc-950 text-white border-zinc-800 placeholder-zinc-600'
                      : 'bg-zinc-50 text-zinc-900 border-zinc-300 placeholder-zinc-400'
                  }`}
                />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Auto Scraper: Scrapes embedded video stream (.mp4, .m3u8) from full webpage URLs.
              </p>
            </div>
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
                  Validate playability before adding
                </span>
              </label>

              <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {Math.max(parsedDirectUrls.length, parsedPageUrls.length) > 0
                  ? `(${Math.max(parsedDirectUrls.length, parsedPageUrls.length)} link entry${
                      Math.max(parsedDirectUrls.length, parsedPageUrls.length) > 1 ? 's' : ''
                    } ready)`
                  : ''}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || Math.max(parsedDirectUrls.length, parsedPageUrls.length) === 0}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? parsedPageUrls.length > 0
                    ? 'Scraping & Extracting Video Stream...'
                    : 'Processing & Verifying Stream...'
                  : Math.max(parsedDirectUrls.length, parsedPageUrls.length) > 1
                  ? `Batch Process ${Math.max(parsedDirectUrls.length, parsedPageUrls.length)} Links`
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

      {/* HEALTH VALIDATOR & SILENT AUTO-PURGE PANEL */}
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
                <span>Automated Link Health Validator & Silent Auto-Purge</span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Continuously validates links in the background. If a stream becomes broken, it is automatically removed without notice, keeping only active links.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={runHealthCheckAndPurge}
              disabled={isCheckingHealth || videos.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
              <span>{isCheckingHealth ? 'Validating Streams...' : 'Run Instant Validation Sweep'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. VIDEOS DATA DIRECTORY TABLE WITH CATEGORY TOGGLE */}
      <div
        className={`border rounded-2xl shadow-sm overflow-hidden ${
          isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Category Link Type Toggle Switcher Bar */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 block mb-1">
              Category Filter Toggle
            </span>
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl border bg-zinc-900 border-zinc-800 text-xs flex-wrap">
              <button
                type="button"
                onClick={() => setLinkTypeFilter('All')}
                className={`px-4 py-2 rounded-xl font-extrabold transition-all flex items-center gap-2 ${
                  linkTypeFilter === 'All'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span>All Links</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {totalVideos}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLinkTypeFilter('Direct')}
                className={`px-4 py-2 rounded-xl font-extrabold transition-all flex items-center gap-2 ${
                  linkTypeFilter === 'Direct'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-amber-300" />
                <span>Direct Stream Links</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {totalDirectLinks}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLinkTypeFilter('Webpage')}
                className={`px-4 py-2 rounded-xl font-extrabold transition-all flex items-center gap-2 ${
                  linkTypeFilter === 'Webpage'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-blue-300" />
                <span>Webpage Links</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                  {totalWebpageLinks}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400">
              Showing <strong className="text-white font-mono">{filteredVideos.length}</strong> of{' '}
              <span className="font-mono">{totalVideos}</span> links
            </span>
          </div>
        </div>

        {/* Table Controls & Search */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Film className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-black">Registered Videos Directory</h2>

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
                    : 'Copy Direct Links (Comma Separated)'}
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
                <span>Copy Selected Direct Links</span>
              </button>

              <button
                onClick={() => handleCopyCommaSeparated('page')}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold flex items-center gap-1.5 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <span>Copy Selected Webpage Links</span>
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
                <th className="py-3.5 px-4">Doc ID</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Direct Stream URL</th>
                <th className="py-3.5 px-4">Webpage URL</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Stream Validation</th>
                <th className="py-3.5 px-4 text-center">Views</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-100'}`}>
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`py-12 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <Film className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                    <p className="font-bold text-sm">
                      No {linkTypeFilter !== 'All' ? linkTypeFilter.toLowerCase() : ''} videos found.
                    </p>
                    <p className="text-xs mt-1">
                      {linkTypeFilter !== 'All'
                        ? `Switch the category toggle above to "All Links" or add new ${linkTypeFilter.toLowerCase()} links.`
                        : 'Add a video using the form above or adjust your search filters.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVideos.map((video) => {
                  const isSelected = selectedIds.includes(video.id);
                  const isWeb = isWebpageLink(video);

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
                          <span className="truncate max-w-[90px]" title={video.id}>
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

                      {/* Category Badge */}
                      <td className="py-3.5 px-4">
                        {isWeb ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/80 text-blue-400 border border-blue-800/80 text-[10px] font-black uppercase tracking-wider">
                            <Globe className="w-3 h-3 text-blue-400" />
                            Webpage Link
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/80 text-[10px] font-black uppercase tracking-wider">
                            <Video className="w-3 h-3 text-amber-400" />
                            Direct Stream
                          </span>
                        )}
                      </td>

                      {/* Direct Stream URL */}
                      <td className="py-3.5 px-4 max-w-xs truncate font-mono text-[11px]">
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

                      {/* Webpage URL */}
                      <td className="py-3.5 px-4 max-w-xs truncate font-mono text-[11px] text-zinc-400">
                        {video.page_url || video.source_webpage ? (
                          <a
                            href={video.page_url || video.source_webpage}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-red-400 underline inline-flex items-center gap-1 truncate"
                          >
                            <span>{video.page_url || video.source_webpage}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-zinc-600 italic">None</span>
                        )}
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

                      {/* Stream Validation */}
                      <td className="py-3.5 px-4 text-center">
                        {healthMap[video.id] === 'checking' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Validating...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Active Stream
                          </span>
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

      {/* 4. MINIMAL TEST PLAY PREVIEW MODAL */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
              isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            {/* Minimal Header */}
            <div className="px-3.5 py-2.5 border-b border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Play className="w-3.5 h-3.5 text-red-500 fill-red-500 flex-shrink-0" />
                <span className="text-xs font-bold truncate font-mono">
                  {previewVideo.id}
                </span>
              </div>

              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Minimal Video Player */}
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

            {/* Minimal Footer */}
            <div className="p-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 text-[11px]">
              <span className="text-zinc-400 font-mono truncate max-w-[240px]">
                {previewVideo.direct_url}
              </span>
              <button
                onClick={() => setPreviewVideo(null)}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-all flex-shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
