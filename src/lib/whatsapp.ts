import { useSiteSettings } from './siteConfig';

// site_settings keys (editable from Admin → Settings → WhatsApp Numbers)
export const WHATSAPP_ORDER_KEY = 'whatsapp_order_number';
export const WHATSAPP_CHAT_KEY = 'whatsapp_chat_number';

export const WHATSAPP_KEYS = [WHATSAPP_ORDER_KEY, WHATSAPP_CHAT_KEY];

/** Store default (international format, no leading 0 or +) used until the admin sets one. */
export const WHATSAPP_DEFAULT = '8801410423299';

/**
 * Normalize whatever the admin types into the international digits wa.me needs:
 * "01410423299" → "8801410423299", "+880 1410-423299" → "8801410423299",
 * already-international values pass through.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `880${digits.slice(1)}`;
  return digits;
}

/** Build a wa.me link, with or without a pre-filled message. */
export function waMeLink(number: string, message?: string): string {
  if (!message) return `https://wa.me/${number}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Live WhatsApp numbers from site settings, with the store default as fallback. */
export function useWhatsAppNumbers() {
  const { values, loading } = useSiteSettings(WHATSAPP_KEYS);
  const orderNumber = normalizeWhatsAppNumber(values[WHATSAPP_ORDER_KEY] ?? '') || WHATSAPP_DEFAULT;
  const chatNumber = normalizeWhatsAppNumber(values[WHATSAPP_CHAT_KEY] ?? '') || WHATSAPP_DEFAULT;
  return { orderNumber, chatNumber, loading };
}
