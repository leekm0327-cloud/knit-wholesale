import type Database from 'better-sqlite3';
import { invoiceParty } from '../shared/tax-invoices';

/** Reuse saved legal names, never infer the representative from a contact name. */
export function buyerRepresentatives(db: Database.Database, environment: string, supplierCorp: string): Record<string, string> {
  if (!/^\d{10}$/.test(supplierCorp)) return {};
  const rows = db.prepare(`
    SELECT json_extract(payload, '$.buyer.corpNum') AS corp,
           json_extract(payload, '$.buyer.ceo') AS ceo
    FROM tax_invoice_drafts
    WHERE environment = ? AND json_valid(payload)
      AND state IN ('draft', 'rejected', 'sending', 'unknown', 'issued')
      AND json_extract(payload, '$.supplier.corpNum') = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(environment, supplierCorp) as { corp: unknown; ceo: unknown }[];
  const names: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row.corp !== 'string' || !/^\d{10}$/.test(row.corp) || names[row.corp]) continue;
    const name = invoiceParty.shape.ceo.safeParse(row.ceo);
    if (name.success) names[row.corp] = name.data;
  }
  return names;
}
