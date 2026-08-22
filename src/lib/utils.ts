import { UserDocument } from '../types';

/**
 * Format total duration in seconds into "01h 14m 22s" or "00m 45s"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00h 00m 00s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num: number) => num.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
  }
  return `00h ${pad(mins)}m ${pad(secs)}s`;
}

/**
 * Convert country ISO code (2 chars) to Emoji flag and name
 */
const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  GH: { name: 'Ghana', flag: '🇬🇭' },
  US: { name: 'United States', flag: '🇺🇸' },
  GB: { name: 'United Kingdom', flag: '🇬🇧' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  NG: { name: 'Nigeria', flag: '🇳🇬' },
  DE: { name: 'Germany', flag: '🇩🇪' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  FR: { name: 'France', flag: '🇫🇷' },
  IN: { name: 'India', flag: '🇮🇳' },
  BR: { name: 'Brazil', flag: '🇧🇷' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  ZA: { name: 'South Africa', flag: '🇿🇦' },
  KE: { name: 'Kenya', flag: '🇰🇪' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪' },
  CN: { name: 'China', flag: '🇨🇳' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  ES: { name: 'Spain', flag: '🇪🇸' },
  IT: { name: 'Italy', flag: '🇮🇹' },
  MX: { name: 'Mexico', flag: '🇲🇽' },
  NL: { name: 'Netherlands', flag: '🇳🇱' },
  SE: { name: 'Sweden', flag: '🇸🇪' },
  CH: { name: 'Switzerland', flag: '🇨🇭' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  EG: { name: 'Egypt', flag: '🇪🇬' },
  CI: { name: 'Ivory Coast', flag: '🇨🇮' },
  SN: { name: 'Senegal', flag: '🇸🇳' },
  MA: { name: 'Morocco', flag: '🇲🇦' },
  RU: { name: 'Russia', flag: '🇷🇺' },
  AR: { name: 'Argentina', flag: '🇦🇷' },
  CL: { name: 'Chile', flag: '🇨🇱' },
  CO: { name: 'Colombia', flag: '🇨🇴' },
  PK: { name: 'Pakistan', flag: '🇵🇰' },
  ID: { name: 'Indonesia', flag: '🇮🇩' },
  TH: { name: 'Thailand', flag: '🇹🇭' },
  VN: { name: 'Vietnam', flag: '🇻🇳' },
  PH: { name: 'Philippines', flag: '🇵🇭' },
  NZ: { name: 'New Zealand', flag: '🇳🇿' },
  IE: { name: 'Ireland', flag: '🇮🇪' },
  BE: { name: 'Belgium', flag: '🇧🇪' },
  PT: { name: 'Portugal', flag: '🇵🇹' },
  PL: { name: 'Poland', flag: '🇵🇱' },
};

export function getCountryInfo(code: string): { name: string; flag: string } {
  const upper = (code || '').toUpperCase();
  if (COUNTRY_MAP[upper]) {
    return COUNTRY_MAP[upper];
  }
  // Generic fallback flag generator from ISO 2 country code
  if (upper.length === 2) {
    const codePoints = upper
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    try {
      const flag = String.fromCodePoint(...codePoints);
      return { name: upper, flag };
    } catch {
      return { name: upper, flag: '🌐' };
    }
  }
  return { name: upper || 'Unknown', flag: '🌐' };
}

/**
 * Format Firestore timestamp or Date to relative string ("2s ago", "1m ago", "5h ago")
 */
export function formatTimeAgo(timestamp: any): string {
  if (!timestamp) return 'Never';
  let date: Date;
  if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    return 'Just now';
  }

  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format timestamp to clock format "14:22:05"
 */
export function formatClockTime(timestamp: any): string {
  if (!timestamp) return '--:--:--';
  let date: Date;
  if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Get YYYY-MM-DD string for today or offset days
 */
export function getFormattedDate(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determine if a user is active within last 30 seconds
 */
export function isUserActiveWithin(user: UserDocument, secondsWindow: number = 30): boolean {
  if (user.status !== 'Online') return false;
  if (!user.lastActive) return true;
  
  let lastActiveMs = 0;
  if (user.lastActive?.toMillis && typeof user.lastActive.toMillis === 'function') {
    lastActiveMs = user.lastActive.toMillis();
  } else if (user.lastActive?.toDate && typeof user.lastActive.toDate === 'function') {
    lastActiveMs = user.lastActive.toDate().getTime();
  } else if (user.lastActive instanceof Date) {
    lastActiveMs = user.lastActive.getTime();
  } else if (typeof user.lastActive === 'number') {
    lastActiveMs = user.lastActive;
  } else {
    lastActiveMs = new Date(user.lastActive).getTime();
  }

  const diffMs = Date.now() - lastActiveMs;
  return diffMs <= secondsWindow * 1000;
}

/**
 * Convert any timestamp/Date/string into "YYYY-MM-DD"
 */
export function getDateStrFromTimestamp(timestamp: any): string {
  if (!timestamp) return getFormattedDate(0);
  let date: Date;
  if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'string') {
    if (timestamp.length === 10 && timestamp.includes('-')) return timestamp;
    date = new Date(timestamp);
  } else {
    return getFormattedDate(0);
  }

  if (isNaN(date.getTime())) return getFormattedDate(0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a "YYYY-MM-DD" date string falls between startDate and endDate
 */
export function isDateInRange(dateStr: string, startDate?: string, endDate?: string): boolean {
  if (!dateStr) return true;
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

/**
 * Check if a UserDocument falls into the date range (based on lastActive or firstSeen)
 */
export function isUserInDateRange(user: UserDocument, startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return true;
  const userLastActiveDate = getDateStrFromTimestamp(user.lastActive || user.firstSeen);
  const userFirstSeenDate = getDateStrFromTimestamp(user.firstSeen || user.lastActive);
  
  return (
    isDateInRange(userLastActiveDate, startDate, endDate) ||
    isDateInRange(userFirstSeenDate, startDate, endDate)
  );
}

/**
 * Get start and end YYYY-MM-DD dates for presets
 */
export function getPresetDates(preset: string): { startDate: string; endDate: string } {
  const today = getFormattedDate(0);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday':
      return { startDate: getFormattedDate(1), endDate: getFormattedDate(1) };
    case '7days':
      return { startDate: getFormattedDate(6), endDate: today };
    case '30days':
      return { startDate: getFormattedDate(29), endDate: today };
    case 'thisMonth': {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { startDate: monthStart, endDate: today };
    }
    case 'all':
    default:
      return { startDate: '', endDate: '' };
  }
}
