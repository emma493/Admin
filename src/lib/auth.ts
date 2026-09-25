// Simple client-side gate for the Beta admin. Credentials live in code so
// anyone with repo/dist access can read them — fine for a private Beta,
// replace with Firebase Auth before any shared/public hosting.

const SESSION_KEY = 'shortxx-admin-auth';

export const ADMIN_USERNAME = 'Shortxx-Admin';
const ADMIN_PASSWORD = 'Emma7233@$';

export function isAuthed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function login(username: string, password: string): boolean {
  const ok = username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD;
  if (ok) {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* storage unavailable — still allow this load */
    }
  }
  return ok;
}

export function logout(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
