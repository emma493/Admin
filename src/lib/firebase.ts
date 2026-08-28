import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  arrayUnion,
  increment,
  Timestamp,
  query,
  where,
  orderBy,
  limit,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  UserDocument,
  DailyAnalyticsDocument,
  AdminAnalyticsDocument,
  DeviceType,
  UserStatus,
  NotificationDocument,
  NotificationType,
  ScheduleType,
  NotificationStatus,
  VideoDocument,
  TelemetryEventDocument,
} from '../types';
import { getFormattedDate } from './utils';

// Set Firestore log level to silent to handle connection notices quietly
setLogLevel('silent');

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Mandatory named Firestore database instance ID
export const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || 'ai-studio-shortxxadmindash-86192a98-919e-436c-80b9-836d96e0e32b';

// Initialize Firestore targeting strictly the custom named Firestore database instance
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

// Collection References
const USERS_COLLECTION = 'users';
const EVENTS_COLLECTION = 'events';
const DAILY_ANALYTICS_COLLECTION = 'daily_analytics';
const ADMIN_ANALYTICS_COLLECTION = 'admin_analytics';
const NOTIFICATIONS_COLLECTION = 'notifications';
const VIDEOS_COLLECTION = 'videos';
const APP_STATS_DOC = 'app_stats';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path,
  };
  console.warn('Firestore Notice: ', errInfo.error);
}

/**
 * Subscribe in real-time to all users in Firestore
 */
let hasAttemptedSeed = false;

export function subscribeToUsers(
  onData: (users: UserDocument[]) => void,
  onError?: (err: Error) => void
) {
  const usersRef = collection(db, USERS_COLLECTION);
  return onSnapshot(
    usersRef,
    (snapshot) => {
      if (snapshot.empty && !hasAttemptedSeed) {
        hasAttemptedSeed = true;
        seedDemoData().catch((err) => {
          console.warn('Auto-seed notice:', err);
        });
      }

      const users: UserDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId || docSnap.id,
          country: data.country || 'GH',
          deviceType: (data.deviceType as DeviceType) || 'Mobile',
          trafficSource: data.trafficSource || 'Direct',
          status: (data.status as UserStatus) || 'Offline',
          totalDurationSeconds: typeof data.totalDurationSeconds === 'number' ? data.totalDurationSeconds : 0,
          lastActive: data.lastActive || new Date(),
          firstSeen: data.firstSeen || new Date(),
          currentPage: data.currentPage || '/',
          notificationsSubscribed: typeof data.notificationsSubscribed === 'boolean' ? data.notificationsSubscribed : true,
          totalDownloads: typeof data.totalDownloads === 'number' ? data.totalDownloads : Math.floor(Math.random() * 8) + 1,
        };
      });
      onData(users);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, USERS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe in real-time to daily analytics for a given date ("YYYY-MM-DD")
 */
export function subscribeToDailyAnalytics(
  dateStr: string,
  onData: (analytics: DailyAnalyticsDocument | null) => void,
  onError?: (err: Error) => void
) {
  const docRef = doc(db, DAILY_ANALYTICS_COLLECTION, dateStr);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onData({
          id: snapshot.id,
          date: data.date || snapshot.id,
          uniqueVisitors: Array.isArray(data.uniqueVisitors) ? data.uniqueVisitors : [],
          pageViews: typeof data.pageViews === 'number' ? data.pageViews : 0,
          appInstalls: typeof data.appInstalls === 'number' ? data.appInstalls : 0,
          hourlyTraffic: data.hourlyTraffic || {},
          trafficSources: data.trafficSources || {},
          deviceTypes: data.deviceTypes || {},
          countries: data.countries || {},
        });
      } else {
        onData(null);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `${DAILY_ANALYTICS_COLLECTION}/${dateStr}`);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all daily analytics documents (historical view)
 */
