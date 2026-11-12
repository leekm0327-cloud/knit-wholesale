/** Display-only cutoff. Never changes issuance, order links, or accounting records. */
export const TAX_INVOICE_VISIBLE_AFTER = '2026-09-08';
export function isTaxInvoiceVisible(date: unknown, environment: string): boolean {
  // Retain malformed/missing dates for review instead of silently hiding them.
  return environment !== 'production' || typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > TAX_INVOICE_VISIBLE_AFTER;
}
