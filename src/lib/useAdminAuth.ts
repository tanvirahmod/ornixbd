// ── Supabase Auth session for the admin panel ──
// Real authentication: the session lives in storage managed by Supabase and
// every admin write is validated server-side by the is_admin() RLS policies
// (public.admin_users allowlist). No credentials live in the JS bundle.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useAdminAuth() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const email = data.session?.user?.email ?? '';
      setAdminEmail(email);
      setIsAuthenticated(Boolean(email));
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? '';
      setAdminEmail(email);
      setIsAuthenticated(Boolean(email));
      setAuthReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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
  };

  return { authReady, isAuthenticated, adminEmail, signIn, signOut };
}
