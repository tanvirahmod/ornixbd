import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service credentials are not configured.');
  return createClient(url, key);
}

export async function authenticatedAdminEmail(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase authentication is not configured.');

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user?.email) return null;

  const adminClient = createServiceClient();
  const { data: admin, error: adminError } = await adminClient
    .from('admin_users')
    .select('email, role, permissions')
    .eq('email', data.user.email.toLowerCase())
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin) return null;
  if (admin.role !== 'super_admin' && admin.permissions?.orders === false) return null;
  return data.user.email.toLowerCase();
}

export function configureWebPush() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Web Push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { webpush, publicKey };
}
