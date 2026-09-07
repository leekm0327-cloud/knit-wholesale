import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { supplyStates, type SupplyState } from '../shared/supply-workflow';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, '날짜를 확인해 주세요.');
const url = z.string().max(2000).refine(v => !v || /^https?:\/\//i.test(v), '구매 링크는 http 또는 https 주소로 입력해 주세요.');
const fields = z.object({ orderDate: date, vendor: z.string().trim().max(40), body: z.string().trim().min(1, '품목과 수량을 적어주세요.').max(2000), amount: z.number().int().min(0).max(100000000), destination: z.string().trim().max(100), expectedDate: z.union([date, z.literal('')]), link: url, note: z.string().trim().max(1000) });
const version = z.number().int().nonnegative();
const create = fields.extend({ status: z.enum(['needed', 'ordered', 'received']) });
const transitions: Record<SupplyState, SupplyState[]> = { needed: ['ordered', 'received', 'cancelled'], ordered: ['partial', 'received', 'cancelled', 'refund_pending'], partial: ['received', 'refund_pending'], received: ['refund_pending'], cancelled: [], refund_pending: ['refunded', 'ordered', 'received'], refunded: [], recorded: ['ordered', 'received', 'cancelled', 'refund_pending'] };
const kg = z.number().finite().min(0).max(10000).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001, '소수점 셋째 자리까지 입력해 주세요.');
const select = `SELECT o.id,o.order_date AS orderDate,o.vendor,o.body,o.amount,o.staff_id AS staffId,o.staff_name AS staffName,o.updated_at AS updatedAt,COALESCE(m.status,'recorded') AS status,COALESCE(m.destination,'') AS destination,COALESCE(m.expected_date,'') AS expectedDate,COALESCE(m.link,'') AS link,COALESCE(m.note,'') AS note,COALESCE(m.received_by,'') AS receivedBy,m.received_at AS receivedAt,m.product_id AS productId FROM supply_orders o LEFT JOIN supply_order_meta m ON m.order_id=o.id`;
// Additive tables only: historical orders keep their original values and unknown receipt state.
export function initSupplyWorkflow(db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS supply_order_meta (order_id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'recorded', destination TEXT NOT NULL DEFAULT '', expected_date TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', received_by TEXT NOT NULL DEFAULT '', received_at INTEGER, product_id INTEGER);
  CREATE TABLE IF NOT EXISTS supply_order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, staff_id INTEGER NOT NULL, staff_name TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_supply_events_order ON supply_order_events(order_id,id);
  CREATE TABLE IF NOT EXISTS supply_templates (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,vendor TEXT NOT NULL,body TEXT NOT NULL,link TEXT NOT NULL,destination TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS staff_bean_stock (product_id INTEGER PRIMARY KEY, tracked INTEGER NOT NULL DEFAULT 1, grams INTEGER, minimum_grams INTEGER, version INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL DEFAULT '', updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS staff_bean_stock_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,grams INTEGER,minimum_grams INTEGER,tracked INTEGER NOT NULL,staff_id INTEGER NOT NULL,staff_name TEXT NOT NULL,created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_bean_stock_history ON staff_bean_stock_logs(product_id,id);`);
}
export function registerSupplyWorkflow(app: Express, db: Database.Database, auth: RequestHandler) {
    initSupplyWorkflow(db);
    const route = (fn: (req: any, res: any, me: any) => void): RequestHandler => (req, res, next) => {
        try {
            const me = db.prepare('SELECT id,name FROM staff WHERE id=? AND active=1').get(req.session.staffId) as any;
            if (!me) {
                res.status(401).json({ message: '직원 로그인이 필요합니다.' });
                return;
            }
            fn(req, res, me);
        }
        catch (e) {
            if (e instanceof z.ZodError)
                res.status(400).json({ message: e.errors[0].message });
            else
                next(e);
        }
    };
    const get = (id: number) => db.prepare(select + ' WHERE o.id=?').get(id) as any;
    const event = (id: number, status: string, note: string, me: any, now: number) => db.prepare('INSERT INTO supply_order_events(order_id,status,note,staff_id,staff_name,created_at) VALUES(?,?,?,?,?,?)').run(id, status, note, me.id, me.name, now);
    const meta = (id: number, p: any, me: any, now: number) => db.prepare(`INSERT INTO supply_order_meta(order_id,status,destination,expected_date,link,note,received_by,received_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,destination=excluded.destination,expected_date=excluded.expected_date,link=excluded.link,note=excluded.note,received_by=excluded.received_by,received_at=excluded.received_at`).run(id, p.status, p.destination, p.expectedDate, p.link, p.note, p.status === 'received' ? (p.receivedBy || me.name) : (p.receivedBy || ''), p.status === 'received' ? (p.receivedAt || now) : (p.receivedAt || null));
    const insert = (p: any, me: any) => { const now = Date.now(); const id = Number(db.prepare('INSERT INTO supply_orders(order_date,vendor,body,amount,staff_id,staff_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(p.orderDate, p.vendor, p.body, p.status === 'needed' ? 0 : p.amount, me.id, me.name, now, now).lastInsertRowid); meta(id, p, me, now); event(id, p.status, '기록 생성', me, now); return id; };
    const check = (req: any, res: any) => { const id = z.coerce.number().int().positive().parse(req.params.id); const row = get(id); if (!row) {
        res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
        return null;
    } if (row.updatedAt !== version.parse(req.body.version)) {
        res.status(409).json({ message: '다른 직원이 수정했습니다. 새로고침 후 다시 확인해 주세요.' });
        return null;
    } return row; };
    app.get('/api/staff/supply-board', auth, route((req, res) => { const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month); res.json(db.prepare(select + ` WHERE substr(o.order_date,1,7)=? OR m.status IN ('needed','ordered','partial','refund_pending') ORDER BY o.order_date DESC,o.id DESC`).all(month)); }));
    app.post('/api/staff/supply-board', auth, route((req, res, me) => { const p = create.parse(req.body); res.json(get(db.transaction(() => insert(p, me))())); }));
    app.patch('/api/staff/supply-board/:id', auth, route((req, res, me) => { const p = fields.parse(req.body); const row = check(req, res); if (!row)
        return; if (row.staffId !== me.id) {
        res.status(403).json({ message: '직접 작성한 기록만 수정할 수 있습니다.' });
        return;
    } const now = Math.max(Date.now(), row.updatedAt + 1); db.transaction(() => { db.prepare('UPDATE supply_orders SET order_date=?,vendor=?,body=?,amount=?,updated_at=? WHERE id=?').run(p.orderDate, p.vendor, p.body, row.status === 'needed' ? 0 : p.amount, now, row.id); meta(row.id, { ...row, ...p }, me, row.receivedAt || now); event(row.id, row.status, '내용 수정', me, now); })(); res.json(get(row.id)); }));
    app.post('/api/staff/supply-board/:id/status', auth, route((req, res, me) => { const p = z.object({ status: z.enum(supplyStates), note: z.string().trim().max(1000), order: fields.optional() }).parse(req.body); const row = check(req, res); if (!row)
        return; if (!transitions[row.status as SupplyState].includes(p.status)) {
        res.status(400).json({ message: '현재 상태에서 변경할 수 없습니다.' });
        return;
    } if (['partial', 'cancelled', 'refund_pending', 'refunded'].includes(p.status) && !p.note) {
        res.status(400).json({ message: '누락 품목이나 처리 내용을 남겨주세요.' });
        return;
    } if (row.status === 'needed' && p.status !== 'cancelled' && !p.order) {
        res.status(400).json({ message: '결제한 내용을 입력해 주세요.' });
        return;
    } const now = Math.max(Date.now(), row.updatedAt + 1); db.transaction(() => { if (p.order && row.status === 'needed')
        db.prepare('UPDATE supply_orders SET order_date=?,vendor=?,body=?,amount=?,staff_id=?,staff_name=? WHERE id=?').run(p.order.orderDate, p.order.vendor, p.order.body, p.order.amount, me.id, me.name, row.id); db.prepare('UPDATE supply_orders SET updated_at=? WHERE id=?').run(now, row.id); meta(row.id, { ...row, ...(row.status === 'needed' ? p.order : {}), status: p.status, note: p.note, receivedBy: p.status === 'received' ? me.name : row.receivedBy, receivedAt: p.status === 'received' ? now : row.receivedAt }, me, now); event(row.id, p.status, p.note, me, now); })(); res.json(get(row.id)); }));
    app.get('/api/staff/supply-board/:id/events', auth, route((req, res) => { res.json(db.prepare('SELECT id,status,note,staff_name AS staffName,created_at AS createdAt FROM supply_order_events WHERE order_id=? ORDER BY id DESC').all(z.coerce.number().int().positive().parse(req.params.id))); }));
    app.get('/api/staff/supply-templates', auth, route((_req, res) => res.json(db.prepare('SELECT * FROM supply_templates ORDER BY id DESC').all())));
    app.post('/api/staff/supply-templates', auth, route((req, res) => { const p = fields.pick({ vendor: true, body: true, link: true, destination: true }).extend({ name: z.string().trim().min(1).max(60) }).parse(req.body); const result = db.prepare('INSERT INTO supply_templates(name,vendor,body,link,destination) VALUES(?,?,?,?,?)').run(p.name, p.vendor, p.body, p.link, p.destination); res.json({ id: result.lastInsertRowid }); }));
    app.delete('/api/staff/supply-templates/:id', auth, route((req, res) => { db.prepare('DELETE FROM supply_templates WHERE id=?').run(z.coerce.number().int().positive().parse(req.params.id)); res.json({ ok: true }); }));
    const bean = (id: number) => db.prepare('SELECT p.id,p.name FROM products p JOIN product_categories c ON c.key=p.category WHERE p.id=? AND c.is_bean=1').get(id) as any;
    app.get('/api/staff/bean-stock', auth, route((_req, res) => res.json(db.prepare(`SELECT p.id AS productId,p.name,p.available,COALESCE(s.tracked,0) AS tracked,s.grams,s.minimum_grams AS minimumGrams,COALESCE(s.version,0) AS version,COALESCE(s.updated_by,'') AS updatedBy,s.updated_at AS updatedAt FROM products p JOIN product_categories c ON c.key=p.category LEFT JOIN staff_bean_stock s ON s.product_id=p.id WHERE c.is_bean=1 ORDER BY p.sort_order,p.id`).all())));
    app.put('/api/staff/bean-stock/:id', auth, route((req, res, me) => { const id = z.coerce.number().int().positive().parse(req.params.id); const p = z.object({ kg: kg.nullable(), minimumKg: kg.nullable(), tracked: z.boolean(), version }).parse(req.body); if (!bean(id)) {
        res.status(404).json({ message: '등록된 원두 상품을 찾을 수 없습니다.' });
        return;
    } const result = db.transaction(() => { const old = db.prepare('SELECT * FROM staff_bean_stock WHERE product_id=?').get(id) as any; if ((old?.version || 0) !== p.version)
        return false; const now = Date.now(), g = p.kg === null ? null : Math.round(p.kg * 1000), m = p.minimumKg === null ? null : Math.round(p.minimumKg * 1000); db.prepare(`INSERT INTO staff_bean_stock(product_id,tracked,grams,minimum_grams,version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET tracked=excluded.tracked,grams=excluded.grams,minimum_grams=excluded.minimum_grams,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(id, +p.tracked, g, m, p.version + 1, me.name, now); db.prepare('INSERT INTO staff_bean_stock_logs(product_id,grams,minimum_grams,tracked,staff_id,staff_name,created_at) VALUES(?,?,?,?,?,?,?)').run(id, g, m, +p.tracked, me.id, me.name, now); return true; })(); if (!result) {
        res.status(409).json({ message: '다른 직원이 재고를 변경했습니다. 새로고침 후 다시 확인해 주세요.' });
        return;
    } res.json({ ok: true }); }));
    app.get('/api/staff/bean-stock/:id/history', auth, route((req, res) => res.json(db.prepare('SELECT grams,minimum_grams AS minimumGrams,tracked,staff_name AS staffName,created_at AS createdAt FROM staff_bean_stock_logs WHERE product_id=? ORDER BY id DESC LIMIT 30').all(z.coerce.number().int().positive().parse(req.params.id)))));
    app.post('/api/staff/bean-stock/:id/request', auth, route((req, res, me) => { const id = z.coerce.number().int().positive().parse(req.params.id); const product = bean(id); if (!product) {
        res.status(404).json({ message: '원두를 찾을 수 없습니다.' });
        return;
    } const result = db.transaction(() => { const old = db.prepare(`SELECT order_id FROM supply_order_meta WHERE product_id=? AND status IN ('needed','ordered','partial')`).get(id) as any; if (old)
        return { id: old.order_id, existing: true }; const d = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); const n = insert({ orderDate: d, vendor: '니트커피', body: product.name + ' · 발주 수량 확인 필요', amount: 0, status: 'needed', destination: '매장', expectedDate: '', link: '', note: '원두 재고에서 추가' }, me); db.prepare('UPDATE supply_order_meta SET product_id=? WHERE order_id=?').run(id, n); return { id: n, existing: false }; })(); res.json(result); }));
}
