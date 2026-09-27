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
import { useEffect, useState, useCallback } from 'react';
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

  const loadRole = useCallback(async (email: string) => {
    if (!email) {
      setRole(null);
      setPermissions({});
      return;
    }
    // admin_me() is a SECURITY DEFINER RPC — returns the signed-in admin's
    // own role + permissions without depending on admin_users RLS (a
    // self-referencing SELECT policy there would recurse and error).
    const { data, error } = await supabase.rpc('admin_me');
    if (error) {
      // Migration not applied yet — treat as plain admin (baseline access).
      console.warn('admin_me() unavailable — run the super-admin permissions migration.', error.message);
      setRole(null);
      setPermissions({});
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setRole((row?.role as 'super_admin' | 'admin' | undefined) ?? null);
    setPermissions((row?.permissions as Record<string, boolean> | undefined) ?? {});
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
