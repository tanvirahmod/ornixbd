// ── Steadfast Courier API client ──
// All courier calls go through the `steadfast-proxy` Edge Function
// (supabase/functions/steadfast-proxy). The API keys live ONLY in Edge
// Function secrets — they never reach the browser bundle.
//
//   create  → book a consignment (admin session required)
//   status  → status by tracking code (no auth — the public tracking page uses this)
//   balance → courier account balance (admin session required)

import { supabase } from './supabase';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** True once an Edge Function has been deployed for the proxy. */
export const steadfastConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && ANON_KEY);

async function proxy<T extends Record<string, unknown>>(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: T; message: string; raw: string }> {
  // Send the signed-in admin's access token when we have one — the proxy
  // verifies the admin session from it. Falls back to the anon key for the
  // public status lookup on the tracking page.
  let bearer = ANON_KEY;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) bearer = sessionData.session.access_token;
  } catch {
    // not signed in — anon bearer is fine for public actions
  }
  const res = await fetch(`${FUNCTIONS_URL}/steadfast-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, apikey: ANON_KEY },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: T = {} as T;
  let ok = res.ok;
  let httpStatus = res.status;
  try {
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : ({} as Record<string, unknown>);
    // The proxy wraps upstream responses as { ok, status, data }. Unwrap it;
    // fall back to the raw body for non-envelope responses.
    if (body && typeof body === 'object' && 'ok' in body && 'data' in body) {
      ok = Boolean(body.ok);
      httpStatus = Number(body.status ?? res.status);
      data = (body.data ?? {}) as T;
    } else {
      data = body as T;
    }
  } catch {
    // non-JSON response — keep raw text for diagnostics
  }
  return { ok, status: httpStatus, data, message: (data as { message?: string }).message ?? '', raw: text.slice(0, 300) };
}

export type SteadfastBookingInput = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  weight?: number;
  note?: string;
};

export type SteadfastBookingResult = {
  ok: boolean;
  trackingCode: string | null;
  consignmentId: string | null;
  message: string;
};

/** Book a consignment with Steadfast (admin session required by the proxy). */
export async function createSteadfastConsignment(
  input: SteadfastBookingInput
): Promise<SteadfastBookingResult> {
  try {
    const { ok, data, message, status, raw } = await proxy<Record<string, unknown>>({
      action: 'create',
      invoice: input.invoice,
      recipient_name: input.recipient_name,
      recipient_phone: input.recipient_phone,
      recipient_address: input.recipient_address,
      cod_amount: input.cod_amount,
      weight: input.weight ?? 1.5, // declared parcel weight (kg)
      note: input.note ?? '',
    });

    // Steadfast's create_order response shape has varied: some accounts return
    // { consignment: { tracking_code, … } }, others flat { tracking_code, … }.
    const consignment = ((data.consignment as Record<string, unknown> | undefined) ?? data) as Record<string, unknown>;
    const trackingCode = (consignment.tracking_code as string | undefined) ?? null;
    const consignmentId = consignment.consignment_id != null ? String(consignment.consignment_id) : null;

    if (ok && trackingCode) {
      return { ok: true, trackingCode, consignmentId, message: (data.message as string) ?? 'Consignment created.' };
    }

    // Steadfast often returns validation errors as { message: "The X field is required." , errors: {...} }
    const errMsg =
      (data.message as string | undefined) ??
      (data.error as string | undefined) ??
      (message || `Steadfast booking failed (HTTP ${status}).`);
    // Surface the raw body so unexpected shapes are diagnosable from the toast
    const dump = raw && !data.message && !trackingCode ? ` — ${raw}` : '';
    return { ok: false, trackingCode: null, consignmentId: null, message: errMsg + dump };
  } catch (err) {
    return {
      ok: false,
      trackingCode: null,
      consignmentId: null,
      message: err instanceof Error && err.message === 'Failed to fetch'
        ? 'Could not reach the Steadfast proxy (is the Edge Function deployed?).'
        : `Could not reach Steadfast: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export type SteadfastStatusResult = {
  ok: boolean;
  status: string | null;
  message: string;
  /** True when Steadfast has no such consignment (deleted, or never existed
   *  on this merchant account) — the API answers 401 "Unauthorized Access". */
  notFound?: boolean;
};

/** Check delivery status by tracking code (public — no auth needed). */
export async function checkSteadfastStatus(trackingCode: string): Promise<SteadfastStatusResult> {
  try {
    const { ok, data, status: httpStatus, message } = await proxy<Record<string, unknown>>({
      action: 'status',
      tracking_code: trackingCode,
    });

    if (httpStatus === 401) {
      return { ok: false, status: null, notFound: true, message: 'Steadfast has no record of this tracking code (it may have been deleted from the portal).' };
    }

    if (ok && data.delivery_status) {
      const status = String(data.delivery_status);
      // Steadfast answers 200 + delivery_status:"unknown" for consignments that
      // no longer exist on the merchant account (e.g. the pickup request was
      // deleted from their portal). Treat that as "unbooked" upstream.
      if (status === 'unknown') {
        return { ok: false, status, notFound: true, message: 'Steadfast has no active record of this tracking code (it may have been deleted from the portal).' };
      }
      return { ok: true, status, message: 'ok' };
    }
    return { ok: false, status: null, message: message || `Status check failed (HTTP ${httpStatus}).` };
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error && err.message === 'Failed to fetch'
        ? 'Could not reach the Steadfast proxy (is the Edge Function deployed?).'
        : `Could not reach Steadfast: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

// Map Steadfast delivery statuses to { label, classes } for admin badges.
const STEADFAST_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Steadfast: Pending', cls: 'bg-stone-100 text-stone-600 border border-stone-200' },
  in_review: { label: 'Steadfast: In review', cls: 'bg-sky-50 text-sky-700 border border-sky-200' },
  hold: { label: 'Steadfast: On hold', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  unknown: { label: 'Steadfast: Unknown', cls: 'bg-stone-100 text-stone-500 border border-stone-200' },
  delivered_approval_pending: { label: 'Steadfast: Delivered (pending approval)', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  partial_delivered_approval_pending: { label: 'Steadfast: Partially delivered (pending approval)', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  cancelled_approval_pending: { label: 'Steadfast: Cancelled (pending approval)', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  unknown_approval_pending: { label: 'Steadfast: Needs support', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  delivered: { label: 'Steadfast: Delivered', cls: 'bg-emerald-500 text-white border border-emerald-500' },
  partial_delivered: { label: 'Steadfast: Partially delivered', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  cancelled: { label: 'Steadfast: Cancelled', cls: 'bg-red-50 text-red-600 border border-red-200' },
};

export function steadfastStatusMeta(status: string | null | undefined) {
  if (!status) return null;
  return STEADFAST_STATUS_META[status] ?? { label: `Steadfast: ${status}`, cls: 'bg-stone-100 text-stone-600 border border-stone-200' };
}

// ── Delivery pipeline (admin tracker) ──
// Steadfast's 11 raw statuses collapse into 5 meaningful stages.
export type SteadfastStage = 'booked' | 'in_review' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

export const STEADFAST_STAGES: Array<{ key: SteadfastStage; label: string }> = [
  { key: 'booked', label: 'Booked' },
  { key: 'in_review', label: 'In review' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

const STAGE_FINAL: Record<string, 'delivered' | 'cancelled' | null> = {
  delivered: 'delivered',
  delivered_approval_pending: 'delivered',
  partial_delivered: 'delivered',
  partial_delivered_approval_pending: 'delivered',
  cancelled: 'cancelled',
  cancelled_approval_pending: 'cancelled',
};

/** Collapse a raw Steadfast status into a pipeline stage (null = not booked/unknown). */
export function steadfastStageFor(status: string | null | undefined): SteadfastStage | null {
  if (!status) return null;
  const final = STAGE_FINAL[status];
  if (final) return final;
  switch (status) {
    case 'pending': return 'booked';
    case 'in_review': return 'in_review';
    case 'hold':
    case 'unknown':
    case 'unknown_approval_pending':
      return 'picked_up';
    default: return null;
  }
}

const STAGE_CLS: Record<SteadfastStage, string> = {
  booked: 'bg-stone-100 text-stone-600 border border-stone-200',
  in_review: 'bg-sky-50 text-sky-700 border border-sky-200',
  picked_up: 'bg-amber-50 text-amber-700 border border-amber-200',
  in_transit: 'bg-amber-50 text-amber-700 border border-amber-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
};

const STAGE_LABEL: Record<SteadfastStage, string> = {
  booked: 'Booked',
  in_review: 'In review',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function steadfastStageBadge(status: string | null | undefined) {
  const stage = steadfastStageFor(status);
  return stage ? { stage, label: STAGE_LABEL[stage], cls: STAGE_CLS[stage] } : null;
}

export type SteadfastBalanceResult = {
  ok: boolean;
  balance: number | null;
  message: string;
};

/** Current Steadfast account balance (how much cash the courier is holding for COD settlement). */
export async function getSteadfastBalance(): Promise<SteadfastBalanceResult> {
  try {
    const { ok, data, status: httpStatus, message } = await proxy<Record<string, unknown>>({ action: 'balance' });
    if (ok && data.current_balance != null) {
      return { ok: true, balance: Number(data.current_balance), message: 'ok' };
    }
    return { ok: false, balance: null, message: message || `Balance check failed (HTTP ${httpStatus}).` };
  } catch (err) {
    return {
      ok: false,
      balance: null,
      message: err instanceof Error && err.message === 'Failed to fetch'
        ? 'Could not reach the Steadfast proxy (is the Edge Function deployed?).'
        : `Could not reach Steadfast: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}
