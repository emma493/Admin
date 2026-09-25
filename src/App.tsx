/**
 * Shortxx Admin — Beta rebuild.
 *
 * CORE LOGIC KEPT (do not delete):
 * - src/lib/firebase.ts — Firestore CRUD + subscriptions
 * - src/lib/creators.ts — creators collection + avatar Storage upload
 * - src/lib/videoUtils.ts — extractLinksFromString, verifyVideoLink
 * - src/lib/utils.ts — formatters, date-range helpers
 * - src/types.ts — VideoDocument, CreatorDocument, TelemetryEvent, Analytics
 * - firebase-applet-config.json, firestore.rules, storage.rules,
 *   functions/src/transcodeVideo.js pipeline
 *
 * Beta palette (uniform, from shortxx.live side menu):
 * app #0F1014 · sidebar #16171D · surface #1E1F27 · accent #FF2B55
 */

import { Suspense, lazy, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, LogOut, UploadCloud, Users, Clapperboard } from 'lucide-react';
import { db } from './lib/firebase';
import { isAuthed, logout } from './lib/auth';
import Sidebar from './components/Sidebar';

// Lazy routes — app shell + login render without waiting on page bundles.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreatorsPage = lazy(() => import('./pages/CreatorsPage'));
const VideosPage = lazy(() => import('./pages/VideosPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

function PageFallback() {
  return (
    <div className="rounded-[14px] min-h-[240px] animate-pulse" style={{ background: '#1E1F27' }} />
  );
}

// Reference db so the Firebase wiring stays compiled in the build.
void db;

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthed());

  if (!authed) {
    return (
      <Suspense fallback={<div className="min-h-screen" style={{ background: '#0F1014' }} />}>
        <LoginPage onAuthed={() => setAuthed(true)} />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen flex" style={{ background: '#0F1014' }}>
        <Sidebar
          onLogout={() => {
            logout();
            setAuthed(false);
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="lg:hidden flex items-center gap-2 px-4 py-3" style={{ background: '#16171D', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-white font-black mr-2">Shortxx</span>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-bold no-underline ${isActive ? 'text-white bg-[#FF2B55]/[0.14]' : 'text-[#A1A2A7]'}`
              }
            >
              <LayoutDashboard size={15} /> Dashboard
            </NavLink>
            <NavLink
              to="/creators"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-bold no-underline ${isActive ? 'text-white bg-[#FF2B55]/[0.14]' : 'text-[#A1A2A7]'}`
              }
            >
              <Users size={15} /> Creators
            </NavLink>
            <NavLink
              to="/videos"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-bold no-underline ${isActive ? 'text-white bg-[#FF2B55]/[0.14]' : 'text-[#A1A2A7]'}`
              }
            >
              <Clapperboard size={15} /> Videos
            </NavLink>
            <NavLink
              to="/upload"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-bold no-underline ${isActive ? 'text-white bg-[#FF2B55]/[0.14]' : 'text-[#A1A2A7]'}`
              }
            >
              <UploadCloud size={15} /> Upload
            </NavLink>
            <button
              onClick={() => {
                logout();
                setAuthed(false);
              }}
              aria-label="Sign out"
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-bold text-[#A1A2A7]"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
          <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/creators" element={<CreatorsPage />} />
                <Route path="/videos" element={<VideosPage />} />
                <Route path="/upload" element={<UploadPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
