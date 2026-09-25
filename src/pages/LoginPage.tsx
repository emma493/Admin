import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock } from 'lucide-react';
import { ADMIN_USERNAME, login } from '../lib/auth';

const schema = z.object({
  username: z.string().trim().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    setBusy(true);
    setError('');
    const ok = login(values.username, values.password);
    setBusy(false);
    if (ok) onAuthed();
    else setError('Invalid username or password');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#0F1014' }}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-[360px] rounded-[16px] p-7"
        style={{ background: '#16171D', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div
          className="w-11 h-11 rounded-[12px] flex items-center justify-center text-white mb-5"
          style={{ background: '#FF2B55' }}
        >
          <Lock size={20} />
        </div>
        <h1 className="text-white text-[20px] font-black tracking-tight">Shortxx Admin</h1>
        <p className="text-[#8A8B91] text-[13px] mt-1 mb-6">Sign in to continue</p>

        <label className="grid gap-1.5 mb-3.5">
          <span className="text-[#E1E2E6] text-[13px] font-bold">Username</span>
          <input
            {...register('username')}
            autoComplete="username"
            placeholder={ADMIN_USERNAME}
            className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
            style={{ background: '#0F1014', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          {errors.username && <span className="text-[#FF2B55] text-[12px]">{errors.username.message}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="text-[#E1E2E6] text-[13px] font-bold">Password</span>
          <input
            {...register('password')}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="px-3.5 py-2.5 rounded-[10px] text-white text-[14px] outline-none placeholder:text-[#8A8B91]"
            style={{ background: '#0F1014', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          {errors.password && <span className="text-[#FF2B55] text-[12px]">{errors.password.message}</span>}
        </label>

        {error && <div className="text-[#FF2B55] text-[13px] mt-3">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full flex items-center justify-center gap-2 text-white text-[14px] font-bold py-2.5 rounded-[10px] disabled:opacity-60"
          style={{ background: '#FF2B55' }}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Sign in
        </button>
      </form>
    </div>
  );
}