export function subscribeToAllDailyAnalytics(
  onData: (analyticsList: DailyAnalyticsDocument[]) => void,
  onError?: (err: Error) => void
) {
  const collRef = collection(db, DAILY_ANALYTICS_COLLECTION);
  return onSnapshot(
    collRef,
    (snapshot) => {
      const list: DailyAnalyticsDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          date: data.date || docSnap.id,
          uniqueVisitors: Array.isArray(data.uniqueVisitors) ? data.uniqueVisitors : [],
          pageViews: typeof data.pageViews === 'number' ? data.pageViews : 0,
          appInstalls: typeof data.appInstalls === 'number' ? data.appInstalls : 0,
          hourlyTraffic: data.hourlyTraffic || {},
          trafficSources: data.trafficSources || {},
          deviceTypes: data.deviceTypes || {},
          countries: data.countries || {},
        };
      });
      // Sort descending by date YYYY-MM-DD
      list.sort((a, b) => b.date.localeCompare(a.date));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, DAILY_ANALYTICS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe in real-time to all notifications in Firestore
 */
export function subscribeToNotifications(
  onData: (notifications: NotificationDocument[]) => void,
  onError?: (err: Error) => void
) {
  const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);
  return onSnapshot(
    notificationsRef,
    (snapshot) => {
      const items: NotificationDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: (data.type as NotificationType) || 'instant',
          template: data.template || '[photo] {name} just posted a video, checkout now',
          namesList: Array.isArray(data.namesList) ? data.namesList : [],
          imageUrl: data.imageUrl || '',
          targetUrl: data.targetUrl || 'index.html',
          scheduleType: (data.scheduleType as ScheduleType) || 'fixed',
          intervalHours: typeof data.intervalHours === 'number' ? data.intervalHours : 2,
          status: (data.status as NotificationStatus) || 'active',
          createdAt: data.createdAt || new Date(),
        };
      });
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, NOTIFICATIONS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Save or update a notification document in Firestore
 */
export async function saveNotificationDoc(notificationData: Omit<NotificationDocument, 'id'> & { id?: string }): Promise<string> {
  try {
    const isUpdate = !!notificationData.id;
    const docRef = isUpdate
      ? doc(db, NOTIFICATIONS_COLLECTION, notificationData.id!)
      : doc(collection(db, NOTIFICATIONS_COLLECTION));

    const payload: Record<string, any> = {
      type: notificationData.type || 'instant',
      template: notificationData.template || '[photo] {name} just posted a video, checkout now',
      namesList: Array.isArray(notificationData.namesList) ? notificationData.namesList : [],
      imageUrl: notificationData.imageUrl || '',
      targetUrl: notificationData.targetUrl || 'index.html',
      status: notificationData.status || 'active',
      createdAt: notificationData.createdAt ? notificationData.createdAt : serverTimestamp(),
    };

    if (notificationData.type === 'daily') {
      payload.scheduleType = notificationData.scheduleType || 'fixed';
      payload.intervalHours = notificationData.intervalHours || 2;
    }

    await setDoc(docRef, payload, { merge: true });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, NOTIFICATIONS_COLLECTION);
    throw err;
  }
}

/**
 * Delete a notification from Firestore
 */
export async function deleteNotificationDoc(id: string): Promise<void> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${NOTIFICATIONS_COLLECTION}/${id}`);
    throw err;
  }
}

/**
 * Toggle notification status between 'active' and 'paused'
 */
export async function toggleNotificationStatus(id: string, currentStatus: NotificationStatus): Promise<void> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    const newStatus: NotificationStatus = currentStatus === 'active' ? 'paused' : 'active';
    await updateDoc(docRef, { status: newStatus });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${NOTIFICATIONS_COLLECTION}/${id}`);
    throw err;
  }
}

/**
 * Toggle user notification subscription status
 */
export async function toggleUserNotificationSubscribed(userId: string, currentSubscribed: boolean): Promise<void> {
  try {
    const docRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(docRef, { notificationsSubscribed: !currentSubscribed });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
    throw err;
  }
}

/**
 * Subscribe in real-time to all videos in Firestore
 */
