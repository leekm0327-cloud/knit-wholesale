import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';

// Read-only overview. Explicit fields avoid exposing staff credentials or payroll.
export function readOperations(db: Database.Database, now = Date.now()) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const team = db.prepare(`SELECT s.id,s.staff_id AS staffId,COALESCE(p.name,'미등록 직원') AS name,s.start_time AS startTime,s.end_time AS endTime,s.position FROM shifts s LEFT JOIN staff p ON p.id=s.staff_id WHERE s.work_date=? ORDER BY s.start_time,s.id`).all(today);
  const stock = db.prepare(`SELECT p.id AS productId,p.name,s.grams,s.minimum_grams AS minimumGrams,s.updated_at AS updatedAt,s.updated_by AS updatedBy FROM staff_bean_stock s JOIN products p ON p.id=s.product_id JOIN product_categories c ON c.key=p.category WHERE s.tracked=1 AND c.is_bean=1 ORDER BY p.sort_order,p.id`).all();
  const supply = db.prepare(`SELECT o.id,o.vendor,o.body,o.order_date AS orderDate,m.status,m.expected_date AS expectedDate FROM supply_orders o JOIN supply_order_meta m ON m.order_id=o.id WHERE m.status IN ('needed','ordered','partial','refund_pending') ORDER BY o.order_date,o.id`).all();
  return { today, team, stock, supply };
}
export function registerAdminOperations(app: Express, db: Database.Database, auth: RequestHandler) {
  app.get('/api/admin/operations', auth, (_req, res, next) => {
    try { res.json(readOperations(db)); } catch (error) { next(error); }
  });
}
