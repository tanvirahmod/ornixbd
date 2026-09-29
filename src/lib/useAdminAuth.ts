// ── Supabase Auth session for the admin panel ──
// Real authentication: the session lives in storage managed by Supabase and
// every admin write is validated server-side by the is_admin()/admin_has()
// RLS policies (public.admin_users allowlist). No credentials live in the JS bundle.
//
// Roles & capabilities (see supabase/migrations/20261001000000_super_admin_permissions.sql):
//   • role 'super_admin' — full access to every tab, manages the team.
//   • role 'admin' — baseline access; a capability set to false in the
//     permissions map hides the matching tab (UI) and blocks the underlying
//     writes (RLS). Missing key = allowed.
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

export type AdminCapability =
  | 'products'
  | 'stock'
  | 'categories'
  | 'orders'
  | 'manual'
  | 'finance'
  | 'coupons'
  | 'feedback'
  | 'settings'
  | 'team';

export const ALL_CAPABILITIES: { key: AdminCapability; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'stock', label: 'Stock' },
  { key: 'categories', label: 'Categories' },
  { key: 'orders', label: 'Orders' },
  { key: 'manual', label: 'Manual Orders' },
  { key: 'finance', label: 'Finance' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'settings', label: 'Settings' },
  { key: 'team', label: 'Team management' },
];

export function useAdminAuth() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [role, setRole] = useState<'super_admin' | 'admin' | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  // ── Session keep-alive ──
  // The access token is short-lived (1 h by default). While a tab stays open
  // supabase-js refreshes it automatically, but a browser that was closed for
  // a while relies on ONE refresh attempt at startup — if that single attempt
  // fails (slow network, tab race), the session is discarded and the admin
  // sees the login screen again. This keep-alive proactively refreshes the
  // token before it expires — on mount, every 5 minutes, and whenever the
  // user returns to the tab — and retries after a failed attempt, so coming
  // back later never costs a sign-in. Refresh tokens themselves don't expire
  // unless revoked, so this keeps admins logged in for weeks/months.
  const REFRESH_AHEAD_MS = 15 * 60 * 1000; // refresh when < 15 min of token life remain
  let lastKeepAliveAt = 0; // throttle: at most one check per minute
  const keepAlive = useCallback(async () => {
    const now = Date.now();
    if (now - lastKeepAliveAt < 60 * 1000) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // signed out — nothing to keep alive
      lastKeepAliveAt = now;
      const expiresInMs = (session.expires_at ?? 0) * 1000 - Date.now();
      if (expiresInMs < REFRESH_AHEAD_MS) {
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
      }
    } catch {
      // Failed (offline, server blip) — reset the throttle so the next
      // interval tick / tab focus retries immediately.
      lastKeepAliveAt = 0;
    }
  }, []);

  // admin_me() is a SECURITY DEFINER RPC — returns the signed-in admin's own
  // role + permissions without depending on admin_users RLS (a
  // self-referencing SELECT policy there would recurse and error).
  // getSession() and onAuthStateChange both fire at sign-in — share one
  // in-flight lookup so the RPC runs once, not twice.
  const roleLoadInFlight = useRef<Promise<void> | null>(null);
  const roleLoadEmail = useRef('');
  const loadRole = useCallback(async (email: string) => {
    if (!email) {
      setRole(null);
      setPermissions({});
      return;
    }
    if (roleLoadInFlight.current && roleLoadEmail.current === email) return roleLoadInFlight.current;
    roleLoadEmail.current = email;
    roleLoadInFlight.current = (async () => {
      // Network blips (the login-time HTTP/2 burst refused streams with
      // "Failed to fetch") used to log a misleading "run the migration"
      // warning. Retry transient failures; only a real function-not-found
      // means the migration is actually missing.
      let lastError: { message: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.rpc('admin_me');
        if (!error) {
          const row = Array.isArray(data) ? data[0] : data;
          setRole((row?.role as 'super_admin' | 'admin' | undefined) ?? null);
          setPermissions((row?.permissions as Record<string, boolean> | undefined) ?? {});
          roleLoadInFlight.current = null;
          return;
        }
        lastError = error;
        const transient = /failed to fetch|err_http2|err_network|server refused|\b5\d\d\b/i.test(error.message);
        if (!transient) break;
        await new Promise((r) => window.setTimeout(r, 350 * (attempt + 1)));
      }
      if (lastError && /could not find the function|not found in the schema cache|404/i.test(lastError.message)) {
        console.warn('admin_me() unavailable — run the super-admin permissions migration.', lastError.message);
      } else if (lastError) {
        console.warn('admin_me() hit a network error — will retry on the next auth event.', lastError.message);
      }
      setRole(null);
      setPermissions({});
      roleLoadInFlight.current = null;
    })();
    return roleLoadInFlight.current;
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const email = data.session?.user?.email ?? '';
      setAdminEmail(email);
      setIsAuthenticated(Boolean(email));
      setAuthReady(true);
      void loadRole(email);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? '';
      setAdminEmail(email);
      setIsAuthenticated(Boolean(email));
      setAuthReady(true);
      void loadRole(email);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadRole]);

  // Run the keep-alive: once at startup (covers "came back after a break"),
  // then on an interval and whenever the tab regains focus/visibility.
  useEffect(() => {
    void keepAlive();
    const interval = window.setInterval(() => void keepAlive(), 5 * 60 * 1000);
    const onFocus = () => void keepAlive();
    const onVisibility = () => { if (document.visibilityState === 'visible') void keepAlive(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [keepAlive]);

  /** Password sign-in. Returns an error message on failure, null on success. */
  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    return error.message === 'Invalid login credentials'
      ? 'Invalid email or password.'
      : `Sign-in failed: ${error.message}`;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setAdminEmail('');
    setRole(null);
    setPermissions({});
  };

  const isSuperAdmin = role === 'super_admin';

  /** Can the signed-in admin use this capability? Super admins always can. */
  const isAdminOf = useCallback(
    (capability: AdminCapability): boolean => {
      if (!isAuthenticated) return false;
      if (isSuperAdmin) return true;
      return permissions[capability] !== false;
    },
    [isAuthenticated, isSuperAdmin, permissions]
  );

  /** Re-read role/permissions from the DB (used after team edits). */
  const reloadPermissions = useCallback(async () => {
    await loadRole(adminEmail);
  }, [adminEmail, loadRole]);

  return { authReady, isAuthenticated, adminEmail, role, isSuperAdmin, isAdminOf, reloadPermissions, signIn, signOut };
}
