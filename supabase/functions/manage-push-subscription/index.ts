import { authenticatedAdminEmail, configureWebPush, createServiceClient, corsHeaders, json } from '../_shared/order-push.ts';

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  let email: string | null;
  try {
    email = await authenticatedAdminEmail(req);
  } catch (error) {
    console.error('Could not validate the order-push admin session.', error);
    return json({ error: 'Could not verify admin access.' }, 500);
  }
  if (!email) return json({ error: 'A signed-in admin account is required.' }, 403);

  let body: { action?: string; subscription?: PushSubscriptionBody; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  try {
    const admin = createServiceClient();
    if (body.action === 'public_key') {
      const { publicKey } = configureWebPush();
      return json({ publicKey });
    }

    if (body.action === 'subscribe') {
      const subscription = body.subscription;
      if (typeof subscription?.endpoint !== 'string' || subscription.endpoint.length > 4096
        || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') {
        return json({ error: 'The browser returned an invalid push subscription.' }, 400);
      }
      let endpoint: URL;
      try {
        endpoint = new URL(subscription.endpoint);
      } catch {
        return json({ error: 'The push endpoint is invalid.' }, 400);
      }
      const supportedPushHosts = new Set(['fcm.googleapis.com', 'web.push.apple.com']);
      if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
        || !supportedPushHosts.has(endpoint.hostname)) {
        return json({ error: 'The push endpoint is not a supported browser push service.' }, 400);
      }

      const { error } = await admin.from('admin_push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        admin_email: email,
        subscription,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'unsubscribe') {
      if (!body.endpoint) return json({ error: 'A push endpoint is required.' }, 400);
      const { error } = await admin.from('admin_push_subscriptions')
        .delete()
        .eq('admin_email', email)
        .eq('endpoint', body.endpoint);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'test') {
      if (!body.endpoint) return json({ error: 'A push endpoint is required.' }, 400);
      const { webpush } = configureWebPush();
      const { data, error } = await admin.from('admin_push_subscriptions')
        .select('endpoint, subscription')
        .eq('admin_email', email)
        .eq('endpoint', body.endpoint)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'This device is not subscribed. Enable notifications first.' }, 404);
      await webpush.sendNotification(data.subscription, JSON.stringify({
        title: 'ORNIX order alerts are ready',
        body: 'This device can receive new order notifications.',
        tag: 'ornix-push-test',
        url: '/admin',
      }));
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('Order-push subscription operation failed.', error);
    return json({ error: error instanceof Error ? error.message : 'Order-push operation failed.' }, 500);
  }
});
