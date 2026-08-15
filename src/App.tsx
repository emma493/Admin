/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  subscribeToVideos,
  saveVideoDoc,
  deleteVideoDoc,
  toggleVideoStatus,
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
import { MobileNav } from './components/MobileNav';

export default function App() {
  const [activeTab, setActiveTab] = useState<'videos'>('videos');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Real-time Firestore State
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [events, setEvents] = useState<TelemetryEventDocument[]>([]);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);

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

        {/* CONTAINER BODY - Strictly Videos Management */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 space-y-6 max-w-7xl w-full mx-auto">
          <VideosTab
            videos={videos}
            events={events}
            onSaveVideo={async (data) => {
              await saveVideoDoc(data);
            }}
            onDeleteVideo={async (id) => {
              await deleteVideoDoc(id);
            }}
            onToggleVideoStatus={async (id, currentIsActive) => {
              await toggleVideoStatus(id, currentIsActive);
            }}
            theme={theme}
          />
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
      />
    </div>
  );
}