export function subscribeToVideos(
  onData: (videos: VideoDocument[]) => void,
  onError?: (err: Error) => void
) {
  const videosRef = collection(db, VIDEOS_COLLECTION);
  return onSnapshot(
    videosRef,
    (snapshot) => {
      const items: VideoDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          page_url: data.page_url || data.source_webpage || '',
          source_webpage: data.source_webpage || data.page_url || '',
          direct_url: data.direct_url || '',
          is_active: typeof data.is_active === 'boolean' ? data.is_active : true,
          created_at: data.created_at || new Date(),
          views: typeof data.views === 'number' ? data.views : 0,
          // Populated by the transcodeVideo Cloud Function; undefined on
          // legacy docs or ones not yet picked up by the pipeline.
          status: data.status || undefined,
          status_error: data.status_error || undefined,
          hls_url: data.hls_url || undefined,
          poster_url: data.poster_url || undefined,
        };
      });
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, VIDEOS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Save or update a video document in Firestore
 */
export async function saveVideoDoc(videoData: Omit<VideoDocument, 'id'> & { id?: string }): Promise<string> {
  try {
    const isUpdate = !!videoData.id;
    const docRef = isUpdate
      ? doc(db, VIDEOS_COLLECTION, videoData.id!)
      : doc(collection(db, VIDEOS_COLLECTION));

    const sourceWebpage = videoData.source_webpage || videoData.page_url || '';

    const payload: Record<string, any> = {
      direct_url: videoData.direct_url || '',
      source_webpage: sourceWebpage,
      page_url: sourceWebpage,
      is_active: typeof videoData.is_active === 'boolean' ? videoData.is_active : true,
      views: typeof videoData.views === 'number' ? videoData.views : 0,
      created_at: videoData.created_at ? videoData.created_at : serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, VIDEOS_COLLECTION);
    throw err;
  }
}

/**
 * Delete a video from Firestore
 */
export async function deleteVideoDoc(id: string): Promise<void> {
  try {
    const docRef = doc(db, VIDEOS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${VIDEOS_COLLECTION}/${id}`);
    throw err;
  }
}

/**
 * Toggle video is_active status
 */
export async function toggleVideoStatus(id: string, currentIsActive: boolean): Promise<void> {
  try {
    const docRef = doc(db, VIDEOS_COLLECTION, id);
    await updateDoc(docRef, { is_active: !currentIsActive });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${VIDEOS_COLLECTION}/${id}`);
    throw err;
  }
}

/**
 * Perform atomic increment (FieldValue.increment(1)) on the views field
 * inside the specific videos document in Firestore.
 */
