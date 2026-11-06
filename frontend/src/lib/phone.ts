/** Build a dialer URL from profile phone (digits / +). */
export function toTelHref(phone: string | null | undefined): string | undefined {
  if (phone == null || String(phone).trim() === '') return undefined;
  let s = String(phone).trim().replace(/[\s\-().]/g, '');
  if (!s) return undefined;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  return `tel:${s}`;
}
