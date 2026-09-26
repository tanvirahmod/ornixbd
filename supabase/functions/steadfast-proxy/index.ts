// ── Steadfast courier proxy (Supabase Edge Function) ──
// Deno runtime. Deploy:
//   supabase functions deploy steadfast-proxy
// Secrets (server-side only, never in the browser):
//   supabase secrets set STEADFAST_API_KEY=... STEADFAST_SECRET_KEY=...
//
// Endpoints (JSON POST): { action: 'create' | 'status' | 'balance', ... }
//   create  → { invoice, recipient_name, recipient_phone, recipient_address,
//               cod_amount, weight?, note? }   (booking a consignment)
//   status  → { tracking_code }                  (status by tracking code)
//   balance → {}                                 (courier account balance)
//
// Only authenticated admins may call this (session token verified against
// the admin allowlist via is_admin()).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE_URL = 'https://portal.packzy.com/api/v1';
const API_KEY = Deno.env.get('STEADFAST_API_KEY') ?? '';
const SECRET_KEY = Deno.env.get('STEADFAST_SECRET_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);
  if (!API_KEY || !SECRET_KEY) return json({ ok: false, message: 'Steadfast keys are not configured on the server' }, 500);

  // Require a signed-in admin (same allowlist the RLS policies use)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.email) return json({ ok: false, message: 'Not signed in' }, 401);
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: isAdmin, error: adminError } = await adminClient
    .from('admin_users')
    .select('email')
    .eq('email', userData.user.email)
    .maybeSingle();
  if (adminError || !isAdmin) return json({ ok: false, message: 'Not an admin' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: 'Invalid JSON body' }, 400);
  }

  const sfHeaders: HeadersInit = {
    'Api-Key': API_KEY,
    'Secret-Key': SECRET_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    switch (body.action) {
      case 'create': {
        const res = await fetch(`${BASE_URL}/create_order`, {
          method: 'POST',
          headers: sfHeaders,
          body: JSON.stringify({
            invoice: body.invoice,
            recipient_name: body.recipient_name,
            recipient_phone: body.recipient_phone,
            recipient_address: body.recipient_address,
            cod_amount: body.cod_amount,
            ...(body.weight != null ? { weight: body.weight } : {}),
            ...(body.note ? { note: body.note } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        return json({ ok: res.ok, status: res.status, data });
      }
      case 'status': {
        const code = String(body.tracking_code ?? '');
        if (!code) return json({ ok: false, message: 'tracking_code required' }, 400);
        const res = await fetch(`${BASE_URL}/status_by_trackingcode/${encodeURIComponent(code)}`, { headers: sfHeaders });
        const data = await res.json().catch(() => ({}));
        return json({ ok: res.ok, status: res.status, data });
      }
      case 'balance': {
        const res = await fetch(`${BASE_URL}/get_balance`, { headers: sfHeaders });
        const data = await res.json().catch(() => ({}));
        return json({ ok: res.ok, status: res.status, data });
      }
      default:
        return json({ ok: false, message: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Upstream request failed' }, 502);
  }
});