export async function incrementVideoViews(videoIdOrUrl: string): Promise<void> {
  if (!videoIdOrUrl) return;
  try {
    // 1. Check if videoIdOrUrl matches a document ID directly
    const directRef = doc(db, VIDEOS_COLLECTION, videoIdOrUrl);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      await updateDoc(directRef, { views: increment(1) });
      return;
    }

    // 2. Search for matching direct_url or page_url
    const videosRef = collection(db, VIDEOS_COLLECTION);
    const qDirect = query(videosRef, where('direct_url', '==', videoIdOrUrl));
    const directQuerySnap = await getDocs(qDirect);
    if (!directQuerySnap.empty) {
      const matchDoc = directQuerySnap.docs[0];
      await updateDoc(doc(db, VIDEOS_COLLECTION, matchDoc.id), { views: increment(1) });
      return;
    }

    const qPage = query(videosRef, where('page_url', '==', videoIdOrUrl));
    const pageQuerySnap = await getDocs(qPage);
    if (!pageQuerySnap.empty) {
      const matchDoc = pageQuerySnap.docs[0];
      await updateDoc(doc(db, VIDEOS_COLLECTION, matchDoc.id), { views: increment(1) });
      return;
    }

    // 3. Fallback: If doc doesn't exist yet, merge views increment into videoIdOrUrl
    await setDoc(directRef, { views: increment(1), is_active: true, created_at: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn('Error incrementing video views:', videoIdOrUrl, err);
  }
}

/**
 * Fetches an active video stream directly and increments its view by 1
 */
export async function fetchNextVideoAndTrackView(excludeIds: string[] = []): Promise<VideoDocument | null> {
  try {
    const videosRef = collection(db, VIDEOS_COLLECTION);
    const q = query(videosRef, where('is_active', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return null;

    let eligible = snap.docs.filter((d) => !excludeIds.includes(d.id));
    if (eligible.length === 0) eligible = snap.docs;

    const chosenDoc = eligible[Math.floor(Math.random() * eligible.length)];
    const chosenId = chosenDoc.id;
    const docData = chosenDoc.data();

    // Increment view atomically in Firestore
    await updateDoc(doc(db, VIDEOS_COLLECTION, chosenId), { views: increment(1) });

    return {
      id: chosenId,
      direct_url: docData.direct_url || '',
      views: (typeof docData.views === 'number' ? docData.views : 0) + 1,
      is_active: docData.is_active ?? true,
      created_at: docData.created_at || new Date(),
    };
  } catch (err) {
    console.error('Error in fetchNextVideoAndTrackView:', err);
    return null;
  }
}

/**
 * Real-time listener for Total Views calculated by summing the 'views' field
 * across all documents in the 'videos' collection.
 */
export function subscribeToTotalViews(
  onData: (totalViews: number) => void,
  onError?: (err: Error) => void
) {
  const videosRef = collection(db, VIDEOS_COLLECTION);
  return onSnapshot(
    videosRef,
    (snapshot) => {
      let totalViews = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totalViews += typeof data.views === 'number' ? data.views : Number(data.views) || 0;
      });
      onData(totalViews);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, VIDEOS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for Views (24H) querying the 'events' collection for 'video_view' entries
 * generated within the last 24 hours.
 * Includes fallback checking for `createdAt` (ISO string) if `timestamp` (ServerTimestamp)
 * evaluates as null during immediate local writes.
 */
export function subscribeTo24hVideoViews(
  onData: (views24h: number) => void,
  onError?: (err: Error) => void
) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eventsRef = collection(db, EVENTS_COLLECTION);
  const q = query(
    eventsRef,
    where('event_type', '==', 'video_view'),
    where('timestamp', '>=', twentyFourHoursAgo)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      let views24h = 0;
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let tsMillis: number | null = null;

        if (data.timestamp) {
          if (typeof data.timestamp.toMillis === 'function') {
            tsMillis = data.timestamp.toMillis();
          } else if (data.timestamp instanceof Date) {
            tsMillis = data.timestamp.getTime();
          } else if (typeof data.timestamp === 'string' || typeof data.timestamp === 'number') {
            tsMillis = new Date(data.timestamp).getTime();
          }
        } else if (data.createdAt || data.created_at) {
          const raw = data.createdAt || data.created_at;
          tsMillis = typeof raw?.toMillis === 'function' ? raw.toMillis() : new Date(raw).getTime();
        } else {
          // If immediate local write where timestamp has not resolved from server, treat as current timestamp
          tsMillis = Date.now();
        }

        if (tsMillis !== null && !isNaN(tsMillis)) {
          if (tsMillis >= cutoffTime) {
            views24h++;
          }
        } else {
          views24h++;
        }
      });

      onData(views24h);
    },
    (err) => {
      console.warn('Notice: 24h video views composite query falling back to resilient listener:', err);
      // Fallback query by event_type with client-side 24h filtering
      const fallbackQuery = query(eventsRef, where('event_type', '==', 'video_view'));
      return onSnapshot(
        fallbackQuery,
        (fallbackSnap) => {
          let count = 0;
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          fallbackSnap.forEach((docSnap) => {
            const data = docSnap.data();
            let tsMillis: number | null = null;
            if (data.timestamp) {
              if (typeof data.timestamp.toMillis === 'function') {
                tsMillis = data.timestamp.toMillis();
              } else if (data.timestamp instanceof Date) {
                tsMillis = data.timestamp.getTime();
              } else if (typeof data.timestamp === 'string' || typeof data.timestamp === 'number') {
                tsMillis = new Date(data.timestamp).getTime();
              }
            } else if (data.createdAt || data.created_at) {
              const raw = data.createdAt || data.created_at;
              tsMillis = typeof raw?.toMillis === 'function' ? raw.toMillis() : new Date(raw).getTime();
            } else {
              tsMillis = Date.now();
            }

            if (tsMillis !== null && !isNaN(tsMillis) && tsMillis >= cutoff) {
              count++;
            }
          });
          onData(count);
        },
        (fallbackErr) => {
          handleFirestoreError(fallbackErr, OperationType.LIST, EVENTS_COLLECTION);
          if (onError) onError(fallbackErr);
        }
      );
    }
  );
}

