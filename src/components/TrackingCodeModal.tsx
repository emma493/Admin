import React, { useState } from 'react';
import { X, Code, Copy, Check, ShieldCheck, Globe, Terminal } from 'lucide-react';
import { ThemeMode } from '../types';

interface TrackingCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
}

export const TrackingCodeModal: React.FC<TrackingCodeModalProps> = ({
  isOpen,
  onClose,
  theme,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  const embedScript = `<!-- Shortxx Real Website Analytics Embed Tag -->
<script
  src="${typeof window !== 'undefined' ? window.location.origin : ''}/shortxx-tracker.js"
  data-shortxx-app="${typeof window !== 'undefined' ? window.location.host : 'shortxx.app'}"
  async
></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-5 border-b flex items-center justify-between ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 font-black text-base">
            <Code className="w-5 h-5 text-red-600" />
            <span>Website Tracking Code</span>
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

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          <div
            className={`p-4 border rounded-xl flex items-start gap-3 ${
              isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}
          >
            <Globe className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">
              Paste this tracking tag inside the <code className="font-mono text-red-500 font-bold">&lt;head&gt;</code> tag of any external website or landing page. It automatically logs real visitor sessions, device specs, country locales, and page views directly into your Firestore database.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                <Terminal className="w-3.5 h-3.5 text-red-500" />
                <span>HTML Embed Script Tag</span>
              </span>
              <button
                onClick={handleCopy}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 transition-all text-[11px]"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Script Tag'}</span>
              </button>
            </div>

            <pre
              className={`p-4 rounded-xl font-mono text-[11px] leading-relaxed border overflow-x-auto select-all ${
                isDark ? 'bg-black border-zinc-800 text-red-400' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
              }`}
            >
              {embedScript}
            </pre>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className={`p-3 border rounded-xl ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="font-bold flex items-center gap-1.5 text-white mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                <span>Privacy First</span>
              </div>
              <p className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
                No cookies or personally identifiable info stored. Tracks anonymous sessions.
              </p>
            </div>

            <div className={`p-3 border rounded-xl ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="font-bold flex items-center gap-1.5 text-white mb-1">
                <Globe className="w-3.5 h-3.5 text-red-500" />
                <span>Realtime Sync</span>
              </div>
              <p className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
                Updates your Firestore database live without delays or artificial polling.
              </p>
            </div>
          </div>

          <div className={`pt-4 border-t flex justify-end ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                isDark ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
