import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installOrderTrackingGuard, orderTrackingConflictMessage } from '../../server/order-tracking-guard';
import { fixture } from './roastery-shipping.fixture';

const {app,db} = fixture(0);
installOrderTrackingGuard(db);
db.exec("UPDATE orders SET status='done' WHERE id IN (1,2,5,7)");
const server = app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening', resolve));
const base = 'http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
async function api(path: string, token?: string, body?: unknown, user = 0, method = body?'POST':'GET') {
  const response = await fetch(base+path, {method, headers:{'x-test-user':String(user),
    ...(token?{Authorization:'Bearer '+token}:{}), ...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
}
try {
  const grant=await api('/api/admin/roastery-links',undefined,{roasteryId:10,hours:1,requestKey:randomUUID()},3);
  assert.equal(grant.status,200);
  const token=grant.data.path.split('#')[1];
  const list=async()=> (await api('/api/roastery-link/orders',token)).data.orders;
  const initial=(await list()).find((o:any)=>o.id===1);
  const register=(payload:unknown,id=1)=>api('/api/roastery-link/orders/'+id+'/consignments',token,payload);
  const parcel={revision:initial.dispatch.revision,completion:'partial',method:'parcel',carrier:'CJ',tracking:'012345678902',requestKey:randomUUID()};
  assert.equal((await register(parcel,5)).status,404);
  const first=await register(parcel);
  assert.equal(first.status,200);
  assert.equal(first.data.dispatch.status,'partial');
  assert.deepEqual(Object.keys(first.data.dispatch).sort(),['consignments','revision','status']);
  assert(!('items' in first.data.dispatch.consignments[0]));
  assert.equal((await register(parcel)).data.dispatch.consignments.length,1);
  const after=(await list()).find((o:any)=>o.id===1);
  assert.equal(after.dispatch.status,'partial');
  assert(!after.editable);
  const oldSave={requestKey:randomUUID(),revision:after.revision,carrier:'CJ',tracking:'123456789009'};
  assert.equal((await api('/api/roastery-link/orders/1/tracking',token,oldSave,0,'PUT')).status,409);
  const conflict = (e:unknown)=>!!orderTrackingConflictMessage(e);
  const setLegacy=db.prepare('UPDATE orders SET tracking_no=? WHERE id=?');
  assert.throws(()=>setLegacy.run(parcel.tracking,2),conflict);
  assert.throws(()=>setLegacy.run('differentTracking',1),conflict);
  assert.doesNotThrow(()=>setLegacy.run('',1));
  const quick={revision:after.dispatch.revision,completion:'partial',method:'quick',requestKey:randomUUID()};
  assert.equal((await register({...quick,tracking:'1234567890'})).status,400);
  assert.equal((await register(quick)).data.dispatch.consignments.length,2);
  const current=(await list()).find((o:any)=>o.id===1);
  const final={revision:current.dispatch.revision,completion:'complete',method:'direct',requestKey:randomUUID()};
  const [one,two]=await Promise.all([register(final),register(final)]);
  assert.equal(one.status,200);
  assert.equal(two.status,200);
  assert.equal(one.data.dispatch.status,'complete');
  assert.deepEqual(two.data.dispatch.consignments.map((s:any)=>s.method),['parcel','quick','direct']);
  assert.equal((await register({...final,requestKey:randomUUID()})).status,409);
  const single=(await list()).find((o:any)=>o.id===2);
  assert.equal((await register({method:'quick',completion:'complete',requestKey:randomUUID(),revision:single.dispatch.revision},2)).data.dispatch.status,'complete');
  const admin=(await api('/api/admin/roastery-shipping',undefined,undefined,3)).data;
  assert(admin.find((o:any)=>o.id===1).hasValidTracking);
  const customer=(await api('/api/orders/1',undefined,undefined,4)).data;
  assert.equal(customer.shipping.state,'fully_dispatched');
  assert.equal(customer.shipping.consignments.length,3);
  assert.equal(db.prepare('SELECT count(*) n FROM cj_ready_notice_attempts').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM roastery_dispatch_outbox').get().n,0);
  console.log('PASS link → mixed dispatches → customer view, quick-only completion, replay, cross-scope/legacy conflict protection, no new Kakao notices');
} finally {server.close();db.close();}
