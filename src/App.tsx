/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  subscribeToUsers,
  subscribeToDailyAnalytics,
  subscribeToAllDailyAnalytics,
  subscribeToAdminAnalytics,
  subscribeToNotifications,
  saveNotificationDoc,
  deleteNotificationDoc,
  toggleNotificationStatus,
  toggleUserNotificationSubscribed,
  subscribeToVideos,
  saveVideoDoc,
  deleteVideoDoc,
  toggleVideoStatus,
  trackAppDownload,
  saveUserDoc,
  toggleUserStatus,
  deleteUserDoc,
  logPageViewEvent,
} from './lib/firebase';
import { RealWebsiteTracker } from './lib/tracker';
import {
  UserDocument,
  DailyAnalyticsDocument,
  AdminAnalyticsDocument,
  NotificationDocument,
  VideoDocument,
  LiveActivityEvent,
  DeviceType,
  ThemeMode,
} from './types';
import { getFormattedDate } from './lib/utils';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardTab } from './components/DashboardTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { UsersTab } from './components/UsersTab';
import { NotificationsTab } from './components/NotificationsTab';
import { VideosTab } from './components/VideosTab';
import { UserDetailModal } from './components/UserDetailModal';
import { AddUserModal } from './components/AddUserModal';
import { RealTimeTrackerStatus } from './components/LiveSimulatorBar';
import { TrackingCodeModal } from './components/TrackingCodeModal';
import { MobileNav } from './components/MobileNav';

