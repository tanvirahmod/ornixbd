// ── Admin credential manager (Supabase Edge Function) ──
// Deno runtime. Deploy:
//   supabase functions deploy admin-auth-manager
// No extra secrets needed — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
// injected automatically. The service_role key NEVER reaches the browser;
// the Edge Function is the only component that touches Auth Admin API.
//
// Only the super admin may call this (verified against admin_users.role —
// the same allowlist the RLS policies use, so a revoked account is refused
// instantly).
//
// Endpoints (JSON POST): { action: 'set_email' | 'set_password' | 'add' | 'delete', ... }
//   set_email    → { email, new_email }         rename an admin's login ID
//   set_password → { email, password }          set a new password for an admin
//   add          → { email, password, role }    create the auth user + allowlist row
//   delete       → { email }                    delete the auth user + allowlist row
//
// The allowlist itself (public.admin_users) is maintained here directly with
// the service-role client — the super_admin_add_admin/remove_admin RPCs can't
// be called from a service context (they check auth.jwt()) and the matching
// auth user must be created/deleted in the same operation to keep the two
// stores in sync.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, message: 'Server is not configured (missing service role key).' }, 500);
  }

  // 1) Identify the caller from their session token (same as steadfast-proxy).
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const callerEmail = userData?.user?.email?.toLowerCase();
  if (userError || !callerEmail) return json({ ok: false, message: 'Not signed in' }, 401);

  // 2) Only the super admin passes. Checked with the service client against
  //    the live allowlist (bypasses RLS, immune to policy changes).
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerRow } = await admin
    .from('admin_users')
    .select('role')
    .eq('email', callerEmail)
    .maybeSingle();
  if (callerRow?.role !== 'super_admin') {
    return json({ ok: false, message: 'Only the super admin can manage admin logins.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: 'Invalid JSON body' }, 400);
  }

  /** Find an auth user by email (listUsers is the reliable v2 way; handle >200 users). */
  const findUserByEmail = async (email: string) => {
    const perPage = 200;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
      if (hit) return hit;
      if (data.users.length < perPage) return null;
    }
    return null;
  };

  /** A safe rename of the allowlist row after the auth user's email changed. */
  const renameAllowlistRow = async (oldEmail: string, newEmail: string) => {
    const { error } = await admin
      .from('admin_users')
      .update({ email: newEmail })
      .eq('email', oldEmail);
    return error?.message ?? null;
  };

  try {
    switch (body.action) {
      case 'set_email': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const newEmail = String(body.new_email ?? '').trim().toLowerCase();
        if (!EMAIL_RE.test(newEmail)) return json({ ok: false, message: 'Enter a valid new email address.' }, 400);
        if (newEmail === email) return json({ ok: false, message: 'The new email is the same as the current one.' }, 400);

        // The new email must not already exist in auth or on the allowlist.
        if (await findUserByEmail(newEmail)) {
          return json({ ok: false, message: 'That email is already used by another user in Supabase Auth.' }, 409);
        }
        const { data: row } = await admin.from('admin_users').select('email').eq('email', newEmail).maybeSingle();
        if (row) return json({ ok: false, message: 'That email is already on the admin team.' }, 409);

        const user = await findUserByEmail(email);
        if (!user) return json({ ok: false, message: 'No Supabase Auth user found for this admin.' }, 404);

        // Admin API updates the login email directly — no confirmation email,
        // the admin can sign in with the new ID immediately. Existing sessions
        // are not revoked automatically, so the admin should sign out & back in.
        const { error } = await admin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true });
        if (error) return json({ ok: false, message: error.message }, 400);

        const renameError = await renameAllowlistRow(email, newEmail);
        return json({
          ok: true,
          message: renameError
            ? `Login ID changed to ${newEmail}, but the team list could not be renamed (${renameError}). Fix it in the Dashboard → Table Editor → admin_users.`
            : `Login ID changed to ${newEmail}. They must sign out and sign in with the new ID.`,
          rename_warning: renameError ?? undefined,
        });
      }

      case 'set_password': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        if (password.length < 6) return json({ ok: false, message: 'Password must be at least 6 characters.' }, 400);

        const user = await findUserByEmail(email);
        if (!user) return json({ ok: false, message: 'No Supabase Auth user found for this admin.' }, 404);

        const { error } = await admin.auth.admin.updateUserById(user.id, { password });
        if (error) return json({ ok: false, message: error.message }, 400);
        return json({ ok: true, message: `Password updated for ${email}. Share it privately — they should change it after signing in.` });
      }

      case 'add': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const role = String(body.role ?? 'admin');
        if (!EMAIL_RE.test(email)) return json({ ok: false, message: 'Enter a valid email address.' }, 400);
        if (password.length < 6) return json({ ok: false, message: 'Password must be at least 6 characters.' }, 400);
        if (role !== 'admin' && role !== 'super_admin') return json({ ok: false, message: 'Role must be admin or super_admin.' }, 400);

        const { data: existing } = await admin.from('admin_users').select('email').eq('email', email).maybeSingle();
        if (existing) return json({ ok: false, message: 'That email is already on the admin team.' }, 409);

        let user = await findUserByEmail(email);
        if (user) {
          // Auth user already exists (created in the Dashboard earlier) — just
          // reset their password to the one chosen here and allowlist them.
          const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
          if (error) return json({ ok: false, message: error.message }, 400);
        } else {
          const { data: created, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // no invite email — the super admin shares the password directly
          });
          if (error) return json({ ok: false, message: error.message }, 400);
          user = created.user;
        }

        const { error: listError } = await admin
          .from('admin_users')
          .upsert({ email, role }, { onConflict: 'email' });
        if (listError) {
          return json({
            ok: true,
            message: `Auth user created, but adding to the team failed (${listError.message}). Add them in Dashboard → Table Editor → admin_users.`,
          });
        }
        return json({ ok: true, message: `${email} added as ${role === 'super_admin' ? 'a super admin' : 'an admin'} and can sign in now.` });
      }

      case 'delete': {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!email) return json({ ok: false, message: 'email required' }, 400);
        if (email === callerEmail) return json({ ok: false, message: 'You cannot delete your own account.' }, 400);

        const { data: row } = await admin.from('admin_users').select('role').eq('email', email).maybeSingle();
        if (!row) return json({ ok: false, message: 'That email is not on the admin team.' }, 404);

        // Never strand the project without a super admin.
        if (row.role === 'super_admin') {
          const { count } = await admin
            .from('admin_users')
            .select('email', { count: 'exact', head: true })
            .eq('role', 'super_admin');
          if ((count ?? 0) <= 1) return json({ ok: false, message: 'You cannot delete the last super admin.' }, 400);
        }

        const user = await findUserByEmail(email);
        if (user) {
          const { error } = await admin.auth.admin.deleteUser(user.id);
          if (error) return json({ ok: false, message: error.message }, 400);
        }

        const { error: listError } = await admin.from('admin_users').delete().eq('email', email);
        if (listError) return json({ ok: false, message: `Auth user deleted, but removing from the team failed: ${listError.message}` }, 400);
        return json({ ok: true, message: `${email} deleted — panel access and sign-in removed.` });
      }

      default:
        return json({ ok: false, message: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Request failed' }, 500);
  }
});
