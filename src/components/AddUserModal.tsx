import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { DeviceType, UserStatus, ThemeMode } from '../types';
import { CountryFlag, SocialLogo, DeviceLogo } from './LogosAndFlags';
import { CustomDropdown } from './CustomDropdown';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: {
    userId: string;
    country: string;
    deviceType: DeviceType;
    trafficSource: string;
    status: UserStatus;
    totalDurationSeconds: number;
    currentPage: string;
  }) => Promise<void>;
  theme: ThemeMode;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  onSave,
  theme,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const [userId, setUserId] = useState(`GH${Math.floor(1000000 + Math.random() * 9000000)}`);
  const [country, setCountry] = useState('GH');
  const [deviceType, setDeviceType] = useState<DeviceType>('Mobile');
  const [trafficSource, setTrafficSource] = useState('google.com');
  const [status, setStatus] = useState<UserStatus>('Online');
  const [duration, setDuration] = useState(1200);
  const [currentPage, setCurrentPage] = useState('/s/shortxx-link-demo');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;

    try {
      setIsSubmitting(true);
      await onSave({
        userId: userId.trim().toUpperCase(),
        country: country.trim().toUpperCase(),
        deviceType,
        trafficSource: trafficSource.trim(),
        status,
        totalDurationSeconds: Number(duration),
        currentPage: currentPage.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Error saving user doc:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <div
          className={`p-5 border-b flex items-center justify-between ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 font-black text-base">
            <UserPlus className="w-5 h-5 text-red-600" />
            <span>Add User Session</span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Custom UUID (e.g., GH2156790)
            </label>
            <input
              type="text"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={`w-full px-3 py-2 border rounded-xl font-mono focus:outline-none focus:border-red-600 ${
                isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-300'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Country ISO Code
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className={`w-full pl-3 pr-10 py-2 border rounded-xl uppercase font-mono focus:outline-none focus:border-red-600 ${
                    isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-300'
                  }`}
                />
                <div className="absolute right-2 flex items-center pointer-events-none">
                  <CountryFlag code={country} size="xs" />
                </div>
              </div>
            </div>

            <div>
              <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Device Type
              </label>
              <CustomDropdown
                isDark={isDark}
                value={deviceType}
                onChange={(val) => setDeviceType(val as DeviceType)}
                options={[
                  { value: 'Mobile', label: 'Mobile', icon: <DeviceLogo type="Mobile" size="xs" /> },
                  { value: 'Desktop', label: 'Desktop', icon: <DeviceLogo type="Desktop" size="xs" /> },
                  { value: 'Tablet', label: 'Tablet', icon: <DeviceLogo type="Tablet" size="xs" /> },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Traffic Source
              </label>
              <CustomDropdown
                isDark={isDark}
                value={trafficSource}
                onChange={setTrafficSource}
                options={[
                  { value: 'google.com', label: 'Google', icon: <SocialLogo name="google.com" size="xs" /> },
                  { value: 'facebook.com', label: 'Facebook', icon: <SocialLogo name="facebook.com" size="xs" /> },
                  { value: 'instagram.com', label: 'Instagram', icon: <SocialLogo name="instagram.com" size="xs" /> },
                  { value: 'tiktok.com', label: 'TikTok', icon: <SocialLogo name="tiktok.com" size="xs" /> },
                  { value: 'twitter.com', label: 'X / Twitter', icon: <SocialLogo name="twitter.com" size="xs" /> },
                  { value: 'youtube.com', label: 'YouTube', icon: <SocialLogo name="youtube.com" size="xs" /> },
                  { value: 'linkedin.com', label: 'LinkedIn', icon: <SocialLogo name="linkedin.com" size="xs" /> },
                  { value: 'reddit.com', label: 'Reddit', icon: <SocialLogo name="reddit.com" size="xs" /> },
                  { value: 'whatsapp.com', label: 'WhatsApp', icon: <SocialLogo name="whatsapp.com" size="xs" /> },
                  { value: 'Direct', label: 'Direct', icon: <SocialLogo name="Direct" size="xs" /> },
                ]}
              />
            </div>

            <div>
              <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Status
              </label>
              <CustomDropdown
                isDark={isDark}
                value={status}
                onChange={(val) => setStatus(val as UserStatus)}
                options={[
                  {
                    value: 'Online',
                    label: 'Online',
                    icon: <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />,
                  },
                  {
                    value: 'Offline',
                    label: 'Offline',
                    icon: <span className="w-2 h-2 rounded-full bg-red-500" />,
                  },
                ]}
              />
            </div>
          </div>

          <div>
            <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Initial Duration (Seconds)
            </label>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={`w-full px-3 py-2 border rounded-xl font-mono focus:outline-none focus:border-red-600 ${
                isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-300'
              }`}
            />
          </div>

          <div>
            <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Current Page
            </label>
            <input
              type="text"
              value={currentPage}
              onChange={(e) => setCurrentPage(e.target.value)}
              className={`w-full px-3 py-2 border rounded-xl font-mono focus:outline-none focus:border-red-600 ${
                isDark ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-900 border-zinc-300'
              }`}
            />
          </div>

          <div className={`pt-3 border-t flex items-center justify-end gap-2 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                isDark
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold transition-all disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
