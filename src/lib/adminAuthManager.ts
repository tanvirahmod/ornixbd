// ── Admin credential manager (client) ──
// Talks to the `admin-auth-manager` Edge Function, which is the ONLY way the
// panel can change another admin's login email/password or create/delete the
// underlying Supabase Auth user — those live in auth.users, which no anon-key
// RPC can touch. The function verifies the caller is a super admin against
// admin_users and uses the service-role key server-side (never in the bundle).
//
//   setAdminEmail      rename an admin's login ID
//   setAdminPassword   set a new password for an admin
//   adminAddAdmin      create auth user + allowlist row in one step
//   adminDeleteAdmin   delete auth user + allowlist row in one step

import { supabase } from './supabase';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export type AdminAuthResult = {
  ok: boolean;
  message: string;
  /** True when the Edge Function isn't deployed yet (caller can fall back to the SQL RPCs). */
  notDeployed?: boolean;
};

async function call(action: string, payload: Record<string, unknown>): Promise<AdminAuthResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? ANON_KEY;
    const res = await fetch(`${FUNCTIONS_URL}/admin-auth-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    return { ok: Boolean(data.ok), message: data.message ?? `Request failed (HTTP ${res.status}).` };
  } catch (err) {
    const networkMiss = err instanceof Error && err.message === 'Failed to fetch';
    return {
      ok: false,
      notDeployed: networkMiss,
      message: networkMiss
        ? 'The credential manager is not deployed yet (run: supabase functions deploy admin-auth-manager).'
        : `Request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/** Change another admin's login email (their Supabase Auth ID + allowlist row). */
export function setAdminEmail(email: string, newEmail: string): Promise<AdminAuthResult> {
  return call('set_email', { email, new_email: newEmail });
}

/** Set a new password for another admin. */
export function setAdminPassword(email: string, password: string): Promise<AdminAuthResult> {
  return call('set_password', { email, password });
}

/** Create the auth user (with a password) and add them to the admin team. */
export function adminAddAdmin(email: string, password: string, role: 'admin' | 'super_admin'): Promise<AdminAuthResult> {
  return call('add', { email, password, role });
}

/** Delete an admin's auth user and remove them from the team. */
export function adminDeleteAdmin(email: string): Promise<AdminAuthResult> {
  return call('delete', { email });
}
