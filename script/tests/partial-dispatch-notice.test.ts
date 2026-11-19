import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { sendAlimtalk } from '../../server/alimtalk';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-first-partial-'));
process.env.SOLAPI_API_KEY = '';
process.env.SOLAPI_API_SECRET = '';
process.env.SOLAPI_API_HOST = 'https://api.solapi.com';
process.env.CJ_READY_NOTICE_ENABLED = 'false';
const { fixture } = await import('./roastery-shipping.fixture');
const { readDispatch } = await import('../../server/roastery-dispatch');
const { drainPartialDispatchNotices } = await import('../../server/partial-dispatch-notice');
const { registerAlimtalkRoutes, sendAlimtalk: send } = await import('../../server/alimtalk');
const { app, db } = fixture(0);
const phone = '01077778888';
const template = 'fixture-partial';
const multiTemplate = 'fixture-multibox';
db.exec(`
  CREATE TABLE IF NOT EXISTS alimtalk_settings(id INTEGER PRIMARY KEY, enabled INTEGER, tpl_partial_dispatch TEXT, tpl_multi_box_dispatch TEXT);
  CREATE TABLE IF NOT EXISTS alimtalk_optout(customer_id INTEGER PRIMARY KEY, off INTEGER);
  INSERT OR IGNORE INTO alimtalk_settings(id,enabled,tpl_partial_dispatch,tpl_multi_box_dispatch) VALUES(1,1,'fixture-partial','fixture-multibox');
  ALTER TABLE customers ADD COLUMN phone TEXT DEFAULT '';
  ALTER TABLE customers ADD COLUMN is_store INTEGER DEFAULT 0;
  ALTER TABLE customers ADD COLUMN biz_verified INTEGER DEFAULT 1;
  UPDATE suppliers SET name='클라리멘토' WHERE id=10;
  UPDATE roastery_assignments SET ready=1;
  UPDATE orders SET status='done' WHERE id!=6;
`);
db.prepare("UPDATE customers SET business_name='가상 거래처',phone=? WHERE id=4").run(phone);
db.prepare("UPDATE orders SET customer_snapshot=json_set(customer_snapshot,'$.phone',?)").run(phone);
const settingsApp = express();
settingsApp.use(express.json(),(req,_res,next) => {
  req.session = {userId:3, role:'admin', adminRole:'owner'} as typeof req.session;
  next();
});
registerAlimtalkRoutes(settingsApp);
const server = express().use('/settings-fixture',settingsApp).use(app).listen(0,'127.0.0.1');
await new Promise<void>(resolve => server.once('listening',resolve));
const origin = 'http://127.0.0.1:'+(server.address() as AddressInfo).port;
const localFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(new URL(input instanceof Request ? input.url : input.toString()).origin, origin, 'External fetch forbidden');
  return localFetch(input, init);
};
async function api(path: string, user: number, body: unknown, token?: string) {
  const response = await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',
    'x-test-user':String(user), ...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  return {status:response.status, data:await response.json()};
}
type Method = 'parcel'|'quick'|'direct';
function payload(id: number, method: Method, completion='partial') {
  return {revision:readDispatch(db,id).revision, requestKey:randomUUID(), method, completion,
    ...(method==='parcel'?{carrier:'CJ',tracking:'012345678901'}:{})};
}
const attempts = (id: number) => db.prepare('SELECT * FROM partial_dispatch_notices WHERE order_id=?').get(id);
const sent: Parameters<typeof sendAlimtalk>[0][] = [];
const accepted: typeof sendAlimtalk = async message => {
  sent.push(message);
  return {ok:true, detail:'fixture accepted', receipt:'accepted'};
};

