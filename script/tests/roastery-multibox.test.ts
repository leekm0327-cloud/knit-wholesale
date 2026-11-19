import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MAX_TRACKINGS_PER_DISPATCH, normalizeTrackingNumber } from '../../shared/roastery-dispatch';
import { isCustomerDispatch } from '../../shared/shipping';
import { withCustomerShipping } from '../../server/customer-shipping';
import { conflictsWithDispatch, dispatchCompleteSql, DispatchError, readDispatch, saveDispatch } from '../../server/roastery-dispatch';
import { installOrderTrackingGuard, orderTrackingConflictMessage } from '../../server/order-tracking-guard';
import { fixture } from './roastery-shipping.fixture';

const {db} = fixture();
installOrderTrackingGuard(db);
db.exec("UPDATE orders SET status='done' WHERE id IN (1,2,3,4,5,7)");
const actor = {actor:1,roasteryId:10};
const request = (orderId:number, fields:object) => ({
  revision:readDispatch(db,orderId).revision,requestKey:randomUUID(),...fields,
});
const send = (orderId:number, payload:object) => saveDispatch(db,{orderId,...actor},payload).dispatch;
const fails = (status:number) => (error:unknown) => error instanceof DispatchError && error.status === status;
const parcel = {method:'parcel',carrier:'CJ',completion:'partial'};
const close = {action:'close_partial'};
const count = (table:string) => db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;

try {
  const labels = ['0012-3456-7890','0022 ‐3456–7890','００'];
  const firstTwo = ['001234567890','002234567890'];
  assert.equal(normalizeTrackingNumber(labels[1]),firstTwo[1]);
  for (const invalid of [labels[2],'','00A2-3456-7890','00123456\n78901234']) {
    assert.throws(() => send(1,request(1,{...parcel,trackings:[labels[0],invalid]})),fails(400));
  }
  assert.throws(() => send(1,request(1,{...parcel,tracking:'12345678',trackings:[labels[0]]})),fails(400));
  assert.throws(() => send(1,request(1,{...parcel,trackings:[labels[0],firstTwo[0]]})),fails(400));
  assert.throws(() => send(1,request(1,{...parcel,trackings:Array(MAX_TRACKINGS_PER_DISPATCH+1).fill('12345678')})),fails(400));
  assert.throws(() => send(1,request(1,close)),fails(409));
  assert.equal(count('roastery_consignments'),0);

  const first = request(1,{...parcel,tracking:labels[0],trackings:labels.slice(0,2)});
  const partial = send(1,first);
  assert.equal(partial.status,'partial');
  assert.equal(partial.consignments.length,1);
  assert.deepEqual(partial.consignments[0].trackings,firstTwo);
  assert.equal(partial.consignments[0].tracking,firstTwo[0]);
  assert.deepEqual(send(1,{...first,tracking:firstTwo[0],trackings:firstTwo}),partial);
  assert.throws(() => send(1,{...first,trackings:[labels[0],'0000000012']}),fails(409));
  assert(conflictsWithDispatch(db,2,'CJ',labels[1]));
  assert.throws(() => db.prepare('UPDATE orders SET tracking_no=? WHERE id=2').run('0022-3456-7890'),
    (error:unknown) => Boolean(orderTrackingConflictMessage(error)));
  db.prepare('UPDATE orders SET tracking_no=? WHERE id=7').run('3456-7890-1234');
  for (const alreadyUsed of [firstTwo[0],firstTwo[1],'345678901234']) {
    assert.throws(() => send(2,request(2,{...parcel,trackings:['9999000011',alreadyUsed]})),fails(409));
    assert.equal(readDispatch(db,2).consignments.length,0);
  }
  const countNotice = count('partial_dispatch_notices');
  const closing = request(1,close);
  assert.throws(() => send(1,{...closing,revision:first.revision}),fails(409));
  assert.throws(() => send(5,closing),fails(404));
  const completed = send(1,closing);
  assert.deepEqual(send(1,closing),completed);
  assert.throws(() => send(1,request(1,close)),fails(409));
  assert.throws(() => send(1,request(1,{...parcel,trackings:['9999000011']})),fails(409));
  assert.notEqual(completed.revision,partial.revision);
  assert.equal(completed.status,'complete');
  assert.deepEqual(completed.consignments,[{...partial.consignments[0],completion:'complete'}]);
  assert.equal(count('roastery_consignments'),1);
  assert.equal(count('roastery_consignment_boxes'),1);
  assert.equal(count('roastery_dispatch_closures'),1);
  assert.equal(count('partial_dispatch_notices'),countNotice);
  assert.equal(db.prepare('SELECT complete FROM roastery_consignments WHERE order_id=1').get().complete,0);
  assert(db.prepare('SELECT id FROM orders o WHERE o.id=1 AND '+dispatchCompleteSql).get());
  const customer=withCustomerShipping(db,{id:1,trackingNo:''});
  assert(isCustomerDispatch(customer.shipping));
  assert.equal(customer.shipping.state,'fully_dispatched');
  assert.deepEqual(customer.shipping.consignments[0].trackings,firstTwo);

  const firstComplete=send(2,request(2,{...parcel,completion:'complete',trackings:['9999000011','9999000022','9999000033']}));
  assert.equal(firstComplete.status,'complete');
  assert.deepEqual(firstComplete.consignments.map(leg=>leg.trackings),[['9999000011','9999000022','9999000033']]);
  const oldClient=send(3,request(3,{...parcel,tracking:'0000-9999-8888'}));
  assert.deepEqual(oldClient.consignments[0].trackings,['000099998888']);
  const later=send(3,request(3,{method:'quick',completion:'partial'}));
  const beforeClose=readDispatch(db,3);
  assert.deepEqual(later.consignments[1].trackings,[]);
  db.prepare("UPDATE orders SET items='[]' WHERE id=3").run();
  assert.equal(readDispatch(db,3).status,'review_required');
  assert.throws(()=>send(3,{...close,revision:beforeClose.revision,requestKey:randomUUID()}),fails(409));
  assert.throws(()=>send(3,request(3,close)),fails(409));
  console.log('PASS multi-box atomic saves, legacy compatibility, normalized duplicates, closure and customer history');
} finally {
  db.close();
}
