import React, { useState } from 'react';
import {
  Smartphone,
  Laptop,
  Tablet as TabletIcon,
  Globe,
  Compass,
  Link2,
} from 'lucide-react';
import { DeviceType } from '../types';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

/**
 * Official Shortxx App Logo matching user uploaded SX logo
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
}) => {
  const sizeMap = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const imgSizeClass = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex items-center gap-2.5 flex-shrink-0 ${className}`}>
      <img
        src="/logo.svg"
        alt="Shortxx Logo"
        className={`${imgSizeClass} object-contain rounded-xl shadow-md flex-shrink-0`}
      />
      {showText && (
        <div className="truncate">
          <span className="text-lg font-black tracking-tight text-white">
            Short<span className="text-red-600">xx</span>
          </span>
        </div>
      )}
    </div>
  );
};

interface CountryFlagProps {
  code: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
}

/**
 * HD Country Flag component utilizing Flagcdn for real official high-res flags
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  code = '',
  className = '',
  size = 'md',
  showName = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const cleanCode = (code || '').trim().toLowerCase();
  const isIso2 = cleanCode.length === 2;

  // Size dimensions map
  const sizeMap = {
    xs: 'w-4 h-3 text-[10px]',
    sm: 'w-5 h-3.5 text-xs',
    md: 'w-6 h-4 text-sm',
    lg: 'w-8 h-5.5 text-base',
    xl: 'w-10 h-7 text-lg',
  };

  const imgSizeClass = sizeMap[size] || sizeMap.md;

  // Fallback Emoji flag from ISO code
  const getEmojiFlag = (iso: string) => {
    if (iso.length !== 2) return '🌐';
    const codePoints = iso
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
      {isIso2 && !imageError ? (
        <img
          src={`https://flagcdn.com/w80/${cleanCode}.png`}
          srcSet={`https://flagcdn.com/w160/${cleanCode}.png 2x`}
          alt={`${cleanCode.toUpperCase()} Flag`}
          onError={() => setImageError(true)}
          className={`${imgSizeClass} object-cover rounded-xs shadow-xs border border-black/15 dark:border-white/20 flex-shrink-0 transition-opacity duration-200`}
          loading="lazy"
        />
      ) : (
        <span className="flex-shrink-0 leading-none">{getEmojiFlag(cleanCode)}</span>
      )}
    </span>
  );
};

interface SocialLogoProps {
  name: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * Official Real Social Media and Traffic Source Brand Logos (Exact SVG Vectors)
 */
