import type Database from 'better-sqlite3';
import {hasValidShippingTracking} from './roastery-tracking';
const eligible=`o.status='done' AND c.role='customer' AND o.is_sample=0 AND o.is_store_order=0
 AND NOT EXISTS(SELECT 1 FROM activity_logs WHERE target_type='order' AND target_id=CAST(o.id AS TEXT) AND action='order.admin_create')
 AND json_valid(o.items) AND json_array_length(o.items)>0
 AND NOT EXISTS(SELECT 1 FROM json_each(o.items) WHERE json_extract(value,'$.qty') IS NULL OR json_extract(value,'$.qty')<=0)
 AND roastery_missing_tracking(o.items,o.customer_snapshot,o.status,o.tracking_no,sh.tracking,sh.state,sh.order_fingerprint)=1`;
const source=`FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN roastery_shipments sh ON sh.order_id=o.id`;
const supplier=`SELECT s.id FROM suppliers s WHERE s.name='클라리멘토' AND (SELECT count(*) FROM suppliers WHERE name='클라리멘토')=1
 AND (EXISTS(SELECT 1 FROM roastery_members WHERE roastery_id=s.id AND enabled=1) OR EXISTS(SELECT 1 FROM roastery_links WHERE roastery_id=s.id AND revoked_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000))`;
/** Startup migration is local-only until this code is explicitly approved for deployment. No order/status/notification mutation. */
export function installRoasteryWorkflow(db:Database.Database){
 db.function('roastery_missing_tracking',{deterministic:true},(items,snapshot,status,legacy,tracking,state,fingerprint)=>
  Number(!hasValidShippingTracking({items,customer_snapshot:snapshot,order_status:status,legacy_tracking:legacy,tracking,state,order_fingerprint:fingerprint})));
 db.exec(`CREATE TABLE IF NOT EXISTS roastery_confirmations(order_id INTEGER PRIMARY KEY,confirmed_at INTEGER NOT NULL,source TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS roastery_assignment_batches(order_id INTEGER PRIMARY KEY,roastery_id INTEGER NOT NULL,batch TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS roastery_dispatch_outbox(order_id INTEGER PRIMARY KEY,carrier TEXT NOT NULL,tracking TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('suppressed','correction_hold')),reason TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);`);
 db.transaction(()=>{
 db.exec(`DROP TRIGGER IF EXISTS roastery_confirm_assign_v1;
 CREATE TRIGGER IF NOT EXISTS roastery_confirm_assign_v2 AFTER UPDATE OF status ON orders WHEN OLD.status='pending' AND NEW.status='done'
 BEGIN
 INSERT OR IGNORE INTO roastery_confirmations VALUES(NEW.id,CAST(strftime('%s','now') AS INTEGER)*1000,'admin_pending_to_done');
 INSERT OR IGNORE INTO roastery_assignments(order_id,roastery_id) SELECT o.id,s.id ${source} JOIN suppliers s ON s.id=(${supplier}) WHERE o.id=NEW.id AND ${eligible};
 INSERT OR IGNORE INTO roastery_assignment_batches SELECT a.order_id,a.roastery_id,'confirmation-v2',CAST(strftime('%s','now') AS INTEGER)*1000 FROM roastery_assignments a WHERE a.order_id=NEW.id AND changes()=1;
 INSERT INTO roastery_audit(order_id,actor,action,details,created_at) SELECT NEW.id,0,'auto_assigned',json_object('source','admin_pending_to_done','batch','confirmation-v2'),CAST(strftime('%s','now') AS INTEGER)*1000 WHERE changes()=1;
 END;`);
 })();
 return backfillMissingTrackingAssignments(db);
}
/** All confirmed normal wholesale orders without effective tracking, regardless of age/physical dispatch. */
export function backfillMissingTrackingAssignments(db:Database.Database){
 const run=db.transaction(()=>{
 const partner:any=db.prepare(supplier).get();if(!partner)return {assigned:0,reason:'supplier_unavailable'};
 const rows:any[]=db.prepare(`SELECT o.id ${source} WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM roastery_assignments a WHERE a.order_id=o.id)`).all();
 for(const o of rows){
 db.prepare('INSERT INTO roastery_assignments(order_id,roastery_id) VALUES(?,?)').run(o.id,partner.id);
 db.prepare('INSERT INTO roastery_assignment_batches(order_id,roastery_id,batch,created_at) VALUES(?,?,?,?)').run(o.id,partner.id,'missing-tracking-v2',Date.now());
 db.prepare('INSERT INTO roastery_audit(order_id,actor,action,details,created_at) VALUES(?,0,?,?,?)').run(o.id,'missing_tracking_assigned',JSON.stringify({batch:'missing-tracking-v2',roasteryId:partner.id}),Date.now());
 }
 return {assigned:rows.length,reason:null};
 });return run.immediate();
}
/** Called inside the same IMMEDIATE transaction as shipment persistence. No transport, worker, or replay path exists in this release. */
export function recordDispatchNotice(db:Database.Database,orderId:number,carrier:string,tracking:string){
 db.prepare(`INSERT INTO roastery_dispatch_outbox(order_id,carrier,tracking,status,reason,created_at,updated_at) VALUES(?,?,?,'suppressed','발송 연동 미활성 · 자동 재생 금지',?,?) ON CONFLICT(order_id) DO UPDATE SET status=CASE WHEN carrier=excluded.carrier AND tracking=excluded.tracking THEN status ELSE 'correction_hold' END,reason=CASE WHEN carrier=excluded.carrier AND tracking=excluded.tracking THEN reason ELSE '송장 정정 · 추가 알림 보류' END,updated_at=excluded.updated_at`).run(orderId,carrier,tracking,Date.now(),Date.now());
}
