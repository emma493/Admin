import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LogOut, UploadCloud, Users, Clapperboard } from 'lucide-react';

const linkBase =
  'flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-[14px] font-semibold transition-colors no-underline';
const linkIdle = 'text-[#A1A2A7] hover:bg-white/[0.06] hover:text-white';
const linkActive = 'bg-[#FF2B55]/[0.12] text-white';

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  return (
    <aside
      className="w-[248px] shrink-0 min-h-screen flex flex-col px-4 py-5 max-lg:hidden"
      style={{ background: '#16171D', borderRight: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="px-2 mb-8">
        <div className="text-white text-[19px] font-black tracking-tight">Shortxx</div>
        <div className="text-[#8A8B91] text-[11px] font-semibold uppercase tracking-[0.14em] mt-0.5">
          Admin Beta
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
        >
          <LayoutDashboard size={18} strokeWidth={2.2} />
          Dashboard
        </NavLink>
        <NavLink
          to="/creators"
          className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
        >
          <Users size={18} strokeWidth={2.2} />
          Creators
        </NavLink>
        <NavLink
          to="/videos"
          className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
        >
          <Clapperboard size={18} strokeWidth={2.2} />
          Videos
        </NavLink>
        <NavLink
          to="/upload"
          className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
        >
          <UploadCloud size={18} strokeWidth={2.2} />
          Upload
        </NavLink>
      </nav>
      <div
        className="mt-auto pt-4 grid gap-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={onLogout}
          className={`${linkBase} ${linkIdle} w-full`}
        >
          <LogOut size={18} strokeWidth={2.2} />
          Sign out
        </button>
        <div className="text-[12px] text-[#8A8B91] px-2">shortxx-live · Beta</div>
      </div>
    </aside>
  );
}
