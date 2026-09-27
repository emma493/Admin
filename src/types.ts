import { Timestamp } from 'firebase/firestore';

export type DeviceType = 'Mobile' | 'Desktop' | 'Tablet';
export type UserStatus = 'Online' | 'Offline';
export type ThemeMode = 'dark' | 'light';

// User tab taxonomy (spec §1–§3). All new fields optional so legacy docs keep working.
export type AppType = 'PWA' | 'Browser';
export type ReferralGroup = 'Direct' | 'Google' | 'Organic' | 'Social';
export type AuthProvider = 'google' | 'email' | 'guest';

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
  // §1 Device & Platform Insights
  appType?: AppType; // PWA Installed vs Web Browser
  isPWA?: boolean; // true when launched in standalone display mode
  referralGroup?: ReferralGroup; // normalized Direct/Google/Organic/Social
  countrySource?: 'client-locale' | 'ip-api' | 'manual'; // how country was resolved (no raw IP stored)
  // §2 Engagement & Consumption
  videosWatched?: number; // clips watched past 80% completion
  totalSaves?: number; // bookmark/save button taps
  // §3 Auth & Session Intelligence
  authProvider?: AuthProvider; // google | email | guest
}

export type VideoTranscodeStatus = 'processing' | 'ready' | 'failed';

export type NavigationTab = 'videos' | 'analytics' | 'pipeline';

export interface CreatorDocument {
  id: string;
  username: string;
  avatarUrl?: string;
  is_active?: boolean;
  // Owner-chosen group (Girls/Couples), set on the Creators page form.
  // Optional so legacy docs keep working; badge falls back to video majority.
  category?: VideoCategory;
  created_at: Timestamp | Date | number | any;
}

export type VideoCategory = 'girls' | 'couples';

export interface VideoDocument {
  id: string;
  page_url?: string;
  source_webpage?: string;
  direct_url: string;
  // Beta: which creator owns this video + which group it belongs to.
  // Optional so legacy docs (pre-Beta) keep working on the public site.
  creatorId?: string;
  category?: VideoCategory;
  // Beta SEO: AI-suggested caption + hashtags (Session B reads these for
  // on-play display + hashtag/caption search). Optional, merge-safe.
  caption?: string;
  hashtags?: string[];
  is_active: boolean;
  created_at: Timestamp | Date | number | any;
  views: number;
  // Engagement fields written by public site (shortxx.live Session B).
  // Optional + merge-safe: Admin must never overwrite/reset these.
  likes?: number;
  // Adaptive HLS pipeline fields (written by the transcodeVideo Cloud Function,
  // never set directly from the admin dashboard). Absent on legacy docs that
  // haven't been picked up by the pipeline yet - always treat as optional.
  status?: VideoTranscodeStatus;
  status_error?: string;
  hls_url?: string;
  poster_url?: string;
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
  authProvider: 'All' | AuthProvider;
  appType: 'All' | AppType;
  referralGroup: 'All' | ReferralGroup;
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
