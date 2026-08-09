import { saveUserDoc, logPageViewEvent, toggleUserStatus } from './firebase';
import { DeviceType } from '../types';

const VISITOR_STORAGE_KEY = 'shortxx_real_visitor_id';

/**
 * Detect real device type from userAgent
 */
export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'Desktop';
  const ua = navigator.userAgent || '';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'Tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|mini|windows\s+ce|palm/i.test(ua)) {
    return 'Mobile';
  }
  return 'Desktop';
}

/**
 * Detect real traffic source from document.referrer
 */
export function detectTrafficSource(): string {
  if (typeof window === 'undefined') return 'Direct';
  const ref = document.referrer;
  if (!ref) return 'Direct';

  try {
    const url = new URL(ref);
    const host = url.hostname.replace(/^www\./, '');
    if (!host || host === window.location.hostname) return 'Direct';
    return host;
  } catch {
    return 'Direct';
  }
}

/**
 * Detect country ISO code from timezone or language
 */
export function detectCountry(): string {
  if (typeof window === 'undefined') return 'GH';

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Accra') || tz.includes('Ghana')) return 'GH';
    if (tz.includes('Lagos') || tz.includes('Nigeria')) return 'NG';
    if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('America')) return 'US';
    if (tz.includes('London') || tz.includes('Europe/London')) return 'GB';
    if (tz.includes('Berlin') || tz.includes('Paris') || tz.includes('Europe')) return 'DE';
    if (tz.includes('Tokyo') || tz.includes('Asia/Tokyo')) return 'JP';
    if (tz.includes('Kolkata') || tz.includes('India')) return 'IN';
    if (tz.includes('Sao_Paulo') || tz.includes('Brazil')) return 'BR';
    if (tz.includes('Toronto') || tz.includes('Vancouver')) return 'CA';

    const lang = navigator.language || '';
    const parts = lang.split('-');
    if (parts.length > 1 && parts[1].length === 2) {
      return parts[1].toUpperCase();
    }
  } catch (e) {
    console.warn('Country detection fallback used:', e);
  }

  return 'GH';
}

/**
 * Get or create a persistent real visitor ID for this browser
 */
export function getOrCreateVisitorId(country: string): string {
  if (typeof window === 'undefined') return 'V_LIVE';
  let storedId = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (!storedId) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    storedId = `${country}${randomHex}`;
    localStorage.setItem(VISITOR_STORAGE_KEY, storedId);
  }
  return storedId;
}

/**
 * Real-time visitor tracking session runner
 */
export class RealWebsiteTracker {
  private visitorId: string;
  private country: string;
  private deviceType: DeviceType;
  private trafficSource: string;
  private sessionStartTime: number;
  private durationSeconds: number = 0;
  private heartbeatInterval: any = null;
  private currentPage: string;

  constructor() {
    this.country = detectCountry();
    this.deviceType = detectDeviceType();
    this.trafficSource = detectTrafficSource();
    this.visitorId = getOrCreateVisitorId(this.country);
    this.currentPage = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
    this.sessionStartTime = Date.now();
  }

  public async startTracking(onTick?: (seconds: number) => void): Promise<string> {
    // 1. Initial hit logging
    await saveUserDoc({
      userId: this.visitorId,
      country: this.country,
      deviceType: this.deviceType,
      trafficSource: this.trafficSource,
      status: 'Online',
      currentPage: this.currentPage,
      totalDurationSeconds: 0,
      lastActive: new Date(),
    });

    await logPageViewEvent(
      this.visitorId,
      this.country,
      this.deviceType,
      this.trafficSource
    );

    // 2. Setup periodic active heartbeat (every 5 seconds)
    this.heartbeatInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        this.durationSeconds += 5;
        if (onTick) onTick(this.durationSeconds);

        await saveUserDoc({
          userId: this.visitorId,
          country: this.country,
          deviceType: this.deviceType,
          trafficSource: this.trafficSource,
          status: 'Online',
          currentPage: window.location.pathname || '/',
          totalDurationSeconds: this.durationSeconds,
          lastActive: new Date(),
        });
      }
    }, 5000);

    // 3. Mark offline on unload or page hide
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        toggleUserStatus(this.visitorId, 'Offline').catch(() => {});
      });
    }

    return this.visitorId;
  }

  public stopTracking() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    toggleUserStatus(this.visitorId, 'Offline').catch(() => {});
  }

  public getVisitorInfo() {
    return {
      visitorId: this.visitorId,
      country: this.country,
      deviceType: this.deviceType,
      trafficSource: this.trafficSource,
      durationSeconds: this.durationSeconds,
    };
  }

  public async recordPageView(pagePath?: string) {
    const page = pagePath || window.location.pathname || '/';
    this.currentPage = page;
    await saveUserDoc({
      userId: this.visitorId,
      country: this.country,
      deviceType: this.deviceType,
      trafficSource: this.trafficSource,
      status: 'Online',
      currentPage: page,
      lastActive: new Date(),
    });

    await logPageViewEvent(
      this.visitorId,
      this.country,
      this.deviceType,
      this.trafficSource
    );
  }
}
