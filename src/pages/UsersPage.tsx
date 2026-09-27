import { memo, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Mail, Monitor, Pencil, Plus, Search, ShieldQuestion, Smartphone, Tablet, Trash2, UserRound, X } from 'lucide-react';
import {
  subscribeToUsers,
  saveUserDoc,
  toggleUserStatus,
  deleteUserDoc,
} from '../lib/firebase';
import { formatDuration, formatTimeAgo, getCountryInfo, isUserActiveWithin } from '../lib/utils';
import type { AppType, AuthProvider, DeviceType, ReferralGroup, UserDocument, UserStatus } from '../types';
import Dropdown from '../components/Dropdown';

const surface = { background: '#1E1F27', border: '1px solid rgba(255,255,255,0.08)' };
const inputStyle = { background: '#16171D', border: '1px solid rgba(255,255,255,0.1)' };

const schema = z.object({
  userId: z
    .string()
    .trim()
    .min(2, 'Min 2 characters')
    .max(64, 'Max 64 characters')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Letters, numbers, _ or - only'),
  country: z.string().trim().min(2, 'Required').max(2, 'Use 2-letter ISO code'),
  deviceType: z.enum(['Mobile', 'Desktop', 'Tablet']),
  trafficSource: z.string().trim().max(120).optional(),
  status: z.enum(['Online', 'Offline']),
  currentPage: z.string().trim().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

function friendlySaveError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  const msg = e instanceof Error ? e.message : 'Save failed';
  if (code === 'permission-denied' || /permission|insufficient/i.test(msg)) {
    return 'Saving blocked by Firestore Security Rules — publish the latest firestore.rules in Firebase console, then retry.';
  }
  if (code === 'unavailable' || /network|offline/i.test(msg)) {
    return 'Network error — check connection and retry.';
  }
  return msg;
}

const UserRow = memo(function UserRow({
  u,
  onEdit,
  onToggle,
  onDelete,
  busy,
}: {
  u: UserDocument;
  onEdit: (u: UserDocument) => void;
  onToggle: (u: UserDocument) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const country = getCountryInfo(u.country);
  // Derived presence: heartbeat heuristic — status Online + lastActive <60s.
  const online = u.status === 'Online' && isUserActiveWithin(u, 60);
  const appType: AppType = u.appType || (u.isPWA ? 'PWA' : 'Browser');
  const auth: AuthProvider = u.authProvider || 'guest';
  const referral: ReferralGroup = u.referralGroup || 'Direct';
  const authLabel = auth === 'google' ? 'Google' : auth === 'email' ? 'Email' : 'Guest';
  return (
    <div className="rounded-[14px] p-4 flex items-center gap-3.5" style={surface}>
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[14px] font-black shrink-0"
        style={{ background: online ? '#16a34a' : '#52525b' }}
        title={u.userId}
      >
        <UserRound size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-[15px] font-bold truncate">{u.userId}</span>
          <span
            className="text-[11px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full flex items-center gap-1"
            style={
              online
                ? { background: 'rgba(52,211,153,0.14)', color: '#34d399' }
                : { background: 'rgba(255,255,255,0.07)', color: '#8A8B91' }
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: online ? '#34d399' : '#8A8B91' }}
            />
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={
              appType === 'PWA'
                ? { background: 'rgba(59,130,246,0.16)', color: '#93c5fd' }
                : { background: 'rgba(255,255,255,0.07)', color: '#A1A2A7' }
            }
            title={appType === 'PWA' ? 'Launched from installed PWA (standalone mode)' : 'Opened in web browser'}
          >
            {appType === 'PWA' ? 'PWA Installed' : 'Web Browser'}
          </span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,43,85,0.12)', color: '#FDA4AF' }}
            title="Auth method used to create the account"
          >
            {authLabel}
          </span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(250,204,21,0.12)', color: '#FDE68A' }}
            title={`Referral: ${u.trafficSource || referral}`}
          >
            {referral}
          </span>
        </div>
        <div className="text-[#8A8B91] text-[12px] mt-1 flex items-center gap-2 flex-wrap">
          <span>
            {country.flag} {country.name} ({u.country.toUpperCase()})
          </span>
          <span>·</span>
          <span>{u.deviceType}</span>
          <span>·</span>
          <span className="truncate max-w-[160px]" title={u.trafficSource}>
            {u.trafficSource}
          </span>
        </div>
        <div className="text-[#8A8B91] text-[12px] mt-0.5 flex items-center gap-2 flex-wrap">
          <span title="Accumulated playing time (10s heartbeats)">{formatDuration(u.totalDurationSeconds)}</span>
          <span>·</span>
          <span title="Clips watched past 80% completion">{u.videosWatched ?? 0} videos watched</span>
          <span>·</span>
          <span title="Saves + downloads">{u.totalSaves ?? 0} saves · {u.totalDownloads ?? 0} downloads</span>
          <span>·</span>
          <span>active {formatTimeAgo(u.lastActive)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(u)}
          className="px-3 py-1.5 rounded-[8px] text-[12px] font-bold text-[#E1E2E6] hover:text-white hover:bg-white/[0.08] disabled:opacity-50"
          style={inputStyle}
          title={online ? 'Set offline' : 'Set online'}
        >
          {online ? 'Go offline' : 'Go online'}
        </button>
        <button
          onClick={() => onEdit(u)}
          aria-label={`Edit ${u.userId}`}
          className="p-2 rounded-[8px] text-[#8A8B91] hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => onDelete(u.userId)}
          aria-label={`Delete ${u.userId}`}
          className="p-2 rounded-[8px] text-[#8A8B91] hover:text-[#FF2B55] hover:bg-white/[0.06] transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
});

type StatusFilter = 'All' | UserStatus;
type DeviceFilter = 'All' | DeviceType;
type AuthFilter = 'All' | AuthProvider;
type AppFilter = 'All' | AppType;
type ReferralFilter = 'All' | ReferralGroup;
type SortKey = 'durationDesc' | 'durationAsc' | 'recentActive' | 'userId';

const DEFAULTS: FormValues = {
  userId: '',
  country: 'GH',
  deviceType: 'Mobile',
  trafficSource: 'google.com',
  status: 'Online',
  currentPage: '/s/link-1',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('All');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('All');
  const [appFilter, setAppFilter] = useState<AppFilter>('All');
  const [referralFilter, setReferralFilter] = useState<ReferralFilter>('All');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('recentActive');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const formDevice = watch('deviceType');
  const formStatus = watch('status');

  useEffect(() => {
    const unsub = subscribeToUsers(
      (list) => {
        setUsers(list);
        setConnected(true);
      },
      () => setConnected(false)
    );
    return () => unsub();
  }, []);

  const countries = useMemo(() => {
    const set = new Map<string, number>();
    for (const u of users) {
      const code = (u.country || 'GH').toUpperCase();
      set.set(code, (set.get(code) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [users]);

  const onlineCount = useMemo(() => users.filter((u) => u.status === 'Online' && isUserActiveWithin(u, 60)).length, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => {
      const derivedOnline = u.status === 'Online' && isUserActiveWithin(u, 60);
      if (statusFilter !== 'All' && (derivedOnline ? 'Online' : 'Offline') !== statusFilter) return false;
      if (deviceFilter !== 'All' && u.deviceType !== deviceFilter) return false;
      if (authFilter !== 'All' && (u.authProvider || 'guest') !== authFilter) return false;
      const appType = u.appType || (u.isPWA ? 'PWA' : 'Browser');
      if (appFilter !== 'All' && appType !== appFilter) return false;
      if (referralFilter !== 'All' && (u.referralGroup || 'Direct') !== referralFilter) return false;
      if (countryFilter !== 'all' && u.country.toUpperCase() !== countryFilter.toUpperCase()) return false;
      if (q) {
        const hay = [u.userId, u.country, u.deviceType, u.trafficSource, u.currentPage, u.authProvider, appType, u.referralGroup].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const ts = (v: UserDocument['lastActive']): number => {
      const t: any = v;
      if (t?.toMillis) return t.toMillis();
      if (t?.toDate) return t.toDate().getTime();
      if (t instanceof Date) return t.getTime();
      const d = new Date(t as any);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    switch (sortBy) {
      case 'durationDesc':
        return [...list].sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds);
      case 'durationAsc':
        return [...list].sort((a, b) => a.totalDurationSeconds - b.totalDurationSeconds);
      case 'userId':
        return [...list].sort((a, b) => a.userId.localeCompare(b.userId));
      case 'recentActive':
      default:
        return [...list].sort((a, b) => ts(b.lastActive) - ts(a.lastActive));
    }
  }, [users, query, statusFilter, deviceFilter, authFilter, appFilter, referralFilter, countryFilter, sortBy]);

  const exportCsv = () => {
    const tsValue = (v: UserDocument['lastActive']): string => {
      const t: any = v;
      if (t?.toDate) { try { return t.toDate().toISOString(); } catch { return ''; } }
      if (t instanceof Date) return t.toISOString();
      if (typeof t === 'number') return new Date(t).toISOString();
      return String(t ?? '');
    };
    const esc = (v: unknown): string => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['userId','country','deviceType','appType','authProvider','referralGroup','trafficSource','status','totalDurationSeconds','videosWatched','totalSaves','totalDownloads','lastActive','firstSeen','currentPage'];
    const lines = filtered.map((u) => [
      u.userId, u.country.toUpperCase(), u.deviceType,
      u.appType || (u.isPWA ? 'PWA' : 'Browser'), u.authProvider || 'guest',
      u.referralGroup || 'Direct', u.trafficSource,
      u.status === 'Online' && isUserActiveWithin(u, 60) ? 'Online' : 'Offline',
      u.totalDurationSeconds, u.videosWatched ?? 0, u.totalSaves ?? 0, u.totalDownloads ?? 0,
      tsValue(u.lastActive), tsValue(u.firstSeen), u.currentPage,
    ].map(esc).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shortxx-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setError('');
    try {
      // Editing keeps the original doc ID; creating uses the typed userId.
      const docId = editingId ?? values.userId.trim();
      await saveUserDoc({
        userId: docId,
        country: values.country.trim().toUpperCase(),
        deviceType: values.deviceType,
        trafficSource: values.trafficSource?.trim() || 'Direct',
        status: values.status,
        currentPage: values.currentPage?.trim() || '/',
      });
      reset(DEFAULTS);
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: UserDocument) => {
    setEditingId(u.userId);
    setError('');
    setValue('userId', u.userId, { shouldValidate: true });
    setValue('country', u.country, { shouldValidate: true });
    setValue('deviceType', u.deviceType, { shouldValidate: true });
    setValue('trafficSource', u.trafficSource, { shouldValidate: false });
    setValue('status', u.status, { shouldValidate: false });
    setValue('currentPage', u.currentPage, { shouldValidate: false });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
    reset(DEFAULTS);
  };

  const onToggle = async (u: UserDocument) => {
    setBusyId(u.userId);
    try {
      const isOnline = u.status === 'Online' && isUserActiveWithin(u, 60);
      await toggleUserStatus(u.userId, isOnline ? 'Offline' : 'Online');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!confirmId) return;
    setBusyId(confirmId);
    try {
      await deleteUserDoc(confirmId);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight">Users</h1>
          <p className="text-[#8A8B91] text-[13px] mt-1">
            {connected
              ? `${filtered.length} of ${users.length} user${users.length === 1 ? '' : 's'} · ${onlineCount} online · live`
              : 'Connecting…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 text-[14px] font-bold px-4 py-2.5 rounded-[10px] transition-colors text-[#E1E2E6] hover:text-white disabled:opacity-50"
            style={inputStyle}
            title="Download filtered list as CSV for Excel / Sheets"
          >
            Export CSV
          </button>
          <button
            onClick={() => (showForm ? closeForm() : (setEditingId(null), reset(DEFAULTS), setShowForm(true)))}
            className="flex items-center gap-2 text-white text-[14px] font-bold px-4 py-2.5 rounded-[10px] transition-colors"
            style={{ background: '#FF2B55' }}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Close' : 'New user'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-5 rounded-[14px] p-5 grid gap-3 sm:grid-cols-2"
          style={surface}
        >
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[13px] font-bold">User ID</span>
            <input
              {...register('userId')}
              disabled={!!editingId}
              placeholder="e.g. GH2156790"
              className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91] disabled:opacity-60"
              style={inputStyle}
            />
            {errors.userId && <span className="text-[#FF2B55] text-[12px]">{errors.userId.message}</span>}
          </label>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[13px] font-bold">Country (ISO)</span>
            <input
              {...register('country')}
              placeholder="GH"
              maxLength={2}
              className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91] uppercase"
              style={inputStyle}
            />
            {errors.country && <span className="text-[#FF2B55] text-[12px]">{errors.country.message}</span>}
          </label>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[13px] font-bold">Device</span>
            <Dropdown
              ariaLabel="Device type"
              value={formDevice}
              onChange={(v) => setValue('deviceType', v as FormValues['deviceType'], { shouldValidate: true })}
              options={[
                { value: 'Mobile', label: 'Mobile', leading: <Smartphone size={15} /> },
                { value: 'Desktop', label: 'Desktop', leading: <Monitor size={15} /> },
                { value: 'Tablet', label: 'Tablet', leading: <Tablet size={15} /> },
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[13px] font-bold">Status</span>
            <Dropdown
              ariaLabel="User status"
              value={formStatus}
              onChange={(v) => setValue('status', v as FormValues['status'], { shouldValidate: false })}
              options={[
                { value: 'Online', label: 'Online' },
                { value: 'Offline', label: 'Offline' },
              ]}
            />
          </div>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[13px] font-bold">Traffic source</span>
            <input
              {...register('trafficSource')}
              placeholder="google.com"
              className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
              style={inputStyle}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[13px] font-bold">Current page</span>
            <input
              {...register('currentPage')}
              placeholder="/s/link-1"
              className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
              style={inputStyle}
            />
          </label>
          {error && <span className="text-[#FF2B55] text-[13px] sm:col-span-2">{error}</span>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 text-white text-[14px] font-bold px-5 py-2.5 rounded-[10px] disabled:opacity-60"
              style={{ background: '#FF2B55' }}
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-[240px_1fr]">
        <div className="rounded-[14px] p-4 grid gap-3 content-start" style={surface}>
          <label className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Search</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8B91]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="userId, country, source…"
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-white text-[13px] outline-none placeholder:text-[#8A8B91]"
                style={inputStyle}
              />
            </div>
          </label>
          <div className="grid gap-1.5">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Status</span>
            <div className="flex gap-2">
              {(['All', 'Online', 'Offline'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  aria-pressed={statusFilter === s}
                  className="px-3.5 py-2 rounded-[10px] text-[13px] font-bold"
                  style={
                    statusFilter === s
                      ? { background: '#FF2B55', color: '#fff' }
                      : { background: '#16171D', color: '#A1A2A7', border: '1px solid rgba(255,255,255,0.1)' }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Device</span>
            <Dropdown
              ariaLabel="Filter by device"
              value={deviceFilter}
              onChange={(v) => setDeviceFilter(v as DeviceFilter)}
              options={[
                { value: 'All', label: 'All devices' },
                { value: 'Mobile', label: 'Mobile', leading: <Smartphone size={15} /> },
                { value: 'Desktop', label: 'Desktop', leading: <Monitor size={15} /> },
                { value: 'Tablet', label: 'Tablet', leading: <Tablet size={15} /> },
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Auth</span>
            <Dropdown
              ariaLabel="Filter by auth method"
              value={authFilter}
              onChange={(v) => setAuthFilter(v as AuthFilter)}
              options={[
                { value: 'All', label: 'All auth' },
                { value: 'google', label: 'Google OAuth' },
                { value: 'email', label: 'Email/Password', leading: <Mail size={15} /> },
                { value: 'guest', label: 'Guest', leading: <ShieldQuestion size={15} /> },
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">App type</span>
            <Dropdown
              ariaLabel="Filter by app type"
              value={appFilter}
              onChange={(v) => setAppFilter(v as AppFilter)}
              options={[
                { value: 'All', label: 'PWA + Browser' },
                { value: 'PWA', label: 'PWA Installed' },
                { value: 'Browser', label: 'Web Browser' },
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Referral</span>
            <Dropdown
              ariaLabel="Filter by referral source"
              value={referralFilter}
              onChange={(v) => setReferralFilter(v as ReferralFilter)}
              options={[
                { value: 'All', label: 'All sources' },
                { value: 'Direct', label: 'Direct' },
                { value: 'Google', label: 'Google' },
                { value: 'Organic', label: 'Organic' },
                { value: 'Social', label: 'Social' },
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Country</span>
            <Dropdown
              ariaLabel="Filter by country"
              value={countryFilter}
              onChange={setCountryFilter}
              options={[
                { value: 'all', label: 'All countries', count: users.length },
                ...countries.map(([code, n]) => {
                  const info = getCountryInfo(code);
                  return {
                    value: code,
                    label: `${info.flag}  ${code}`,
                    hint: info.name,
                    count: n,
                  };
                }),
              ]}
            />
          </div>
          <div className="grid gap-1.5 min-w-0">
            <span className="text-[#E1E2E6] text-[12px] font-bold uppercase tracking-[0.1em]">Sort</span>
            <Dropdown
              ariaLabel="Sort users"
              value={sortBy}
              onChange={(v) => setSortBy(v as SortKey)}
              options={[
                { value: 'recentActive', label: 'Recently active' },
                { value: 'durationDesc', label: 'Duration ↓' },
                { value: 'durationAsc', label: 'Duration ↑' },
                { value: 'userId', label: 'User ID A–Z' },
              ]}
            />
          </div>
        </div>

        <div className="grid gap-3 content-start">
          {filtered.length === 0 && connected ? (
            <div className="rounded-[14px] p-10 text-center text-[#8A8B91] text-[14px] flex flex-col items-center gap-2" style={surface}>
              <UserRound size={22} />
              No users match these filters — click <span className="text-white font-bold">New user</span> to add one.
            </div>
          ) : (
            filtered.map((u) => (
              <UserRow key={u.id} u={u} onEdit={startEdit} onToggle={onToggle} onDelete={(id) => setConfirmId(id)} busy={busyId === u.userId} />
            ))
          )}
          {!connected && (
            <div className="flex items-center gap-2 text-[#8A8B91] text-[13px]">
              <Loader2 size={15} className="animate-spin" /> Loading users…
            </div>
          )}
        </div>
      </div>

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmId(null)}
        >
          <div className="rounded-[14px] p-5 max-w-sm w-full" style={surface} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white text-[16px] font-bold">Delete user {confirmId}?</h2>
            <p className="text-[#8A8B91] text-[13px] mt-1">
              Removes the Firestore doc in <span className="font-mono">users/{confirmId}</span>. This can’t be undone.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 rounded-[10px] text-[13px] font-bold text-[#E1E2E6] hover:text-white"
                style={inputStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyId === confirmId}
                className="px-4 py-2 rounded-[10px] text-[13px] font-bold text-white disabled:opacity-60 flex items-center gap-1.5"
                style={{ background: '#FF2B55' }}
              >
                {busyId === confirmId && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