export const SocialLogo: React.FC<SocialLogoProps> = ({
  name = '',
  className = '',
  size = 'md',
  showLabel = false,
}) => {
  const normName = name.toLowerCase().trim();

  const iconSizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const sizeClass = iconSizes[size] || iconSizes.md;

  // 1. GOOGLE / ORGANIC SEARCH
  if (normName.includes('google') || normName.includes('organic') || normName.includes('search')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0`} viewBox="0 0 24 24" fill="none">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 2. FACEBOOK
  if (normName.includes('facebook') || normName === 'fb') {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-sm`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#1877F2" />
          <path
            d="M16.5 12H13.5V21H9.75V12H8V8.85H9.75V6.85C9.75 5.12 10.63 3.75 13.12 3.75H15.75V6.85H14.12C13.25 6.85 13.12 7.22 13.12 7.82V8.85H16.12L15.68 12H16.5Z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 3. INSTAGRAM
  if (normName.includes('instagram') || normName === 'ig') {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-md`} viewBox="0 0 24 24" fill="none">
          <defs>
            <radialGradient id="igGrad" cx="30%" cy="107%" r="120%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="5%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill="url(#igGrad)" />
          <path
            d="M12 7.1A4.9 4.9 0 1016.9 12 4.9 4.9 0 0012 7.1zm0 8.1A3.2 3.2 0 1115.2 12 3.2 3.2 0 0112 15.2zm5.2-8.5a1.15 1.15 0 11-1.15-1.15 1.15 1.15 0 011.15 1.15zm2.8 1.18a4.93 4.93 0 00-1.34-3.5 4.93 4.93 0 00-3.5-1.34C13.79 3 10.21 3 8.8 3.1A4.93 4.93 0 005.3 4.44a4.93 4.93 0 00-1.34 3.5C3.86 9.35 3.86 12.93 3.96 14.34a4.93 4.93 0 001.34 3.5 4.93 4.93 0 003.5 1.34c1.41.1 4.99.1 6.4 0a4.93 4.93 0 003.5-1.34 4.93 4.93 0 001.34-3.5c.1-1.41.1-4.99 0-6.4zm-1.8 7.56a3.2 3.2 0 01-1.8 1.8c-1.13.45-3.8.35-5.2.35s-4.07.1-5.2-.35a3.2 3.2 0 01-1.8-1.8c-.45-1.13-.35-3.8-.35-5.2s-.1-4.07.35-5.2a3.2 3.2 0 011.8-1.8c1.13-.45 3.8-.35 5.2-.35s4.07-.1 5.2.35a3.2 3.2 0 011.8 1.8c.45 1.13.35 3.8.35 5.2s.1 4.07-.35 5.2z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 4. TIKTOK
  if (normName.includes('tiktok')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-sm`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#010101" />
          <path
            d="M16.6 8.2a4.8 4.8 0 01-3.1-1.1v6.8a4.3 4.3 0 11-4.3-4.3c.3 0 .6 0 .9.1V12a2.3 2.3 0 101.4 2.1V4h2a4.8 4.8 0 003.1 2.2v2z"
            fill="#25F4EE"
          />
          <path
            d="M16.1 7.7a4.8 4.8 0 01-3.1-1.1v6.8a4.3 4.3 0 11-4.3-4.3c.3 0 .6 0 .9.1V12a2.3 2.3 0 101.4 2.1V4h2a4.8 4.8 0 003.1 2.2v1.5z"
            fill="#FE2C55"
          />
          <path
            d="M15.8 7.5a4.8 4.8 0 01-3.1-1.1v6.8a4.3 4.3 0 11-4.3-4.3c.3 0 .6 0 .9.1V12a2.3 2.3 0 101.4 2.1V4h2a4.8 4.8 0 003.1 2.2V7.5z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 5. TWITTER / X
  if (normName.includes('twitter') || normName === 'x' || normName.includes('x.com')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-sm`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#000000" />
          <path
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 6. YOUTUBE
  if (normName.includes('youtube') || normName.includes('yt')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-sm`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#FF0000" />
          <path d="M10 8.5v7l6-3.5-6-3.5z" fill="white" />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 7. LINKEDIN
  if (normName.includes('linkedin')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-sm`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#0A66C2" />
          <path
            d="M6.5 9h2.5v9H6.5V9zm1.25-4c.8 0 1.45.65 1.45 1.45S8.55 7.9 7.75 7.9 6.3 7.25 6.3 6.45 6.95 5 7.75 5zM11 9h2.4v1.2h.03c.33-.63 1.15-1.3 2.37-1.3 2.54 0 3 1.67 3 3.84V18h-2.5v-4.6c0-1.1-.02-2.5-1.52-2.5-1.52 0-1.76 1.2-1.76 2.42V18H11V9z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 8. REDDIT
  if (normName.includes('reddit')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-full`} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="12" fill="#FF4500" />
          <path
            d="M17.8 12c0-.7-.6-1.3-1.3-1.3-.3 0-.7.1-.9.4-1.1-.8-2.6-1.3-4.2-1.4l.7-3.4 2.4.5c.1.5.5.9 1.1.9.7 0 1.3-.6 1.3-1.3S16.3 5.1 15.6 5.1c-.5 0-1 .3-1.2.8l-2.7-.6c-.2 0-.3.1-.4.3l-.8 3.9c-1.7.1-3.2.6-4.3 1.4-.2-.3-.5-.4-.9-.4-.7 0-1.3.6-1.3 1.3 0 .5.3.9.7 1.1 0 .2 0 .4 0 .6 0 2.8 3.3 5.1 7.3 5.1s7.3-2.3 7.3-5.1c0-.2 0-.4 0-.6.5-.2.8-.7.8-1.2zm-9.3.9c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm5.3 4c-.9.9-2.6.9-3.5 0-.1-.1-.1-.3 0-.4s.3-.1.4 0c.7.7 2.1.7 2.8 0 .1-.1.3-.1.4 0 .1.1.1.3 0 .4zm-.2-3.1c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 9. WHATSAPP
  if (normName.includes('whatsapp')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <svg className={`${sizeClass} flex-shrink-0 rounded-full`} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="12" fill="#25D366" />
          <path
            d="M17.5 14.3c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1s-1.4-.5-2.6-1.6c-.9-.8-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.9 1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.8 5.2 3.4 1.5 3.4 1 4 1s1.9-.8 2.2-1.5c.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4z"
            fill="white"
          />
        </svg>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // 10. DIRECT TRAFFIC / BOOKMARK
  if (normName.includes('direct') || normName.includes('bookmark')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        <div className={`${sizeClass} rounded-full bg-red-600 text-white flex items-center justify-center p-0.5 flex-shrink-0 shadow-xs`}>
          <Compass className="w-full h-full" />
        </div>
        {showLabel && <span className="font-bold">{name}</span>}
      </div>
    );
  }

  // DEFAULT / REFERRAL LINK
  return (
    <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
      <div className={`${sizeClass} rounded-md bg-zinc-800 text-red-500 border border-zinc-700 flex items-center justify-center p-0.5 flex-shrink-0`}>
        <Link2 className="w-full h-full" />
      </div>
      {showLabel && <span className="font-bold">{name}</span>}
    </div>
  );
};

interface DeviceLogoProps {
  type: DeviceType | string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * Authentic Device and Hardware Vector Logos (Real High-Res Device SVG Frames)
 */
export const DeviceLogo: React.FC<DeviceLogoProps> = ({
  type = 'Mobile',
  className = '',
  size = 'md',
  showLabel = false,
}) => {
  const normType = (type || '').toLowerCase().trim();

  const iconSizes = {
    xs: 'w-4 h-4',
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  const sizeClass = iconSizes[size] || iconSizes.md;

  // 1. DESKTOP / MAC / PC / LAPTOP
  if (
    normType.includes('desktop') ||
    normType.includes('mac') ||
    normType.includes('pc') ||
    normType.includes('laptop') ||
    normType.includes('computer')
  ) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        {/* Real MacBook / Monitor Sleek Hardware SVG */}
        <svg className={`${sizeClass} flex-shrink-0`} viewBox="0 0 28 28" fill="none">
          {/* Display Glass Screen Frame */}
          <rect x="3" y="3" width="22" height="14" rx="2" fill="#18181B" stroke="#3F3F46" strokeWidth="1" />
          {/* Wallpaper Screen Gradient */}
          <rect x="4.5" y="4.5" width="19" height="11" rx="1" fill="url(#desktopScreenGrad)" />
          {/* Screen Glare */}
          <path d="M4.5 4.5L14 4.5L4.5 14V4.5Z" fill="white" fillOpacity="0.1" />
          {/* Camera Dot */}
          <circle cx="14" cy="3.8" r="0.4" fill="#71717A" />
          {/* Laptop Base Stand / Hinge */}
          <path d="M1 18.5C1 17.67 1.67 17 2.5 17H25.5C26.33 17 27 17.67 27 18.5V19.5C27 20.05 26.55 20.5 26 20.5H2C1.45 20.5 1 20.05 1 19.5V18.5Z" fill="#A1A1AA" />
          {/* Trackpad Notch Cutout */}
          <path d="M11.5 17.2H16.5V18H11.5V17.2Z" fill="#52525B" />
          <defs>
            <linearGradient id="desktopScreenGrad" x1="4.5" y1="4.5" x2="23.5" y2="15.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2563EB" />
              <stop offset="0.5" stopColor="#7C3AED" />
              <stop offset="1" stopColor="#DB2777" />
            </linearGradient>
          </defs>
        </svg>
        {showLabel && <span className="font-bold">Desktop</span>}
      </div>
    );
  }

  // 2. TABLET / IPAD
  if (normType.includes('tablet') || normType.includes('ipad')) {
    return (
      <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
        {/* Real iPad / Tablet Hardware SVG */}
        <svg className={`${sizeClass} flex-shrink-0`} viewBox="0 0 28 28" fill="none">
          {/* Outer Bezel */}
          <rect x="4" y="2" width="20" height="24" rx="3" fill="#18181B" stroke="#3F3F46" strokeWidth="1" />
          {/* Screen Glass */}
          <rect x="5.5" y="3.5" width="17" height="21" rx="2" fill="url(#tabletScreenGrad)" />
          {/* Glare */}
          <path d="M5.5 3.5L16 3.5L5.5 14V3.5Z" fill="white" fillOpacity="0.12" />
          {/* Camera Dot */}
          <circle cx="14" cy="2.8" r="0.4" fill="#71717A" />
          {/* Home Bar Indicator */}
          <rect x="11" y="23.2" width="6" height="0.6" rx="0.3" fill="#A1A1AA" />
          <defs>
            <linearGradient id="tabletScreenGrad" x1="5.5" y1="3.5" x2="22.5" y2="24.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0284C7" />
              <stop offset="0.6" stopColor="#0D9488" />
              <stop offset="1" stopColor="#059669" />
            </linearGradient>
          </defs>
        </svg>
        {showLabel && <span className="font-bold">Tablet</span>}
      </div>
    );
  }

  // 3. MOBILE / IPHONE / SMARTPHONE
  return (
    <div className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}>
      {/* Real iPhone / Modern Smartphone Hardware SVG */}
      <svg className={`${sizeClass} flex-shrink-0`} viewBox="0 0 28 28" fill="none">
        {/* Phone Case / Stainless Frame */}
        <rect x="6.5" y="1" width="15" height="26" rx="4" fill="#09090B" stroke="#3F3F46" strokeWidth="1" />
        {/* Display Screen */}
        <rect x="7.8" y="2.2" width="12.4" height="23.6" rx="2.8" fill="url(#mobileScreenGrad)" />
        {/* Dynamic Island / Camera Pill */}
        <rect x="11.5" y="3" width="5" height="1.2" rx="0.6" fill="#000000" />
        {/* Glass Screen Reflection */}
        <path d="M7.8 2.2L16 2.2L7.8 12V2.2Z" fill="white" fillOpacity="0.15" />
        {/* Bottom Home Bar */}
        <rect x="11" y="24.6" width="6" height="0.6" rx="0.3" fill="#FFFFFF" fillOpacity="0.8" />
        {/* Side Buttons Subtle Accents */}
        <rect x="5.8" y="6" width="0.7" height="3" rx="0.35" fill="#52525B" />
        <rect x="5.8" y="10" width="0.7" height="3" rx="0.35" fill="#52525B" />
        <rect x="21.5" y="8" width="0.7" height="4" rx="0.35" fill="#52525B" />
        <defs>
          <linearGradient id="mobileScreenGrad" x1="7.8" y1="2.2" x2="20.2" y2="25.8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DC2626" />
            <stop offset="0.5" stopColor="#E11D48" />
            <stop offset="1" stopColor="#9333EA" />
          </linearGradient>
        </defs>
      </svg>
      {showLabel && <span className="font-bold">Mobile</span>}
    </div>
  );
};
