import { Timestamp } from 'firebase/firestore';

export type DeviceType = 'Mobile' | 'Desktop' | 'Tablet';
export type UserStatus = 'Online' | 'Offline';
export type ThemeMode = 'dark' | 'light';

export interface UserDocument {
  id: string; // Firestore doc ID (usually matches userId)
  userId: string; // e.g. "GH2156790"
  country: string; // e.g. "GH", "US"
  deviceType: DeviceType;
  trafficSource: string; // e.g. "google.com", "instagram.com", "Direct"
  status: UserStatus;
  totalDurationSeconds: number;
  lastActive: Timestamp | Date | number | any;
  firstSeen: Timestamp | Date | number | any;
  currentPage: string;
  notificationsSubscribed?: boolean; // true = Subscribed, false = Not Subscribed
  totalDownloads?: number; // counter of downloads completed
}

export type NotificationType = 'instant' | 'daily';
export type ScheduleType = 'fixed' | 'random';
export type NotificationStatus = 'active' | 'paused';

export type VideoTranscodeStatus = 'processing' | 'ready' | 'failed';

export interface VideoDocument {
  id: string;
  page_url?: string;
  source_webpage?: string;
  direct_url: string;
  is_active: boolean;
  created_at: Timestamp | Date | number | any;
  views: number;
  // Adaptive HLS pipeline fields (written by the transcodeVideo Cloud Function,
  // never set directly from the admin dashboard). Absent on legacy docs that
  // haven't been picked up by the pipeline yet - always treat as optional.
  status?: VideoTranscodeStatus;
  status_error?: string;
  hls_url?: string;
  poster_url?: string;
}

export interface NotificationDocument {
  id: string; // Auto-generated string
  type: NotificationType; // "instant" | "daily"
  template: string; // e.g., "[photo] {name} just posted a video, checkout now"
  namesList: string[]; // e.g., ["Sarah", "Jessica", "Amanda"]
  imageUrl?: string; // base64 string or CDN URL
  targetUrl: string; // default "index.html"
  scheduleType?: ScheduleType; // "fixed" | "random" [Only for "daily"]
  intervalHours?: number; // [Only for "daily"]
  status: NotificationStatus; // "active" | "paused"
  createdAt: Timestamp | Date | number | any;
}

export interface DailyAnalyticsDocument {
  id: string; // Date string "YYYY-MM-DD"
  date: string; // "YYYY-MM-DD"
  uniqueVisitors: string[]; // custom user IDs
  pageViews: number;
  appInstalls?: number;
  getAppClicks?: number;
  unmuteShakes?: number;
  doubleTapHearts?: number;
  progressDrags?: number;
  eventBreakdown?: Record<string, number>;
  hourlyTraffic: Record<string, number>; // "0".."23" -> hit count
  trafficSources: Record<string, number>; // "google.com" -> count
  deviceTypes: Record<string, number>; // "Mobile" -> count
  countries: Record<string, number>; // "GH" -> count
}

export interface AdminAnalyticsDocument {
  totalAppInstalls: number;
  totalGetAppClicks?: number;
  totalUnmutes?: number;
  totalHearts?: number;
  totalProgressDrags?: number;
}

export type TelemetryEventType =
  | 'get_app_click'
  | 'app_download_intent'
  | 'unmute_shake'
  | 'pause'
  | 'double_tap_heart'
  | 'progress_drag'
  | 'page_view'
  | 'new_session'
  | string;

export interface TelemetryEventDocument {
  id: string;
  event_type: TelemetryEventType;
  userId: string;
  timestamp: Timestamp | Date | number | any;
  user_agent?: string;
  device_type: DeviceType;
  video_id?: string;
  referrer?: string;
  country?: string;
  details?: string;
}

export interface UserFilterState {
  searchQuery: string;
  status: 'All' | 'Online' | 'Offline';
  deviceType: 'All' | 'Mobile' | 'Desktop' | 'Tablet';
  country: string;
  sortBy: 'durationDesc' | 'durationAsc' | 'recentActive' | 'userId';
}

export interface LiveActivityEvent {
  id: string;
  timestamp: Date;
  userId: string;
  country: string;
  deviceType: DeviceType;
  action:
    | 'PAGE_VIEW'
    | 'STATUS_CHANGE'
    | 'NEW_SESSION'
    | 'PING'
    | 'GET_APP_CLICK'
    | 'APP_DOWNLOAD_INTENT'
    | 'UNMUTE_SHAKE'
    | 'DOUBLE_TAP_HEART'
    | 'PROGRESS_DRAG'
    | 'PAUSE';
  details: string;
  videoId?: string;
}

export type DateRangePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'custom';

export interface DateRangeState {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD or empty
  endDate: string;   // YYYY-MM-DD or empty
}
