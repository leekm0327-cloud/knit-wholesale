import {shippingOrderFingerprint} from '../../server/roastery-tracking';
import assert from 'node:assert/strict';
import {fixture} from './roastery-shipping.fixture';
import {installRoasteryWorkflow,recordDispatchNotice} from '../../server/roastery-workflow';
const {db}=fixture();
try{
 db.exec("UPDATE suppliers SET name='클라리멘토' WHERE id=10");
 let id=100;const make=(patch:Record<string,unknown>={})=>{const n=id++;db.prepare(`INSERT INTO orders(id,order_no,items,customer_snapshot,status,created_at,customer_id,is_sample,is_store_order) VALUES(?,?,'[{"name":"가상 원두","qty":5}]','{}','pending',1,4,0,0)`).run(n,'VIRTUAL-'+n);for(const [k,v] of Object.entries(patch))db.prepare('UPDATE orders SET '+k+'=? WHERE id=?').run(v,n);return n;};
 const assigned=(n:number)=>db.prepare('SELECT * FROM roastery_assignments WHERE order_id=?').get(n);
 const confirm=(n:number)=>db.prepare("UPDATE orders SET status='done' WHERE id=?").run(n);
 // Reproduce a database upgraded from the pre-staff v2 trigger, not just a fresh install.
 db.exec(`DROP TRIGGER roastery_confirm_assign_v3;
 CREATE TRIGGER IF NOT EXISTS roastery_confirm_assign_v2 AFTER UPDATE OF status ON orders WHEN OLD.status='pending' AND NEW.status='done'
 BEGIN
 INSERT OR IGNORE INTO roastery_confirmations VALUES(NEW.id,CAST(strftime('%s','now') AS INTEGER)*1000,'admin_pending_to_done');
 INSERT OR IGNORE INTO roastery_assignments(order_id,roastery_id) SELECT o.id,s.id FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN roastery_shipments sh ON sh.order_id=o.id JOIN suppliers s ON s.id=(SELECT s.id FROM suppliers s WHERE s.name='클라리멘토' AND (SELECT count(*) FROM suppliers WHERE name='클라리멘토')=1
 AND (EXISTS(SELECT 1 FROM roastery_members WHERE roastery_id=s.id AND enabled=1) OR EXISTS(SELECT 1 FROM roastery_links WHERE roastery_id=s.id AND revoked_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000))) WHERE o.id=NEW.id AND o.status='done' AND c.role='customer' AND o.is_sample=0 AND o.is_store_order=0
 AND NOT EXISTS(SELECT 1 FROM activity_logs WHERE target_type='order' AND target_id=CAST(o.id AS TEXT) AND action='order.admin_create')
 AND json_valid(o.items) AND json_array_length(o.items)>0
 AND NOT EXISTS(SELECT 1 FROM json_each(o.items) WHERE json_extract(value,'$.qty') IS NULL OR json_extract(value,'$.qty')<=0)
 AND roastery_missing_tracking(o.items,o.customer_snapshot,o.status,o.tracking_no,sh.tracking,sh.state,sh.order_fingerprint)=1;
 INSERT OR IGNORE INTO roastery_assignment_batches SELECT a.order_id,a.roastery_id,'confirmation-v2',CAST(strftime('%s','now') AS INTEGER)*1000 FROM roastery_assignments a WHERE a.order_id=NEW.id AND changes()=1;
 INSERT INTO roastery_audit(order_id,actor,action,details,created_at) SELECT NEW.id,0,'auto_assigned',json_object('source','admin_pending_to_done','batch','confirmation-v2'),CAST(strftime('%s','now') AS INTEGER)*1000 WHERE changes()=1;
 END;`);
 const backlog=make({is_store_order:1}),afterUpgrade=make({is_store_order:1}),regular=make();
 for(const id of [backlog,afterUpgrade])db.prepare('INSERT INTO staff_bean_orders VALUES(?,?,?,?,?)').run(77,'staff-'+id,'synthetic',id,1);
 confirm(backlog);assert(!assigned(backlog)); // v2 excluded even marked staff store orders.
 const beforeUpgrade=JSON.stringify(db.prepare('SELECT * FROM orders ORDER BY id').all());
 const info=console.info;
 const logs:unknown[][]=[];
 try {
  console.info=(...args)=>logs.push(args);
  assert.equal(installRoasteryWorkflow(db).assigned,1);
  assert.equal(installRoasteryWorkflow(db).assigned,0);
 } finally {console.info=info;}
 assert.deepEqual(logs,[['[roastery-workflow]',{triggerVersion:3,staffBackfilled:1}],['[roastery-workflow]',{triggerVersion:3,staffBackfilled:0}]]);
 assert.equal(assigned(backlog).roastery_id,10);
 assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'roastery_confirm_assign_%'").all().map((r:any)=>r.name),['roastery_confirm_assign_v3']);
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM orders ORDER BY id').all()),beforeUpgrade);
 assert.equal(db.prepare("SELECT count(*) n FROM roastery_audit WHERE order_id=? AND action='missing_tracking_assigned'").get(backlog).n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM roastery_dispatch_outbox').get().n,0);
 for(const id of [afterUpgrade,regular]){
  confirm(id);assert.equal(assigned(id).roastery_id,10);
  db.prepare("UPDATE orders SET status='pending' WHERE id=?").run(id);confirm(id);
  assert.equal(db.prepare("SELECT count(*) n FROM roastery_audit WHERE order_id=? AND action='auto_assigned'").get(id).n,1);
 }
 const n=make();assert(!assigned(n));confirm(n);assert.equal(assigned(n).roastery_id,10);confirm(n);assert.equal(db.prepare("SELECT count(*) n FROM roastery_audit WHERE order_id=? AND action='auto_assigned'").get(n).n,1);
 const baseline=JSON.stringify(db.prepare('SELECT * FROM orders').all());installRoasteryWorkflow(db);assert.equal(JSON.stringify(db.prepare('SELECT * FROM orders').all()),baseline);
 for(const patch of [{is_sample:1},{is_store_order:1},{is_store_order:-1},{customer_id:3},{tracking_no:'123456789'},{items:'[]'},{items:'[{"qty":-1}]'},{items:'[{"qty":null}]'}]){const x=make(patch);confirm(x);assert(!assigned(x));}
 const staffStore=make({is_store_order:1});db.prepare('INSERT INTO staff_bean_orders VALUES(?,?,?,?,?)').run(77,'staff-1','synthetic',staffStore,1);assert(!assigned(staffStore));confirm(staffStore);assert.equal(assigned(staffStore).roastery_id,10);
 const cancelled=make({status:'cancelled'});confirm(cancelled);assert(!assigned(cancelled));
 const proxy=make();db.prepare("INSERT INTO activity_logs VALUES('order.admin_create','order',?)").run(String(proxy));confirm(proxy);assert(!assigned(proxy));
 const other=make();db.prepare('INSERT INTO roastery_assignments(order_id,roastery_id) VALUES(?,20)').run(other);confirm(other);assert.equal(assigned(other).roastery_id,20);assert(!db.prepare('SELECT 1 FROM roastery_assignment_batches WHERE order_id=?').get(other));
 const shipped=make();db.prepare("INSERT INTO roastery_shipments(order_id,carrier,tracking,state,updated_at) VALUES(?,'CJ','123456789','dispatch_confirmed',1)").run(shipped);db.prepare('UPDATE roastery_shipments SET order_fingerprint=? WHERE order_id=?').run(shippingOrderFingerprint({...db.prepare('SELECT * FROM orders WHERE id=?').get(shipped),order_status:'done',legacy_tracking:''}),shipped);confirm(shipped);assert(!assigned(shipped));
 const historical=make();db.exec('DROP TRIGGER roastery_confirm_assign_v3');confirm(historical);installRoasteryWorkflow(db);assert(assigned(historical));
 const rollback=make();db.exec("CREATE TRIGGER fail_assignment BEFORE INSERT ON roastery_audit WHEN NEW.action='auto_assigned' BEGIN SELECT RAISE(ABORT,'synthetic'); END");assert.throws(()=>confirm(rollback));assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(rollback).status,'pending');assert(!assigned(rollback));db.exec('DROP TRIGGER fail_assignment');confirm(rollback);assert(assigned(rollback));
 db.exec("INSERT INTO suppliers VALUES(30,'클라리멘토')");const ambiguous=make();confirm(ambiguous);assert(!assigned(ambiguous));
 recordDispatchNotice(db,n,'CJ','111111111');recordDispatchNotice(db,n,'CJ','111111111');assert.equal(db.prepare('SELECT count(*) n FROM roastery_dispatch_outbox').get().n,1);assert.equal(db.prepare('SELECT status FROM roastery_dispatch_outbox').get().status,'suppressed');recordDispatchNotice(db,n,'CJ','222222222');assert.equal(db.prepare('SELECT status FROM roastery_dispatch_outbox').get().status,'correction_hold');
 console.log('PASS workflow: pending invisible, confirmed assigned once, eligible historical missing tracking assigned, sample/store/admin/invalid/cancelled/shipped excluded, other supplier preserved, atomic rollback/retry, duplicate supplier blocked, durable suppressed event and correction hold');
}finally{db.close();}
