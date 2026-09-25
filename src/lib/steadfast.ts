// ── Steadfast Courier API client ──
// Base URL: https://portal.packzy.com/api/v1
//   (The API lives on Steadfast's portal host "packzy.com" — the same host the
//   official WordPress plugin documents. portal.steadfast.com.bd does not
//   resolve in DNS and only serves the merchant web dashboard.)
//   POST /create_order            → book a consignment
//   GET  /status_by_trackingcode/{code} → check delivery status
// Auth headers: Api-Key + Secret-Key.
//
// ⚠️ Security note: these keys live in the merchant's browser session (admin-only pages),
// which is acceptable for a single-merchant shop. For multi-tenant deployments move these
// calls into a Supabase Edge Function so the keys never reach any client.

const BASE_URL = 'https://portal.packzy.com/api/v1';

const API_KEY = import.meta.env.VITE_STEADFAST_API_KEY ?? '';
const SECRET_KEY = import.meta.env.VITE_STEADFAST_SECRET_KEY ?? '';

export const steadfastConfigured = Boolean(API_KEY && SECRET_KEY);

function headers(): HeadersInit {
  return {
    'Api-Key': API_KEY,
    'Secret-Key': SECRET_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
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

/** Book a consignment with Steadfast. */
export async function createSteadfastConsignment(
  input: SteadfastBookingInput
): Promise<SteadfastBookingResult> {
  if (!steadfastConfigured) {
    return { ok: false, trackingCode: null, consignmentId: null, message: 'Steadfast API keys are not configured.' };
  }

  try {
    const res = await fetch(`${BASE_URL}/create_order`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        invoice: input.invoice,
        recipient_name: input.recipient_name,
        recipient_phone: input.recipient_phone,
        recipient_address: input.recipient_address,
        cod_amount: input.cod_amount,
        weight: input.weight ?? 1.5, // declared parcel weight (kg)
        note: input.note ?? '',
      }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, trackingCode: null, consignmentId: null, message: res.status === 401
        ? 'Steadfast rejected the API keys (401 Unauthorized).'
        : `Unexpected response from Steadfast (HTTP ${res.status}).` };
    }

    const consignment = (data.consignment ?? {}) as Record<string, unknown>;
    const trackingCode = (consignment.tracking_code as string | undefined) ?? null;
    const consignmentId = consignment.consignment_id != null ? String(consignment.consignment_id) : null;

    if (res.ok && trackingCode) {
      return { ok: true, trackingCode, consignmentId, message: (data.message as string) ?? 'Consignment created.' };
    }

    // Steadfast often returns validation errors as { message: "The X field is required." , errors: {...} }
    const errMsg =
      (data.message as string | undefined) ??
      (data.error as string | undefined) ??
      `Steadfast booking failed (HTTP ${res.status}).`;
    return { ok: false, trackingCode: null, consignmentId: null, message: errMsg };
  } catch (err) {
    return {
      ok: false,
      trackingCode: null,
      consignmentId: null,
      message: err instanceof Error && err.message === 'Failed to fetch'
        ? 'Could not reach Steadfast (network or CORS blocked the request).'
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

/** Check delivery status by tracking code. */
export async function checkSteadfastStatus(trackingCode: string): Promise<SteadfastStatusResult> {
  if (!steadfastConfigured) {
    return { ok: false, status: null, message: 'Steadfast API keys are not configured.' };
  }

  try {
    const res = await fetch(`${BASE_URL}/status_by_trackingcode/${encodeURIComponent(trackingCode)}`, {
      method: 'GET',
      headers: headers(),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (res.status === 401) {
        return { ok: false, status: null, notFound: true, message: 'Steadfast has no record of this tracking code (it may have been deleted from the portal).' };
      }
      return { ok: false, status: null, message: `Unexpected response from Steadfast (HTTP ${res.status}).` };
    }

    if (res.ok && data.delivery_status) {
      const status = String(data.delivery_status);
      // Steadfast answers 200 + delivery_status:"unknown" for consignments that
      // no longer exist on the merchant account (e.g. the pickup request was
      // deleted from their portal). Treat that as "unbooked" upstream.
      if (status === 'unknown') {
        return { ok: false, status, notFound: true, message: 'Steadfast has no active record of this tracking code (it may have been deleted from the portal).' };
      }
      return { ok: true, status, message: 'ok' };
    }
    return { ok: false, status: null, message: (data.message as string | undefined) ?? `Status check failed (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error && err.message === 'Failed to fetch'
        ? 'Could not reach Steadfast (network or CORS blocked the request).'
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
