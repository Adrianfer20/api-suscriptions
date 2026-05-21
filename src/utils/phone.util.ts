export function normalizePhone(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  if (!phone) return '';

  return phone
    .replace(/^whatsapp:/i, '')
    .replace(/[\s()-]/g, '');
}