import { DateRangeState } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'users' | 'notifications' | 'videos'>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Real-time Firestore State
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getFormattedDate());
  const [dateRange, setDateRange] = useState<DateRangeState>({
    preset: 'all',
    startDate: '',
    endDate: '',
  });
  const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalyticsDocument | null>(null);
  const [allDailyAnalytics, setAllDailyAnalytics] = useState<DailyAnalyticsDocument[]>([]);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsDocument | null>(null);
  const [notifications, setNotifications] = useState<NotificationDocument[]>([]);
  const [videos, setVideos] = useState<VideoDocument[]>([]);

  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);

  // Real Active Visitor Info for Current Client Session
  const [currentVisitorId, setCurrentVisitorId] = useState<string>('');
  const [realDuration, setRealDuration] = useState<number>(0);
  const [trackerInstance, setTrackerInstance] = useState<RealWebsiteTracker | null>(null);

  // Modals & User Details
  const [selectedUser, setSelectedUser] = useState<UserDocument | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState<boolean>(false);
  const [isTrackingCodeOpen, setIsTrackingCodeOpen] = useState<boolean>(false);

  // Activity Stream Ticker
  const [activityFeed, setActivityFeed] = useState<LiveActivityEvent[]>([]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  // 1. Initialize REAL Visitor Session Tracker
  useEffect(() => {
    const tracker = new RealWebsiteTracker();
    setTrackerInstance(tracker);

    tracker
      .startTracking((sec) => {
        setRealDuration(sec);
      })
      .then((id) => {
        setCurrentVisitorId(id);
        const info = tracker.getVisitorInfo();
        addActivityEvent(
          id,
          info.country,
          info.deviceType,
          'NEW_SESSION',
          `Connected real browser session (${info.deviceType}, ${info.trafficSource})`
        );
      })
      .catch((err) => console.error('Real tracker error:', err));

    return () => {
      tracker.stopTracking();
    };
  }, []);

  // 2. Subscribe to Real Firestore Users Collection
  useEffect(() => {
    const unsubscribeUsers = subscribeToUsers(
      (userList) => {
        setUsers(userList);
        setFirestoreConnected(true);
      },
      (err) => {
        console.error('Users subscription error:', err);
        setFirestoreConnected(false);
      }
    );

    return () => unsubscribeUsers();
  }, []);

  // 3. Subscribe to Real Firestore Daily Analytics
  useEffect(() => {
    const unsubscribeAnalytics = subscribeToDailyAnalytics(
      selectedDate,
      (analyticsDoc) => {
        setDailyAnalytics(analyticsDoc);
      }
    );

    return () => unsubscribeAnalytics();
  }, [selectedDate]);

  // 4. Subscribe to all daily analytics
  useEffect(() => {
    const unsubscribeAll = subscribeToAllDailyAnalytics((list) => {
      setAllDailyAnalytics(list);
    });

    return () => unsubscribeAll();
  }, []);

  // 5. Subscribe to Real Firestore Admin Analytics (App Stats)
  useEffect(() => {
    const unsubscribeAdmin = subscribeToAdminAnalytics((data) => {
      setAdminAnalytics(data);
    });

    return () => unsubscribeAdmin();
  }, []);

  // 6. Subscribe to Real Firestore Notifications Collection
  useEffect(() => {
    const unsubscribeNotifications = subscribeToNotifications((list) => {
      setNotifications(list);
    });

    return () => unsubscribeNotifications();
  }, []);

  // 7. Subscribe to Real Firestore Videos Collection
  useEffect(() => {
    const unsubscribeVideos = subscribeToVideos((list) => {
      setVideos(list);
    });

    return () => unsubscribeVideos();
  }, []);

  // Handler to download app.apk and increment install metrics in Firestore
  const handleDownloadApp = async () => {
    try {
      await trackAppDownload();
      addActivityEvent(
        currentVisitorId || 'DOWNLOAD',
        'GH',
        'Mobile',
        'PING',
        'Downloaded app.apk (totalAppInstalls incremented)'
      );

      // Trigger browser download for app.apk
      const element = document.createElement('a');
      const file = new Blob(['Mock APK File content for app installation tracking test'], {
        type: 'application/vnd.android.package-archive',
      });
      element.href = URL.createObjectURL(file);
      element.download = 'app.apk';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err) {
      console.error('App download tracking error:', err);
    }
  };

  // Helper to add activity feed event
  const addActivityEvent = (
    userId: string,
    country: string,
    deviceType: DeviceType,
    action: LiveActivityEvent['action'],
    details: string
  ) => {
    const newEvent: LiveActivityEvent = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      userId,
      country,
      deviceType,
      action,
      details,
    };
    setActivityFeed((prev) => [newEvent, ...prev.slice(0, 25)]);
  };

  const onlineCount = users.filter((u) => u.status === 'Online').length;
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
        onlineCount={onlineCount}
        totalUsersCount={users.length}
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
          totalUsersCount={users.length}
          theme={theme}
          onToggleTheme={toggleTheme}
          firestoreConnected={firestoreConnected}
          onToggleMobileMenu={toggleMobileMenu}
          isMobileMenuOpen={isMobileMenuOpen}
        />

        {/* CONTAINER BODY */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* REAL TIME TRACKER STATUS BAR */}
          <RealTimeTrackerStatus
            currentVisitorId={currentVisitorId}
            realDuration={realDuration}
            theme={theme}
          />

          {/* TAB 1: DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <DashboardTab
              users={users}
              dailyAnalytics={dailyAnalytics}
              allDailyAnalytics={allDailyAnalytics}
              adminAnalytics={adminAnalytics}
              activityFeed={activityFeed}
              onNavigateToUsers={() => setActiveTab('users')}
              onNavigateToAnalytics={() => setActiveTab('analytics')}
              onDownloadApp={handleDownloadApp}
              theme={theme}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          )}

          {/* TAB 2: ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <AnalyticsTab
              dailyAnalytics={dailyAnalytics}
              allDailyAnalytics={allDailyAnalytics}
              users={users}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              theme={theme}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          )}

          {/* TAB 3: USERS TAB */}
          {activeTab === 'users' && (
            <UsersTab
              users={users}
              onSelectUser={(u) => setSelectedUser(u)}
              onToggleStatus={async (userId, status) => {
                await toggleUserStatus(userId, status);
                addActivityEvent(
                  userId,
                  'GH',
                  'Mobile',
                  'STATUS_CHANGE',
                  `Status set to ${status}`
                );
              }}
              onToggleNotificationSubscribed={async (userId, currentSubscribed) => {
                await toggleUserNotificationSubscribed(userId, currentSubscribed);
                addActivityEvent(
                  userId,
                  'GH',
                  'Mobile',
                  'STATUS_CHANGE',
                  `Notification subscription toggled to ${!currentSubscribed}`
                );
              }}
              onDeleteUser={async (userId) => {
                await deleteUserDoc(userId);
                addActivityEvent(userId, 'GH', 'Mobile', 'PING', `Deleted user doc`);
              }}
              onOpenAddUser={() => setIsAddUserOpen(true)}
              theme={theme}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          )}

          {/* TAB 4: NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <NotificationsTab
              notifications={notifications}
              onSaveNotification={async (data) => {
                await saveNotificationDoc(data);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'PING',
                  `Saved notification template (${data.type})`
                );
              }}
              onDeleteNotification={async (id) => {
                await deleteNotificationDoc(id);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'PING',
                  `Deleted notification template`
                );
              }}
              onToggleNotificationStatus={async (id, currentStatus) => {
                await toggleNotificationStatus(id, currentStatus);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'STATUS_CHANGE',
                  `Notification status toggled from ${currentStatus}`
                );
              }}
              theme={theme}
            />
          )}

          {/* TAB 5: VIDEOS TAB */}
          {activeTab === 'videos' && (
            <VideosTab
              videos={videos}
              onSaveVideo={async (data) => {
                await saveVideoDoc(data);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'PING',
                  `Saved video stream document`
                );
              }}
              onDeleteVideo={async (id) => {
                await deleteVideoDoc(id);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'PING',
                  `Deleted video stream document`
                );
              }}
              onToggleVideoStatus={async (id, currentIsActive) => {
                await toggleVideoStatus(id, currentIsActive);
                addActivityEvent(
                  'ADMIN',
                  'GH',
                  'Desktop',
                  'STATUS_CHANGE',
                  `Video status toggled to ${!currentIsActive}`
                );
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
        onlineCount={onlineCount}
        theme={theme}
      />

      {/* MODALS */}
      <UserDetailModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onToggleStatus={async (userId, status) => {
          await toggleUserStatus(userId, status);
          if (selectedUser && selectedUser.userId === userId) {
            setSelectedUser({ ...selectedUser, status });
          }
        }}
        onDeleteUser={async (userId) => {
          await deleteUserDoc(userId);
          setSelectedUser(null);
        }}
        onSimulateHit={async (userId) => {
          if (!selectedUser) return;
          await saveUserDoc({
            ...selectedUser,
            totalDurationSeconds: (selectedUser.totalDurationSeconds || 0) + 15,
            lastActive: new Date(),
          });
          await logPageViewEvent(
            selectedUser.userId,
            selectedUser.country,
            selectedUser.deviceType,
            selectedUser.trafficSource
          );
        }}
        theme={theme}
      />

      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        onSave={async (newUser) => {
          await saveUserDoc(newUser);
          await logPageViewEvent(
            newUser.userId,
            newUser.country,
            newUser.deviceType,
            newUser.trafficSource
          );
          addActivityEvent(
            newUser.userId,
            newUser.country,
            newUser.deviceType,
            'NEW_SESSION',
            `Created session doc`
          );
        }}
        theme={theme}
      />

      <TrackingCodeModal
        isOpen={isTrackingCodeOpen}
        onClose={() => setIsTrackingCodeOpen(false)}
        theme={theme}
      />
    </div>
  );
}
