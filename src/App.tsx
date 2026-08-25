/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  subscribeToVideos,
  subscribeToTotalViews,
  subscribeTo24hVideoViews,
  saveVideoDoc,
  deleteVideoDoc,
  toggleVideoStatus,
  subscribeToAds,
  subscribeToTotalAdViews,
  subscribeTo24hAdViews,
  saveAdDoc,
  deleteAdDoc,
  toggleAdStatus,
  subscribeToEvents,
  incrementVideoViews,
  incrementAdViews,
  fetchNextAdAndTrackView,
  fetchNextVideoAndTrackView,
  logTelemetryEvent,
} from './lib/firebase';
import {
  VideoDocument,
  AdDocument,
  NavigationTab,
  ThemeMode,
  TelemetryEventDocument,
} from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VideosTab } from './components/VideosTab';
import { AdsTab } from './components/AdsTab';
import { MobileNav } from './components/MobileNav';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('videos');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Real-time Firestore Videos State
  const [videos, setVideos] = useState<VideoDocument[]>([]);
  const [events, setEvents] = useState<TelemetryEventDocument[]>([]);
  const [totalViews, setTotalViews] = useState<number>(0);
  const [views24h, setViews24h] = useState<number>(0);

  // Real-time Firestore Ads State
  const [ads, setAds] = useState<AdDocument[]>([]);
  const [totalAdViews, setTotalAdViews] = useState<number>(0);
  const [views24hAds, setViews24hAds] = useState<number>(0);

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
        if (payload.ad_id) {
          await incrementAdViews(payload.ad_id);
        }
        return logTelemetryEvent(payload);
      },
      incrementVideoViews: async (videoId: string) => {
        return incrementVideoViews(videoId);
      },
      incrementAdViews: async (adId: string) => {
        return incrementAdViews(adId);
      },
      fetchNextVideoAndTrackView,
      fetchNextAdAndTrackView,
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

  // Subscribe to Real Firestore Ads Collection
  useEffect(() => {
    const unsubscribeAds = subscribeToAds(
      (list) => {
        setAds(list);
        setFirestoreConnected(true);
      },
      (err) => {
        console.error('Ads subscription error:', err);
      }
    );

    return () => unsubscribeAds();
  }, []);

  // Subscribe to Real Firestore Total Video Views Sum Aggregation
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

  // Subscribe to Real Firestore Total Ad Views Sum Aggregation
  useEffect(() => {
    const unsubscribeTotalAdViews = subscribeToTotalAdViews((count) => {
      setTotalAdViews(count);
    });

    return () => unsubscribeTotalAdViews();
  }, []);

  // Subscribe to Real Firestore 24H Ad Views Rolling Window
  useEffect(() => {
    const unsubscribe24hAdViews = subscribeTo24hAdViews((count) => {
      setViews24hAds(count);
    });

    return () => unsubscribe24hAdViews();
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

        {/* CONTAINER BODY */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 space-y-6 max-w-7xl w-full mx-auto">
          {activeTab === 'videos' ? (
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
              theme={theme}
            />
          ) : (
            <AdsTab
              ads={ads}
              events={events}
              realtimeTotalViews={totalAdViews}
              realtimeViews24h={views24hAds}
              onSaveAd={async (data) => {
                await saveAdDoc(data);
              }}
              onDeleteAd={async (id) => {
                await deleteAdDoc(id);
              }}
              onToggleAdStatus={async (id, currentIsActive) => {
                await toggleAdStatus(id, currentIsActive);
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
        theme={theme}
      />
    </div>
  );
}
