import { configureWebPush, createServiceClient, json } from '../_shared/order-push.ts';

type OrderPushRequest = {
  order_code?: string | null;
  order_id?: string;
};

type OrderRow = {
  id: string;
  order_code: string | null;
  customer_name: string;
  product_title: string;
};

type SubscriptionRow = {
  endpoint: string;
  admin_email: string;
  subscription: Parameters<ReturnType<typeof configureWebPush>['webpush']['sendNotification']>[0];
};

const unauthorized = () => json({ error: 'Invalid order-push webhook secret.' }, 401);

function matchesSecret(expected: string, supplied: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const suppliedBytes = encoder.encode(supplied);
  if (expectedBytes.length !== suppliedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index++) {
    difference |= expectedBytes[index] ^ suppliedBytes[index];
  }
  return difference === 0;
}

function pushStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
  const expectedSecret = Deno.env.get('ORDER_PUSH_WEBHOOK_SECRET');
  const suppliedSecret = req.headers.get('x-order-push-secret');
  if (!expectedSecret || !suppliedSecret || !matchesSecret(expectedSecret, suppliedSecret)) return unauthorized();

  let body: OrderPushRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }
  if (!body.order_code && !body.order_id) return json({ error: 'order_code or order_id is required.' }, 400);

  try {
    const admin = createServiceClient();
    const { data: rows, error: orderError } = body.order_code
      ? await admin.from('orders')
        .select('id, order_code, customer_name, product_title')
        .eq('order_code', body.order_code)
        .limit(100)
      : await admin.from('orders')
        .select('id, order_code, customer_name, product_title')
        .eq('id', body.order_id)
        .limit(1);
    if (orderError) throw orderError;
    const orders = (rows ?? []) as OrderRow[];
    if (orders.length === 0) return json({ error: 'Order was not found.' }, 404);

    const first = orders[0];
    const orderKey = first.order_code || first.id;
    const { webpush } = configureWebPush();
    const { data: storedSubscriptions, error: subscriptionError } = await admin
      .from('admin_push_subscriptions')
      .select('endpoint, admin_email, subscription');
    if (subscriptionError) throw subscriptionError;
    const subscribedAdmins = [...new Set((storedSubscriptions ?? []).map((row) => row.admin_email))];
    const { data: admins, error: adminsError } = subscribedAdmins.length
      ? await admin.from('admin_users').select('email, role, permissions').in('email', subscribedAdmins)
      : { data: [], error: null };
    if (adminsError) throw adminsError;
    const allowedEmails = new Set((admins ?? [])
      .filter((row) => row.role === 'super_admin' || row.permissions?.orders !== false)
      .map((row) => row.email));
    const subscriptions = (storedSubscriptions ?? [])
      .filter((row) => allowedEmails.has(row.admin_email)) as SubscriptionRow[];

    const { data: claimed, error: claimError } = await admin
      .from('order_push_deliveries')
      .insert({ order_key: orderKey, order_code: first.order_code, status: 'processing' })
      .select('order_key')
      .maybeSingle();
    if (claimError?.code === '23505') return json({ ok: true, skipped: 'already notified' });
    if (claimError) throw claimError;
    if (!claimed) return json({ ok: true, skipped: 'already notified' });

    const count = orders.length;
    const orderLabel = first.order_code ? ` · ${first.order_code}` : '';
    const notification = JSON.stringify({
      title: 'New order on ORNIX',
      body: `${first.customer_name || 'A customer'} ordered ${count} item${count === 1 ? '' : 's'}${orderLabel}`,
      tag: `ornix-order-${orderKey}`,
      url: '/admin',
    });
    const staleEndpoints: string[] = [];
    const outcomes = await Promise.allSettled((subscriptions ?? []).map(async (row: SubscriptionRow) => {
      try {
        await webpush.sendNotification(row.subscription, notification, { TTL: 60 * 60 });
      } catch (error) {
        const statusCode = pushStatusCode(error);
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(row.endpoint);
        throw error;
      }
    }));
    if (staleEndpoints.length) {
      const { error } = await admin.from('admin_push_subscriptions').delete().in('endpoint', staleEndpoints);
      if (error) console.error('Could not remove expired order-push subscriptions.', error);
    }

    const failed = outcomes.filter((result) => result.status === 'rejected').length;
    const deliveryStatus = failed === 0 ? 'sent' : outcomes.length === failed ? 'failed' : 'partial';
    const { error: updateError } = await admin.from('order_push_deliveries')
      .update({ status: deliveryStatus, attempted_count: outcomes.length, failed_count: failed, completed_at: new Date().toISOString() })
      .eq('order_key', orderKey);
    if (updateError) throw updateError;
    if (failed > 0) console.error(`Order push ${orderKey}: ${failed} of ${outcomes.length} device delivery attempts failed.`);
    return json({ ok: true, attempted: outcomes.length, failed });
  } catch (error) {
    console.error('Could not send new-order push notifications.', error);
    return json({ error: error instanceof Error ? error.message : 'Order push delivery failed.' }, 500);
  }
});
