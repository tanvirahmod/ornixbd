/** Map Bengali (০-৯) and Arabic-Indic (٠-٩) digits to ASCII. */
export function toAsciiDigits(raw: string): string {
  return raw.replace(/[\u09E6-\u09EF\u0660-\u0669]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String.fromCharCode(code - (code >= 0x09e6 ? 0x09e6 : 0x0660) + 48);
  });
}

/** Normalize a BD mobile number's formatting while preserving its prefix. */
export function normalizeBdPhone(raw: string): string {
  const trimmed = toAsciiDigits(raw).replace(/[\s\-()]/g, '');
  return trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/\D/g, '')}` : trimmed.replace(/\D/g, '');
}

export function isValidBdMobile(raw: string): boolean {
  return /^(?:(?:\+|00)?880|0)?1[3-9]\d{8}$/.test(normalizeBdPhone(raw));
}

/** Return a valid BD mobile in the domestic 01xxxxxxxxx format required by Steadfast. */
export function normalizeBdMobileForCourier(raw: string): string | null {
  let digits = toAsciiDigits(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('880')) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith('88')) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith('1')) {
    digits = `0${digits}`;
  }

  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
