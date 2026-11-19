import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withCustomerShipping } from '../../server/customer-shipping';
import { installRoasteryDispatch, readDispatch, saveDispatch } from '../../server/roastery-dispatch';
import { carrierTrackingLink, isCustomerDispatch, shipmentMethodLabel } from '../../shared/shipping';

const db: any = new DatabaseSync(':memory:');
db.transaction = (fn: () => unknown) => ({
  immediate: () => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
});
db.exec(`CREATE TABLE orders(id INTEGER PRIMARY KEY, items TEXT, customer_snapshot TEXT, status TEXT, tracking_no TEXT, total_amount INTEGER);
  CREATE TABLE roastery_assignments(order_id INTEGER PRIMARY KEY, roastery_id INTEGER);
  CREATE TABLE roastery_shipments(order_id INTEGER PRIMARY KEY, state TEXT, tracking TEXT, carrier TEXT, order_fingerprint TEXT, version INTEGER);
  CREATE TABLE roastery_audit(order_id INTEGER, actor INTEGER, action TEXT, details TEXT, created_at INTEGER);
  INSERT INTO orders VALUES(1,'[]','{"phone":"010-0000-0000","defaultAddress":"테스트 배송지"}','done','',99999);
  INSERT INTO roastery_assignments VALUES(1,10);`);
installRoasteryDispatch(db);
const id = 1;
const read = () => withCustomerShipping(db, { id, trackingNo: '', totalAmount: 99999 });
const itemLines = JSON.stringify([{name:'코튼 블렌드', qty:3}, {name:'실크 블렌드', qty:2}]);
try {
  db.prepare("UPDATE orders SET status='done', items=? WHERE id=?").run(itemLines, id);
  const original = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  assert.equal(read().shipping, null);

  const send = (fields: object) => saveDispatch(db, { orderId:id, roasteryId:10, actor:1 }, {
    ...fields, revision:readDispatch(db, id).revision, requestKey:randomUUID(),
  });
  send({method:'parcel', carrier:'CJ', tracking:'000111222333', completion:'partial'});
  const first = read();
  assert.equal(first.trackingNo, '');
  assert(isCustomerDispatch(first.shipping));
  assert.equal(first.shipping.state, 'partial_dispatch');
  assert(!('remainingItems' in first.shipping));
  const parcel = first.shipping.consignments[0];
  assert(!('items' in parcel));
  assert.equal(parcel.completion, 'partial');
  assert.equal(shipmentMethodLabel(parcel), 'CJ대한통운');
  assert(carrierTrackingLink(parcel.carrier, parcel.tracking)?.url.includes('000111222333'));

  send({method:'quick', completion:'partial'});
  send({method:'direct', completion:'complete'});
  const final = read();
  assert(isCustomerDispatch(final.shipping));
  assert.equal(final.shipping.state, 'fully_dispatched');
  assert.equal(final.trackingNo, '');
  assert.deepEqual(final.shipping.consignments.map(s => s.completion), ['partial','partial','complete']);
  assert.deepEqual(final.shipping.consignments.map(shipmentMethodLabel), ['CJ대한통운','퀵','직접배송']);
  assert.deepEqual(final.shipping.consignments.map(s => s.tracking), ['000111222333','','']);
  assert(!('revision' in final.shipping));
  assert.deepEqual(db.prepare('SELECT * FROM orders WHERE id=?').get(id), original);

  db.prepare("UPDATE orders SET items='[]' WHERE id=?").run(id);
  assert.equal(read().shipping?.state, 'dispatch_review_required');
  assert(!JSON.stringify(read().shipping).includes('000111222333'));
  db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
  assert.equal(read().shipping, null);
  console.log('PASS customer dispatch: partial / final declarations, parcel lookup, quick/direct, privacy and order totals');
} finally {
  db.close();
}
