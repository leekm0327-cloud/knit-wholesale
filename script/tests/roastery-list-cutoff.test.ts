import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {resolveRoasteryListCutoff} from '../../server/roastery-list-cutoff';
import {fixture} from './roastery-shipping.fixture';

test('cutoff only filters the fixed-login Clarimento order list',async()=>{
  const key='CLARIMENTO_SHIPPING_HIDE_THROUGH_ORDER';
  const previous=process.env[key];
  const anchor='TEST-2026-0003';
  process.env[key]=anchor;
  const info=console.info;
  const startup:unknown[][]=[];
  const {app,db}=(()=>{
    console.info=(...args)=>{startup.push(args);};
    try { return fixture(); } finally {
      console.info=info;
      if(previous===undefined) delete process.env[key]; else process.env[key]=previous;
    }
  })();
  assert.deepEqual(startup,[['[roastery-list-cutoff]',{configEnabled:true,boundaryFound:false,reason:'supplier_missing'}]]);
  db.exec(`UPDATE suppliers SET name='클라리멘토' WHERE id=10;
    UPDATE orders SET created_at=100 WHERE id IN (2,3,4);
    UPDATE orders SET created_at=99,order_no='TEST-2026-9999' WHERE id=1;
    UPDATE orders SET created_at=101,order_no='TEST-2026-0000' WHERE id=7;`);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const address=server.address();
    assert(address&&typeof address!=='string');
    const call=(path:string,user=1,body?:unknown,token?:string)=>fetch(`http://127.0.0.1:${address.port}${path}`,{
      method:body===undefined?'GET':'POST',
      headers:{'x-test-user':String(user),'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    const ids=(rows:{id:number}[])=>rows.map(r=>r.id).sort((a,b)=>a-b);
    const path='/api/roastery/orders';
    const baseline=()=>['orders','roastery_assignments','roastery_shipments'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
    const before=baseline();
    assert.deepEqual(ids(await (await call(path)).json()),[4,6,7]);
    assert.deepEqual(ids(await (await call(path,2)).json()),[5]);
    assert.deepEqual(ids(await (await call('/api/admin/roastery-shipping',3)).json()),[1,2,3,4,5,6,7]);
    const issue=await call('/api/admin/roastery-links',3,{roasteryId:10,hours:1,requestKey:randomUUID()});
    assert.equal(issue.status,200);
    const token=(await issue.json()).path.split('#')[1];
    assert.deepEqual(ids((await (await call('/api/roastery-link/orders',0,undefined,token)).json()).orders),[1,2,3,4,6,7]);
    assert.deepEqual(baseline(),before);
    assert.equal((await call('/api/roastery/preview',1,{rows:[{orderNo:'TEST-2026-9999',carrier:'CJ',tracking:'000012345678'}]})).status,200);
    assert.deepEqual(baseline(),before);
    db.exec("UPDATE orders SET created_at='invalid' WHERE id=2");
    assert.deepEqual(ids(await (await call(path)).json()),[2,4,6,7]);
    db.exec("UPDATE orders SET created_at=100 WHERE id=2");
    assert.equal(resolveRoasteryListCutoff(db,undefined).reason,'unset');
    assert.equal(resolveRoasteryListCutoff(db,'TEST-NOT-FOUND').reason,'anchor_missing');
    db.prepare('UPDATE roastery_assignments SET roastery_id=20 WHERE order_id=3').run();
    assert.equal(resolveRoasteryListCutoff(db,anchor).reason,'anchor_not_assigned');
    assert.deepEqual(ids(await (await call(path)).json()),[1,2,4,6,7]);
    db.prepare('UPDATE roastery_assignments SET roastery_id=10 WHERE order_id=3').run();
    db.prepare('UPDATE orders SET order_no=? WHERE id=8').run(anchor);
    assert.equal(resolveRoasteryListCutoff(db,anchor).reason,'anchor_ambiguous');
    assert.deepEqual(ids(await (await call(path)).json()),[1,2,3,4,6,7]);
    db.exec("INSERT INTO suppliers VALUES (30,'클라리멘토')");
    assert.equal(resolveRoasteryListCutoff(db,anchor).reason,'supplier_ambiguous');
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    db.close();
  }
});
