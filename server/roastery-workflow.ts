import type Database from 'better-sqlite3';
/** Additive workflow. Never backfill historical orders: missing tracking is not proof of non-shipment. */
export function installRoasteryWorkflow(db:Database.Database){
 db.exec(`CREATE TABLE IF NOT EXISTS roastery_confirmations(order_id INTEGER PRIMARY KEY,confirmed_at INTEGER NOT NULL,source TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS roastery_assignment_batches(order_id INTEGER PRIMARY KEY,roastery_id INTEGER NOT NULL,batch TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS roastery_dispatch_outbox(order_id INTEGER PRIMARY KEY,carrier TEXT NOT NULL,tracking TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('suppressed','correction_hold')),reason TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS roastery_confirm_assign_v1 AFTER UPDATE OF status ON orders
 WHEN OLD.status='pending' AND NEW.status='done'
 BEGIN
 INSERT OR IGNORE INTO roastery_confirmations VALUES(NEW.id,CAST(strftime('%s','now') AS INTEGER)*1000,'admin_pending_to_done');
 INSERT OR IGNORE INTO roastery_assignments(order_id,roastery_id)
 SELECT NEW.id,s.id FROM suppliers s JOIN customers c ON c.id=NEW.customer_id
 WHERE s.name='클라리멘토' AND (SELECT count(*) FROM suppliers WHERE name='클라리멘토')=1
 AND NOT EXISTS(SELECT 1 FROM activity_logs WHERE target_type='order' AND target_id=CAST(NEW.id AS TEXT) AND action='order.admin_create')
 AND c.role='customer' AND NEW.is_sample=0 AND NEW.is_store_order=0
 AND trim(COALESCE(NEW.tracking_no,''))='' AND NOT EXISTS(SELECT 1 FROM roastery_shipments WHERE order_id=NEW.id)
 AND json_valid(NEW.items) AND json_array_length(NEW.items)>0
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.items) WHERE json_extract(value,'$.qty') IS NULL OR json_extract(value,'$.qty')<=0)
 AND (EXISTS(SELECT 1 FROM roastery_members WHERE roastery_id=s.id AND enabled=1) OR EXISTS(SELECT 1 FROM roastery_links WHERE roastery_id=s.id AND revoked_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000));
 INSERT OR IGNORE INTO roastery_assignment_batches SELECT a.order_id,a.roastery_id,'confirmation-v1',CAST(strftime('%s','now') AS INTEGER)*1000 FROM roastery_assignments a WHERE a.order_id=NEW.id AND changes()=1;
 INSERT INTO roastery_audit(order_id,actor,action,details,created_at) SELECT NEW.id,0,'auto_assigned',json_object('source','admin_pending_to_done','batch','confirmation-v1'),CAST(strftime('%s','now') AS INTEGER)*1000 WHERE changes()=1;
 END;`);
}
/** Called inside the same IMMEDIATE transaction as shipment persistence. No transport, worker, or replay path exists in this release. */
export function recordDispatchNotice(db:Database.Database,orderId:number,carrier:string,tracking:string){
 db.prepare(`INSERT INTO roastery_dispatch_outbox(order_id,carrier,tracking,status,reason,created_at,updated_at) VALUES(?,?,?,'suppressed','발송 연동 미활성 · 자동 재생 금지',?,?) ON CONFLICT(order_id) DO UPDATE SET status=CASE WHEN carrier=excluded.carrier AND tracking=excluded.tracking THEN status ELSE 'correction_hold' END,reason=CASE WHEN carrier=excluded.carrier AND tracking=excluded.tracking THEN reason ELSE '송장 정정 · 추가 알림 보류' END,updated_at=excluded.updated_at`).run(orderId,carrier,tracking,Date.now(),Date.now());
}
