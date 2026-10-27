import assert from 'node:assert/strict';
import {fixture} from './roastery-shipping.fixture';
import {installRoasteryWorkflow,recordDispatchNotice} from '../../server/roastery-workflow';
const {db}=fixture();
try{
 db.exec("UPDATE suppliers SET name='클라리멘토' WHERE id=10");
 let id=100;const make=(patch:Record<string,unknown>={})=>{const n=id++;db.prepare(`INSERT INTO orders(id,order_no,items,customer_snapshot,status,created_at,customer_id,is_sample,is_store_order) VALUES(?,?,'[{"name":"가상 원두","qty":5}]','{}','pending',1,4,0,0)`).run(n,'VIRTUAL-'+n);for(const [k,v] of Object.entries(patch))db.prepare('UPDATE orders SET '+k+'=? WHERE id=?').run(v,n);return n;};
 const assigned=(n:number)=>db.prepare('SELECT * FROM roastery_assignments WHERE order_id=?').get(n);
 const confirm=(n:number)=>db.prepare("UPDATE orders SET status='done' WHERE id=?").run(n);
 const n=make();assert(!assigned(n));confirm(n);assert.equal(assigned(n).roastery_id,10);confirm(n);assert.equal(db.prepare("SELECT count(*) n FROM roastery_audit WHERE order_id=? AND action='auto_assigned'").get(n).n,1);
 const baseline=JSON.stringify(db.prepare('SELECT * FROM orders').all());installRoasteryWorkflow(db);assert.equal(JSON.stringify(db.prepare('SELECT * FROM orders').all()),baseline);
 for(const patch of [{is_sample:1},{is_store_order:1},{is_store_order:-1},{customer_id:3},{tracking_no:'123456789'},{items:'[]'},{items:'[{"qty":-1}]'},{items:'[{"qty":null}]'}]){const x=make(patch);confirm(x);assert(!assigned(x));}
 const cancelled=make({status:'cancelled'});confirm(cancelled);assert(!assigned(cancelled));
 const proxy=make();db.prepare("INSERT INTO activity_logs VALUES('order.admin_create','order',?)").run(String(proxy));confirm(proxy);assert(!assigned(proxy));
 const other=make();db.prepare('INSERT INTO roastery_assignments(order_id,roastery_id) VALUES(?,20)').run(other);confirm(other);assert.equal(assigned(other).roastery_id,20);assert(!db.prepare('SELECT 1 FROM roastery_assignment_batches WHERE order_id=?').get(other));
 const shipped=make();db.prepare("INSERT INTO roastery_shipments(order_id,carrier,tracking,state,updated_at) VALUES(?,'CJ','123456789','dispatch_confirmed',1)").run(shipped);confirm(shipped);assert(!assigned(shipped));
 const historical=make();db.exec('DROP TRIGGER roastery_confirm_assign_v1');confirm(historical);installRoasteryWorkflow(db);assert(!assigned(historical));
 const rollback=make();db.exec("CREATE TRIGGER fail_assignment BEFORE INSERT ON roastery_audit WHEN NEW.action='auto_assigned' BEGIN SELECT RAISE(ABORT,'synthetic'); END");assert.throws(()=>confirm(rollback));assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(rollback).status,'pending');assert(!assigned(rollback));db.exec('DROP TRIGGER fail_assignment');confirm(rollback);assert(assigned(rollback));
 db.exec("INSERT INTO suppliers VALUES(30,'클라리멘토')");const ambiguous=make();confirm(ambiguous);assert(!assigned(ambiguous));
 recordDispatchNotice(db,n,'CJ','111111111');recordDispatchNotice(db,n,'CJ','111111111');assert.equal(db.prepare('SELECT count(*) n FROM roastery_dispatch_outbox').get().n,1);assert.equal(db.prepare('SELECT status FROM roastery_dispatch_outbox').get().status,'suppressed');recordDispatchNotice(db,n,'CJ','222222222');assert.equal(db.prepare('SELECT status FROM roastery_dispatch_outbox').get().status,'correction_hold');
 console.log('PASS workflow: pending invisible, confirmed assigned once, historical untouched, sample/store/admin/invalid/cancelled/shipped excluded, other supplier preserved, atomic rollback/retry, duplicate supplier blocked, durable suppressed event and correction hold');
}finally{db.close();}