export function subscribeToAdminAnalytics(
  onData: (data: AdminAnalyticsDocument) => void,
  onError?: (err: Error) => void
) {
  const docRef = doc(db, ADMIN_ANALYTICS_COLLECTION, APP_STATS_DOC);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onData({
          totalAppInstalls: typeof data.totalAppInstalls === 'number' ? data.totalAppInstalls : 0,
          totalGetAppClicks: typeof data.totalGetAppClicks === 'number' ? data.totalGetAppClicks : (data.totalAppInstalls || 0),
          totalUnmutes: typeof data.totalUnmutes === 'number' ? data.totalUnmutes : 0,
          totalHearts: typeof data.totalHearts === 'number' ? data.totalHearts : 0,
          totalProgressDrags: typeof data.totalProgressDrags === 'number' ? data.totalProgressDrags : 0,
        });
      } else {
        // Doc doesn't exist yet, seed initial 0
        setDoc(
          docRef,
          {
            totalAppInstalls: 0,
            totalGetAppClicks: 0,
            totalUnmutes: 0,
            totalHearts: 0,
            totalProgressDrags: 0,
          },
          { merge: true }
        ).catch((e) => console.warn('Init app_stats error:', e));
        onData({
          totalAppInstalls: 0,
          totalGetAppClicks: 0,
          totalUnmutes: 0,
          totalHearts: 0,
          totalProgressDrags: 0,
        });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `${ADMIN_ANALYTICS_COLLECTION}/${APP_STATS_DOC}`);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe in real-time to all telemetry events from tracking.js in Firestore
 */
export function subscribeToEvents(
  onData: (events: TelemetryEventDocument[]) => void,
  onError?: (err: Error) => void
) {
  const eventsRef = collection(db, EVENTS_COLLECTION);
  return onSnapshot(
    eventsRef,
    (snapshot) => {
      const items: TelemetryEventDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          event_type: data.event_type || 'page_view',
          userId: data.userId || 'ANONYMOUS',
          timestamp: data.timestamp || new Date(),
          user_agent: data.user_agent || '',
          device_type: (data.device_type as DeviceType) || 'Mobile',
          video_id: data.video_id || '',
          referrer: data.referrer || 'Direct',
          country: data.country || 'GH',
          details: data.details || '',
        };
      });
      // Client-side sort descending by timestamp for fast real-time ordering
      items.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
        return tB - tA;
      });
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, EVENTS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

/**
 * Log a telemetry event coming from client scripts (tracking.js, script.js, notification.js)
 */