try {
  const grant = await api('/api/admin/roastery-links',3,{roasteryId:10,hours:1,requestKey:randomUUID()});
  assert.equal(grant.status,200);
  const token = grant.data.path.split('#')[1];
  const link = (id: number, body: object) => api('/api/roastery-link/orders/'+id+'/consignments',0,body,token);
  const partner = (id: number, body: object) => api('/api/roastery/orders/'+id+'/consignments',1,body);
  const admin = (id: number, body: object) => api('/api/admin/roastery-shipping/'+id+'/consignments',3,body);
  const first = {...payload(1,'parcel'), trackings:['0123-4567-8901','0123-4567-8999']};
  assert.equal((await link(5,first)).status,404);
  assert.equal((await link(1,{...first,tracking:'',trackings:[]})).status,400);
  assert.equal((await link(1,{...first,revision:'0'.repeat(64)})).status,409);
  assert.equal(attempts(1),undefined);
  assert.equal(attempts(5),undefined);
  const concurrent = await Promise.all([link(1,first),link(1,first)]);
  assert.deepEqual(concurrent.map(r=>r.status),[200,200]);
  const quick = payload(2,'quick');
  db.exec("CREATE TRIGGER fail_shipping BEFORE INSERT ON roastery_audit WHEN NEW.order_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.equal((await partner(2,quick)).status,409);
  assert.equal(attempts(2),undefined);
  assert.equal(readDispatch(db,2).consignments.length,0);
  db.exec('DROP TRIGGER fail_shipping');
  assert.equal((await partner(2,quick)).status,200);
  assert.equal((await admin(3,payload(3,'direct'))).status,200);
  assert.equal((await link(4,payload(4,'direct','complete'))).status,200);
  assert.equal(attempts(4),undefined);
  assert.equal((await partner(6,payload(6,'quick'))).status,409);
  assert.equal(attempts(6),undefined);

  await Promise.all([drainPartialDispatchNotices(db,accepted),drainPartialDispatchNotices(db,accepted)]);
  assert.equal(sent.length,3);
  for(const [id,expected] of [[1,'012345678901'],[2,'퀵'],[3,'직접배송']] as const) {
    assert.equal(attempts(id).state,'accepted');
    const message = sent.find(m=>Object.values(m.variables).includes('TEST-2026-000'+id));
    assert(message, 'First partial notice should contain the order number');
    assert(Object.values(message.variables).some(v=>v.includes(expected)));
    assert.equal(message.phone,phone);
    assert.equal(message.templateId,template);
    assert.equal(message.kind,'partial_dispatch');
    assert.deepEqual(Object.keys(message.variables).sort(),['배송정보','주문번호'].sort());
    assert.equal(message.disableSms,true);
    assert.equal(message.receiptMode,'strict-kakao');
  }
  assert.equal(sent.find(m => m.ref === '1')?.variables.배송정보, 'CJ대한통운 · 총 2상자\n1번 상자  012345678901\n2번 상자  012345678999');
  assert.equal((await link(1,first)).status,200);
  assert.equal((await admin(1,payload(1,'quick'))).status,200);
  assert.equal((await partner(1,payload(1,'direct','complete'))).status,200);
  await drainPartialDispatchNotices(db,accepted);
  assert.equal(sent.length,3);

  db.exec('INSERT INTO alimtalk_optout(customer_id,off) VALUES(4,1)');
  assert.equal((await partner(8,payload(8,'direct'))).status,200);
  assert.equal(attempts(8),undefined);
  db.exec('DELETE FROM alimtalk_optout WHERE customer_id=4');
  db.exec("UPDATE orders SET status='done' WHERE id=6");
  assert.equal((await partner(6,payload(6,'quick'))).status,200);
  assert.equal(attempts(6).state,'reserved');
  db.exec('INSERT INTO alimtalk_optout(customer_id,off) VALUES(4,1)');
  await drainPartialDispatchNotices(db,accepted);
  assert.equal(attempts(6).state,'skipped');
  assert.equal(sent.length,3);
  db.exec('DELETE FROM alimtalk_optout WHERE customer_id=4');
  assert.equal(db.prepare('SELECT count(*) n FROM cj_ready_notice_attempts').get().n,0);

  // A previously saved partial must not become a new notification after a template is enabled.
  db.exec("UPDATE alimtalk_settings SET tpl_partial_dispatch='' WHERE id=1");
  assert.equal((await partner(7,payload(7,'quick'))).status,200);
  db.prepare('UPDATE alimtalk_settings SET tpl_partial_dispatch=? WHERE id=1').run(template);
  assert.equal((await link(7,payload(7,'direct'))).status,200);
  await drainPartialDispatchNotices(db,accepted);
  assert.equal(sent.length,3);

  // The provider could have accepted even when the network response was lost.
  db.exec('UPDATE roastery_assignments SET roastery_id=10 WHERE order_id=5');
  assert.equal((await admin(5,payload(5,'direct'))).status,200);
  let uncertainCalls = 0;
  await drainPartialDispatchNotices(db,async () => {
    uncertainCalls++;
    throw Error('lost receipt');
  });
  assert.equal(uncertainCalls,1);
  assert.equal(attempts(5).state,'unknown');
  await drainPartialDispatchNotices(db,accepted);
  assert.equal(sent.length,3);

  const cloneOrder = (id:number) => {
    db.prepare(`INSERT INTO orders(id,order_no,items,customer_snapshot,status,created_at)
      SELECT ?,?,items,customer_snapshot,status,created_at FROM orders WHERE id=1`).run(id, 'TEST-BOX-'+id);
    db.prepare('INSERT INTO roastery_assignments(order_id,roastery_id,ready) VALUES(?,10,1)').run(id);
  };
  cloneOrder(21);
  const firstWaybill = '0'.repeat(29) + '1';
  const boxNumbers = Array.from({length:30},(_,i) => String(i+1).padStart(30,'0'));
  const allBoxes = {...payload(21,'parcel','complete'),carrier:'HANJIN',tracking:firstWaybill,trackings:boxNumbers};
  assert.equal((await link(21,allBoxes)).status,200);
  assert.equal((await link(21,allBoxes)).status,200);
  await Promise.all([drainPartialDispatchNotices(db,accepted), drainPartialDispatchNotices(db,accepted)]);
  assert.equal(sent.length,4);
  const multiMessage = sent[3];
  assert.equal(multiMessage.templateId,multiTemplate);
  assert.equal(multiMessage.kind,'multi_box_dispatch');
  assert.equal(multiMessage.variables.주문번호,'TEST-BOX-21');
  assert.deepEqual(multiMessage.variables.상자별송장.split('\n'),[
    '한진택배 · 총 30상자',...boxNumbers.slice(0,5).map((n,i)=>(i+1)+'번 상자  '+n),
    '외 25상자 · 전체 송장은 주문 내역에서 확인해 주세요.',
  ]);
  cloneOrder(22);
  const silentClose = await partner(22,payload(22,'quick'));
  assert.equal(silentClose.status,200);
  await drainPartialDispatchNotices(db,accepted);
  const close = {action:'close_partial', revision:readDispatch(db,22).revision,requestKey:randomUUID()};
  assert.equal((await partner(22,close)).status,200);
  assert.equal((await partner(22,close)).status,200);
  await drainPartialDispatchNotices(db,accepted);
  assert.equal(sent.filter(m => m.ref === '22').length,1);
  cloneOrder(23);
  db.exec("UPDATE alimtalk_settings SET tpl_multi_box_dispatch='' WHERE id=1");
  const twoBoxes = {...payload(23,'parcel','complete'),tracking:'00000023',trackings:['00000023','00000024']};
  assert.equal((await admin(23,twoBoxes)).status,200);
  assert.equal(attempts(23),undefined, 'must never send a partial notice for a complete dispatch');
  db.prepare('UPDATE alimtalk_settings SET tpl_multi_box_dispatch=? WHERE id=1').run(multiTemplate);
  assert.equal((await admin(23,twoBoxes)).status,200);
  assert.equal(attempts(23),undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM cj_ready_notice_attempts').get().n,0);

  // Exercise the real Kakao formatter and receipt parser against an in-process provider double.
  process.env.SOLAPI_API_KEY='test-key';
  process.env.SOLAPI_API_SECRET='test-secret';
  const posted: any[] = [];
  const templateText = (id:string | null) => id===template ? '주문 #{주문번호} 부분 출고 · #{배송정보}'
    : id===multiTemplate ? '[니트커피] 출고 안내\n\n주문하신 상품을 여러 상자로 나누어 모두 출고했습니다.\n주문번호  #{주문번호}\n\n#{상자별송장}\n\n상자별 배송 현황은 주문 내역에서 확인해 주세요.' : '주문 #{주문번호}';
  globalThis.fetch = async (input,init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin===origin) return localFetch(input,init);
    assert.equal(url.origin,'https://api.solapi.com');
    if (url.pathname==='/kakao/v2/templates/sendable' && init?.method==='GET') {
      assert.equal(url.searchParams.get('channelId'),'fixture-channel');
      const requested = url.searchParams.get('templateId');
      return Response.json(requested==='unapproved'?[]:[{templateId:requested,channelId:'fixture-channel',
        content:templateText(requested)}]);
    }
    if (url.pathname.startsWith('/kakao/v2/templates/') && init?.method==='GET') {
      const id = url.pathname.split('/').at(-1)!;
      assert([template,multiTemplate].includes(id));
      return Response.json({templateId:id,pfId:'fixture-channel',status:'APPROVED',inspectionStatus:'APR',content:templateText(id)});
    }
    assert.equal(url.pathname,'/messages/v4/send-many/detail');
    assert.equal(init?.method,'POST');
    posted.push(JSON.parse(String(init.body)));
    return Response.json({failedMessageList:[],messageList:[{messageId:'M4Vfixture000123',statusCode:'2000'}]});
  };
  const saveTemplate = (tplPartialDispatch: string, tplMultiBoxDispatch = '') => fetch(origin+'/settings-fixture/api/admin/alimtalk',{
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      enabled:true, pfId:'fixture-channel', sender:'0212345678', tplPartialDispatch,tplMultiBoxDispatch,
    }),
  });
  assert.equal((await saveTemplate('unapproved')).status,400);
  assert.equal((await saveTemplate('wrong-vars')).status,400);
  assert.equal((await saveTemplate(template,template)).status,400);
  const configured = await saveTemplate(template,multiTemplate);
  assert.equal(configured.status,200);
  assert.equal((await configured.json()).settings.tplPartialDispatch,template);
  const reopened = await fetch(origin+'/settings-fixture/api/admin/alimtalk');
  assert.equal(reopened.status,200);
  assert.equal((await reopened.json()).settings.tplPartialDispatch,template);
  assert.equal((await send(sent[0])).receipt,'accepted');
  assert.equal(posted.length,1);
  assert.equal(posted[0].messages.length,1);
  assert.equal(posted[0].messages[0].type,'ATA');
  assert.equal(posted[0].messages[0].kakaoOptions.disableSms,true);
  assert.deepEqual(Object.keys(posted[0].messages[0].kakaoOptions.variables).sort(),['#{주문번호}','#{배송정보}'].sort());
  assert.equal((await send(multiMessage)).receipt,'accepted');
  assert.equal(posted.length,2);
  assert.equal(posted[1].messages.length,1);
  assert.equal(posted[1].messages[0].kakaoOptions.templateId,multiTemplate);
  assert.equal(posted[1].messages[0].kakaoOptions.variables['#{상자별송장}'],multiMessage.variables.상자별송장);
  assert.equal(posted[1].messages[0].kakaoOptions.disableSms,true);
  const preview = templateText(multiTemplate).replace(/#\{[^}]+\}/g, key => posted[1].messages[0].kakaoOptions.variables[key]);
  const orderHistory = 'https://wholesale.knitcoffee.co.kr/#/orders';
  assert(preview.includes('모두 출고했습니다.') && preview.includes('외 25상자'));
  assert(preview.length + '주문 내역 보기'.length + orderHistory.length * 2 < 1000);
  console.log('PASS one Kakao notice for first partial or full multibox, administrative close silent, 30-box mobile summary, all portals, local mock only');
} finally {
  globalThis.fetch = localFetch;
  await new Promise<void>(resolve => server.close(()=>resolve()));
  db.close();
}
