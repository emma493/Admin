/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribeToVideos,
  subscribeToTotalViews,
  subscribeTo24hVideoViews,
  saveVideoDoc,
  deleteVideoDoc,
  toggleVideoStatus,
  toggleVideoApproval,
  setVideoApprovalBatch,
  subscribeToEvents,
  incrementVideoViews,
  logTelemetryEvent,
} from './lib/firebase';
import {
  VideoDocument,
  ThemeMode,
  TelemetryEventDocument,
} from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VideosTab } from './components/VideosTab';
import { TestTab } from './components/TestTab';
import { MobileNav } from './components/MobileNav';

export default function App() {
  const [activeTab, setActiveTab] = useState<'videos' | 'test'>('videos');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Real-time Firestore State
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [events, setEvents] = useState<TelemetryEventDocument[]>([]);
  const [totalViews, setTotalViews] = useState<number>(0);
  const [views24h, setViews24h] = useState<number>(0);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);

  const unapprovedCount = useMemo(() => {
    return videos.filter((v) => v.is_approved !== true && v.approved !== true).length;
  }, [videos]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  // Bind global ShortxxTrackerAPI for client-side scripts (tracking.js / user sites)
  useEffect(() => {
    (window as any).ShortxxTrackerAPI = {
      logEvent: async (payload: any) => {
        if (payload.video_id) {
          await incrementVideoViews(payload.video_id);
        }
        return logTelemetryEvent(payload);
      },
      incrementVideoViews: async (videoId: string) => {
        return incrementVideoViews(videoId);
      },
    };
  }, []);

  // Subscribe to Real Firestore Videos Collection
  useEffect(() => {
    const unsubscribeVideos = subscribeToVideos(
      (list) => {
        setVideos(list);
        setFirestoreConnected(true);
      },
      (err) => {
        console.error('Videos subscription error:', err);
        setFirestoreConnected(false);
      }
    );

    return () => unsubscribeVideos();
  }, []);

  // Subscribe to Real Firestore Total Views Sum Aggregation
  useEffect(() => {
    const unsubscribeTotalViews = subscribeToTotalViews((count) => {
      setTotalViews(count);
    });

    return () => unsubscribeTotalViews();
  }, []);

  // Subscribe to Real Firestore 24H Video Views Rolling Window
  useEffect(() => {
    const unsubscribe24hViews = subscribeTo24hVideoViews((count) => {
      setViews24h(count);
    });

    return () => unsubscribe24hViews();
  }, []);

  // Subscribe to Real Firestore Telemetry Events Collection (for stream views metric sync)
  useEffect(() => {
    const unsubscribeEvents = subscribeToEvents((list) => {
      setEvents(list);
    });

    return () => unsubscribeEvents();
  }, []);

  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row font-sans antialiased selection:bg-red-600 selection:text-white transition-colors duration-200 ${
        isDark ? 'bg-black text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      {/* SIDEBAR NAVIGATION (Desktop & Mobile Drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unapprovedCount={unapprovedCount}
        firestoreConnected={firestoreConnected}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER BAR */}
        <Header
          activeTab={activeTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          firestoreConnected={firestoreConnected}
          onToggleMobileMenu={toggleMobileMenu}
          isMobileMenuOpen={isMobileMenuOpen}
        />

        {/* CONTAINER BODY */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 space-y-6 max-w-7xl w-full mx-auto">
          {activeTab === 'test' ? (
            <TestTab
              videos={videos}
              onDeleteVideo={async (id) => {
                await deleteVideoDoc(id);
              }}
              onToggleApproval={async (id, currentIsApproved) => {
                await toggleVideoApproval(id, currentIsApproved);
              }}
              onBatchApprove={async (ids) => {
                await setVideoApprovalBatch(ids, true);
              }}
              theme={theme}
            />
          ) : (
            <VideosTab
              videos={videos}
              events={events}
              realtimeTotalViews={totalViews}
              realtimeViews24h={views24h}
              onSaveVideo={async (data) => {
                await saveVideoDoc(data);
              }}
              onDeleteVideo={async (id) => {
                await deleteVideoDoc(id);
              }}
              onToggleVideoStatus={async (id, currentIsActive) => {
                await toggleVideoStatus(id, currentIsActive);
              }}
              onToggleApproval={async (id, currentIsApproved) => {
                await toggleVideoApproval(id, currentIsApproved);
              }}
              onBatchApprove={async (ids, isApproved) => {
                await setVideoApprovalBatch(ids, isApproved);
              }}
              theme={theme}
            />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unapprovedCount={unapprovedCount}
        theme={theme}
      />
    </div>
  );
}