export async function logTelemetryEvent(
  eventData: Omit<TelemetryEventDocument, 'id'>
): Promise<string> {
  const todayStr = getFormattedDate();
  const docRef = doc(collection(db, EVENTS_COLLECTION));
  const adminStatsRef = doc(db, ADMIN_ANALYTICS_COLLECTION, APP_STATS_DOC);
  const dailyAnalyticsRef = doc(db, DAILY_ANALYTICS_COLLECTION, todayStr);

  const payload: Record<string, any> = {
    event_type: eventData.event_type || 'page_view',
    userId: eventData.userId || 'ANONYMOUS',
    timestamp: eventData.timestamp || serverTimestamp(),
    user_agent: eventData.user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    device_type: eventData.device_type || 'Mobile',
    video_id: eventData.video_id || '',
    referrer: eventData.referrer || (typeof document !== 'undefined' ? document.referrer : 'Direct'),
    country: eventData.country || 'GH',
    details: eventData.details || '',
  };

  try {
    await setDoc(docRef, payload);

    const adminUpdates: Record<string, any> = {};
    const dailyUpdates: Record<string, any> = {};

    const type = eventData.event_type;
    if (type === 'get_app_click' || type === 'app_download_intent') {
      adminUpdates.totalGetAppClicks = increment(1);
      adminUpdates.totalAppInstalls = increment(1);
      dailyUpdates.getAppClicks = increment(1);
      dailyUpdates.appInstalls = increment(1);
    } else if (type === 'unmute_shake' || type === 'unmute') {
      adminUpdates.totalUnmutes = increment(1);
      dailyUpdates.unmuteShakes = increment(1);
    } else if (type === 'double_tap_heart' || type === 'heart') {
      adminUpdates.totalHearts = increment(1);
      dailyUpdates.doubleTapHearts = increment(1);
    } else if (type === 'progress_drag' || type === 'seek') {
      adminUpdates.totalProgressDrags = increment(1);
      dailyUpdates.progressDrags = increment(1);
    }

    // Atomically increment views on the specific video document in Firestore
    if (eventData.video_id) {
      await incrementVideoViews(eventData.video_id);
    } else if (type === 'video_view' || type === 'page_view') {
      const match = eventData.details?.match(/(?:video_id|vid|stream):\s*([a-zA-Z0-9_\-]+)/i);
      if (match && match[1]) {
        await incrementVideoViews(match[1]);
      }
    }

    if (Object.keys(adminUpdates).length > 0) {
      await setDoc(adminStatsRef, adminUpdates, { merge: true });
    }
    if (Object.keys(dailyUpdates).length > 0) {
      await setDoc(dailyAnalyticsRef, dailyUpdates, { merge: true });
    }

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, EVENTS_COLLECTION);
    throw err;
  }
}

/**
 * Track an APK download by incrementing admin_analytics/app_stats (totalAppInstalls & totalGetAppClicks)
 * and daily_analytics/YYYY-MM-DD (appInstalls)
 */
export async function trackAppDownload(userId: string = 'ANONYMOUS', country: string = 'GH', deviceType: DeviceType = 'Mobile'): Promise<number> {
  try {
    await logTelemetryEvent({
      event_type: 'get_app_click',
      userId,
      timestamp: new Date(),
      device_type: deviceType,
      country,
      details: 'User clicked Get App / APK Download Trigger',
    });

    const adminStatsRef = doc(db, ADMIN_ANALYTICS_COLLECTION, APP_STATS_DOC);
    const snap = await getDoc(adminStatsRef);
    return snap.exists() ? (snap.data().totalAppInstalls || 0) : 0;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${ADMIN_ANALYTICS_COLLECTION}/${APP_STATS_DOC}`);
    throw err;
  }
}

/**
 * Upsert or create a user in Firestore
 */
export async function saveUserDoc(user: Partial<UserDocument> & { userId: string }): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, user.userId);
  const userDoc: Record<string, any> = {
    userId: user.userId,
    country: user.country || 'GH',
    deviceType: user.deviceType || 'Mobile',
    trafficSource: user.trafficSource || 'google.com',
    status: user.status || 'Online',
    totalDurationSeconds: user.totalDurationSeconds ?? 120,
    lastActive: user.lastActive ? user.lastActive : serverTimestamp(),
    firstSeen: user.firstSeen ? user.firstSeen : serverTimestamp(),
    currentPage: user.currentPage || '/s/link-1',
  };

  await setDoc(docRef, userDoc, { merge: true });
}

/**
 * Update user status ("Online" / "Offline")
 */
export async function toggleUserStatus(userId: string, newStatus: UserStatus): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(docRef, {
    status: newStatus,
    lastActive: serverTimestamp(),
  });
}

/**
 * Delete a user from Firestore
 */
export async function deleteUserDoc(userId: string): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, userId);
  await deleteDoc(docRef);
}

/**
 * Record a page hit / event in today's daily_analytics doc
 */
export async function logPageViewEvent(
  userId: string,
  country: string,
  deviceType: DeviceType,
  trafficSource: string,
  customHour?: number
): Promise<void> {
  const todayStr = getFormattedDate();
  const currentHourStr = (customHour !== undefined ? customHour : new Date().getHours()).toString();
  const docRef = doc(db, DAILY_ANALYTICS_COLLECTION, todayStr);

  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    // Create new daily analytics document
    const initialHourly: Record<string, number> = {};
    for (let h = 0; h < 24; h++) initialHourly[h.toString()] = 0;
    initialHourly[currentHourStr] = 1;

    await setDoc(docRef, {
      date: todayStr,
      uniqueVisitors: [userId],
      pageViews: 1,
      hourlyTraffic: initialHourly,
      trafficSources: { [trafficSource]: 1 },
      deviceTypes: { [deviceType]: 1 },
      countries: { [country]: 1 },
    });
  } else {
    // Increment existing document fields
    const data = docSnap.data();
    const existingHourly = data.hourlyTraffic || {};
    const existingSources = data.trafficSources || {};
    const existingDevices = data.deviceTypes || {};
    const existingCountries = data.countries || {};

    existingHourly[currentHourStr] = (existingHourly[currentHourStr] || 0) + 1;
    existingSources[trafficSource] = (existingSources[trafficSource] || 0) + 1;
    existingDevices[deviceType] = (existingDevices[deviceType] || 0) + 1;
    existingCountries[country] = (existingCountries[country] || 0) + 1;

    await updateDoc(docRef, {
      pageViews: increment(1),
      uniqueVisitors: arrayUnion(userId),
      hourlyTraffic: existingHourly,
      trafficSources: existingSources,
      deviceTypes: existingDevices,
      countries: existingCountries,
    });
  }
}

/**
 * Seed initial realistic demo data if collection is empty
 */
export async function seedDemoData(): Promise<{ userCount: number }> {
  const sampleUsers: Array<Omit<UserDocument, 'id'>> = [
    {
      userId: 'GH2156790',
      country: 'GH',
      deviceType: 'Mobile',
      trafficSource: 'google.com',
      status: 'Online',
      totalDurationSeconds: 4462, // 01h 14m 22s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 36000000),
      currentPage: '/s/ghana-tech-trends',
    },
    {
      userId: 'US9021481',
      country: 'US',
      deviceType: 'Desktop',
      trafficSource: 'instagram.com',
      status: 'Online',
      totalDurationSeconds: 2715, // 00h 45m 15s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 18000000),
      currentPage: '/dashboard/campaigns',
    },
    {
      userId: 'GH7841029',
      country: 'GH',
      deviceType: 'Mobile',
      trafficSource: 'Direct',
      status: 'Online',
      totalDurationSeconds: 8940, // 02h 29m 00s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 50000000),
      currentPage: '/s/shortxx-pro',
    },
    {
      userId: 'GB4410822',
      country: 'GB',
      deviceType: 'Tablet',
      trafficSource: 'twitter.com',
      status: 'Online',
      totalDurationSeconds: 1530, // 00h 25m 30s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 7200000),
      currentPage: '/s/london-meetup',
    },
    {
      userId: 'NG2348910',
      country: 'NG',
      deviceType: 'Mobile',
      trafficSource: 'instagram.com',
      status: 'Online',
      totalDurationSeconds: 5820, // 01h 37m 00s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 12000000),
      currentPage: '/s/lagos-creators',
    },
    {
      userId: 'DE4912093',
      country: 'DE',
      deviceType: 'Desktop',
      trafficSource: 'google.com',
      status: 'Offline',
      totalDurationSeconds: 12450, // 03h 27m 30s
      lastActive: new Date(Date.now() - 14400000),
      firstSeen: new Date(Date.now() - 86400000),
      currentPage: '/pricing',
    },
    {
      userId: 'CA1029384',
      country: 'CA',
      deviceType: 'Desktop',
      trafficSource: 'facebook.com',
      status: 'Offline',
      totalDurationSeconds: 6120, // 01h 42m 00s
      lastActive: new Date(Date.now() - 3600000),
      firstSeen: new Date(Date.now() - 43200000),
      currentPage: '/blog/short-links-guide',
    },
    {
      userId: 'JP8190234',
      country: 'JP',
      deviceType: 'Mobile',
      trafficSource: 'youtube.com',
      status: 'Online',
      totalDurationSeconds: 3410, // 00h 56m 50s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 9000000),
      currentPage: '/s/tokyo-design',
    },
    {
      userId: 'GH3301928',
      country: 'GH',
      deviceType: 'Desktop',
      trafficSource: 'google.com',
      status: 'Offline',
      totalDurationSeconds: 780, // 00h 13m 00s
      lastActive: new Date(Date.now() - 1800000),
      firstSeen: new Date(Date.now() - 25000000),
      currentPage: '/docs/api',
    },
    {
      userId: 'FR3398120',
      country: 'FR',
      deviceType: 'Mobile',
      trafficSource: 'Direct',
      status: 'Offline',
      totalDurationSeconds: 3900, // 01h 05m 00s
      lastActive: new Date(Date.now() - 7200000),
      firstSeen: new Date(Date.now() - 50000000),
      currentPage: '/s/paris-fashion-week',
    },
    {
      userId: 'US8820194',
      country: 'US',
      deviceType: 'Tablet',
      trafficSource: 'google.com',
      status: 'Online',
      totalDurationSeconds: 11200, // 03h 06m 40s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 60000000),
      currentPage: '/analytics/realtime',
    },
    {
      userId: 'GH5581902',
      country: 'GH',
      deviceType: 'Mobile',
      trafficSource: 'instagram.com',
      status: 'Online',
      totalDurationSeconds: 1940, // 00h 32m 20s
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 4000000),
      currentPage: '/s/accra-events-2026',
    },
    {
      userId: 'IN9102834',
      country: 'IN',
      deviceType: 'Mobile',
      trafficSource: 'youtube.com',
      status: 'Offline',
      totalDurationSeconds: 4320,
      lastActive: new Date(Date.now() - 10800000),
      firstSeen: new Date(Date.now() - 36000000),
      currentPage: '/s/mumbai-code',
    },
    {
      userId: 'BR5591023',
      country: 'BR',
      deviceType: 'Mobile',
      trafficSource: 'twitter.com',
      status: 'Online',
      totalDurationSeconds: 2890,
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 8000000),
      currentPage: '/s/sao-paulo-tech',
    },
    {
      userId: 'US4419082',
      country: 'US',
      deviceType: 'Desktop',
      trafficSource: 'Direct',
      status: 'Online',
      totalDurationSeconds: 15420,
      lastActive: new Date(),
      firstSeen: new Date(Date.now() - 90000000),
      currentPage: '/s/dev-docs-v2',
    }
  ];

  // Save users into Firestore
  for (const user of sampleUsers) {
    await saveUserDoc(user);
  }

  // Generate realistic daily_analytics for today
  const todayStr = getFormattedDate();
  const hourlyTraffic: Record<string, number> = {};
  const currentHour = new Date().getHours();

  for (let h = 0; h < 24; h++) {
    if (h <= currentHour) {
      // Curve with peak around hours 10-16
      const base = h >= 9 && h <= 17 ? Math.floor(Math.random() * 45) + 35 : Math.floor(Math.random() * 18) + 5;
      hourlyTraffic[h.toString()] = base;
    } else {
      hourlyTraffic[h.toString()] = 0;
    }
  }

  const uniqueVisitorIds = sampleUsers.map((u) => u.userId);
  const totalPageViews = Object.values(hourlyTraffic).reduce((a, b) => a + b, 0);

  const docRef = doc(db, DAILY_ANALYTICS_COLLECTION, todayStr);
  await setDoc(docRef, {
    date: todayStr,
    uniqueVisitors: uniqueVisitorIds,
    pageViews: totalPageViews,
    hourlyTraffic,
    trafficSources: {
      'google.com': 328,
      'instagram.com': 214,
      'Direct': 185,
      'twitter.com': 142,
      'facebook.com': 98,
      'youtube.com': 65,
    },
    deviceTypes: {
      Mobile: 520,
      Desktop: 380,
      Tablet: 132,
    },
    countries: {
      GH: 380,
      US: 290,
      GB: 145,
      NG: 98,
      DE: 54,
      CA: 42,
      JP: 23,
    },
  });

  return { userCount: sampleUsers.length };
}
