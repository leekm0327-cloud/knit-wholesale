import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {deflateRawSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {initPurchaseLinks,purchasePlan,applyPurchasePlan,syncManagedPurchase,purchaseLocked} from '../../server/purchase-link';
import {purchaseDuplicateCheck} from '../../server/purchase-duplicates';
import {parseChat,parseSettlement,csvRows,period} from '../../server/settlement-files';
import {registerSettlements,settlementView,compareSources} from '../../server/settlement-review';
import {orderToKakaoText} from '../../client/src/lib/kakaoFormat';

export function fixtureDb(){
 const db:any=new DatabaseSync(':memory:');
 db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 db.exec(`CREATE TABLE suppliers(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO suppliers VALUES(1,'클라리멘토');
 CREATE TABLE customers(id INTEGER PRIMARY KEY,business_name TEXT,is_store INTEGER);INSERT INTO customers VALUES(1,'예시 카페',1);
 CREATE TABLE product_categories(key TEXT,is_bean INTEGER);INSERT INTO product_categories VALUES('blend',1);
 CREATE TABLE products(id INTEGER PRIMARY KEY,cost_price INTEGER);INSERT INTO products VALUES(1,22000),(2,28000);
 CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT,customer_id INTEGER,customer_snapshot TEXT,items TEXT,status TEXT,ecount_date TEXT,created_at INTEGER,auto_purchase_id INTEGER,is_store_order INTEGER);
 CREATE TABLE purchases(id INTEGER PRIMARY KEY,supplier_id INTEGER,purchase_no TEXT UNIQUE,purchase_date TEXT,items TEXT,total_amount INTEGER,memo TEXT,segment TEXT,customer_id INTEGER,customer_name TEXT,created_at INTEGER);`);
 initPurchaseLinks(db);return db;
}
const item=(productId=1,qty=1)=>({productId,name:productId===1?'코튼 블렌드 1kg':'실크 블렌드 1kg',category:'blend',qty,unitPrice:30000,amount:qty*30000});
function seedOrder(db:any,id:number,items:any[],date='2026-09-17'){
 db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,NULL,0)').run(id,`KC-260930-${id}`,1,JSON.stringify({businessName:'예시 카페'}),JSON.stringify(items),'done',date,Date.UTC(2026,8,30));
}
// Small XLSX fixture with cached values and ignored broken style metadata.
function zip(files:Record<string,string>){
 const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [path,content] of Object.entries(files)){const name=Buffer.from(path),plain=Buffer.from(content),data=deflateRawSync(plain),local=Buffer.alloc(30),header=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(name.length,26);
  header.writeUInt32LE(0x02014b50);header.writeUInt16LE(8,10);header.writeUInt32LE(data.length,20);header.writeUInt32LE(plain.length,24);header.writeUInt16LE(name.length,28);header.writeUInt32LE(offset,42);
  chunks.push(local,name,data);central.push(header,name);offset+=local.length+name.length+data.length;
 }const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(Buffer.concat(central).length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,...central,end]);
}
const cell=(ref:string,v:string|number)=>typeof v==='string'?`<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`:`<c r="${ref}"><v>${v}</v></c>`;
const workbook=zip({
 'xl/workbook.xml':'<workbook><sheets><sheet name="원장" r:id="r1"/><sheet name="(1)정산서" r:id="r2"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':`<worksheet><sheetData><row r="1">${['날짜','업체명','제품명','제품수량'].map((v,i)=>cell(String.fromCharCode(65+i)+'1',v)).join('')}</row><row r="2">${cell('A2','2026-09-17')}${cell('B2','예시 카페')}${cell('C2','코튼')}${cell('D2',2)}</row><row r="3">${cell('C3','실크')}${cell('D3',1)}</row></sheetData></worksheet>`,
 'xl/worksheets/sheet2.xml':`<worksheet><sheetData><row r="11">${cell('B11','코튼생두')}${cell('G11',21816)}</row><row r="26">${cell('H26',43632)}${cell('I26',4363.2)}</row></sheetData></worksheet>`,
 'xl/styles.xml':'broken style; must never be parsed'
});
const csv='Date,User,Message\r\n2026-09-17 11:20:00,사용자,"1. 예시 카페\n- 품목: 코튼 블렌드 1kg * 2"\r\n2026-09-17 14:29:00,사용자,"디카 1kg 추가 부탁드립니다"';

const db=fixtureDb();
seedOrder(db,1,[item(1,2),item(2,-1)]);
const initial=purchasePlan(db,1);assert.equal(initial.proposed.date,'2026-09-17');assert.equal(initial.proposed.items.length,1);assert.equal(initial.refunds.length,1);
let plan=applyPurchasePlan(db,1,99,initial.fingerprint);
assert.equal(plan.state,'matched');assert.equal(plan.managed,true);assert.equal(plan.current?.date,'2026-09-17');
assert.equal(db.prepare('SELECT segment FROM purchases').get().segment,'wholesale','order snapshot false wins over current store setting');
applyPurchasePlan(db,1,99,plan.fingerprint);assert.equal(db.prepare('SELECT COUNT(*) n FROM purchases').get().n,1);
db.prepare('UPDATE orders SET items=? WHERE id=1').run(JSON.stringify([item(1,3)]));
assert.throws(()=>applyPurchasePlan(db,1,99,plan.fingerprint),/변경됐/);
syncManagedPurchase(db,1,99);plan=purchasePlan(db,1);assert.equal(plan.current?.items[0].qty,3);
assert.equal(plan.current?.items[0].unitPrice,22000);
const stableItems=plan.current!.items.map((i:any)=>({amount:i.amount,unitPrice:i.unitPrice,qty:i.qty,name:i.name,productId:i.productId}));db.prepare('UPDATE purchases SET items=? WHERE id=?').run(JSON.stringify(stableItems),plan.purchaseId);assert.equal(purchasePlan(db,1).manualChanged,false,'JSON key order must not create a false manual change');
db.prepare("UPDATE orders SET ecount_date='2026-09-16' WHERE id=1").run();syncManagedPurchase(db,1,99);assert.equal(purchasePlan(db,1).current?.date,'2026-09-16');db.prepare("UPDATE orders SET ecount_date='2026-09-17' WHERE id=1").run();syncManagedPurchase(db,1,99);
db.prepare('UPDATE purchase_links SET locked=1 WHERE order_id=1').run();
db.prepare('UPDATE orders SET items=? WHERE id=1').run(JSON.stringify([item(1,4)]));
syncManagedPurchase(db,1,99);assert.equal(purchasePlan(db,1).state,'locked');assert.equal(purchasePlan(db,1).current?.items[0].qty,3);assert(purchaseLocked(db,plan.purchaseId!));
assert.throws(()=>applyPurchasePlan(db,1,99),/확정/);
db.prepare('UPDATE purchase_links SET locked=0 WHERE order_id=1').run();
db.prepare('UPDATE purchases SET total_amount=1 WHERE id=?').run(plan.purchaseId);
syncManagedPurchase(db,1,99);assert(purchasePlan(db,1).manualChanged);assert.equal(purchasePlan(db,1).current?.amount,1);
db.prepare('DELETE FROM purchase_links WHERE order_id=1').run();syncManagedPurchase(db,1,99);assert.equal(purchasePlan(db,1).current?.items[0].qty,3,'legacy purchase is untouched automatically');
applyPurchasePlan(db,1,99,purchasePlan(db,1).fingerprint);assert.equal(purchasePlan(db,1).current?.items[0].qty,4);
const dup=purchaseDuplicateCheck(db,{supplierId:1,purchaseDate:'2026-09-17',customerId:1,customerName:'예시 카페',items:[item(1,4)]});assert.equal(dup.candidates.length,1);
assert.equal(purchaseDuplicateCheck(db,{supplierId:1,purchaseDate:'2026-09-18',customerId:1,items:[item(1,4)]}).candidates.length,0);
seedOrder(db,2,[{...item(9,1),name:'단가 없음'}]);assert.throws(()=>applyPurchasePlan(db,2,99),/매입단가/);
db.prepare("UPDATE orders SET status='cancelled' WHERE id=1").run();assert.throws(()=>applyPurchasePlan(db,1,99),/취소/);
const kakao=orderToKakaoText({orderNo:'KC-TEST-1',customerSnapshot:JSON.stringify({businessName:'예시 카페'}),items:JSON.stringify([item(1,2),item(2,-1)])} as any);
assert(!kakao.includes('KC-TEST-1'));assert(!kakao.includes('이전 내용을 대체'));assert(!kakao.includes('실크 블렌드 1kg * -1'));assert(kakao.includes('반품·차감 확인'));
assert.deepEqual(period('2026-01'),{from:'2025-12-26',to:'2026-01-25'});
assert.equal(csvRows(csv).length,3);const chat=parseChat(csv);assert.equal(chat.lines.length,1);assert.equal(chat.lines[0].customer,'예시 카페');assert.equal(chat.issues.length,1);
const parsed=parseSettlement(workbook);assert.equal(parsed.lines.length,2);assert.equal(parsed.lines[0].amount,43632);assert.equal(parsed.supplyAmount,43632);assert(parsed.lines[1].warnings.length);
assert.throws(()=>parseSettlement(Buffer.from('bad')),/XLSX/);assert.throws(()=>csvRows('a,b,"broken'),/따옴표/);
assert.equal(compareSources('2026-09',[],[{id:'unreadable',source:'excel',date:'',text:'날짜 읽기 실패',reference:'원장 4행'}]).unresolvedIssues,1);
const basic=compareSources('2026-09',[...chat.lines,...parsed.lines],[]);assert(basic.rows.some(r=>r.status==='수량 차이'));

const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:99};next();});
registerSettlements(app,db,(req,res,next)=>req.headers.role==='owner'?next():res.status(403).json({message:'권한 없음'}));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin/settlements`;
const originalFetch=globalThis.fetch;globalThis.fetch=((url:any,init:any)=>{assert(String(url).startsWith(base),'no external requests');return originalFetch(url,init);}) as any;
const upload=async(role='owner')=>{const form=new FormData();form.append('month','2026-09');form.append('supplierId','1');form.append('confirmUnit','true');form.append('excel',new Blob([workbook]),'sample.xlsx');form.append('chat',new Blob([csv]),'sample.csv');return fetch(base,{method:'POST',headers:{role},body:form});};
try{
 assert.equal((await upload('manager')).status,403);const up=await upload();assert.equal(up.status,200);const {id}=await up.json();
 const again=await (await upload()).json();assert.equal(again.id,id);assert(again.reused);
 const view=settlementView(db,id);assert(view.issues.length>=1);
 const line=parsed.lines[0],decision={reason:'중복 발주로 공장 확인',siteFingerprint:view.siteFingerprint,patch:{excluded:true}};
 const before=JSON.stringify(db.prepare('SELECT * FROM purchases').all());
 const save=await fetch(`${base}/${id}/decisions/${line.id}`,{method:'PUT',headers:{role:'owner','Content-Type':'application/json'},body:JSON.stringify(decision)});assert.equal(save.status,200,await save.text());
 assert.equal(settlementView(db,id).totals.excel.oneKgQty,1);assert.equal(JSON.stringify(db.prepare('SELECT * FROM purchases').all()),before,'review cannot change actual ledger');
 const issue=settlementView(db,id).issues.find(i=>i.source==='chat')!;
 const interpret=await fetch(`${base}/${id}/decisions/${issue.id}`,{method:'PUT',headers:{role:'owner','Content-Type':'application/json'},body:JSON.stringify({...decision,reason:'카톡 추가 수량 직접 확인',patch:{interpretation:{date:'2026-09-17',customer:'예시 카페',product:'디카페인',qty:1,unit:'1kg'}}})});assert.equal(interpret.status,200,await interpret.text());assert.equal(settlementView(db,id).totals.chat.oneKgQty,3);
 const reset=await fetch(`${base}/${id}/decisions/${issue.id}`,{method:'PUT',headers:{role:'owner','Content-Type':'application/json'},body:JSON.stringify({...decision,reason:'원문 기준으로 되돌리기',patch:{}})});assert.equal(reset.status,200);assert.equal(settlementView(db,id).totals.chat.oneKgQty,2);
 const stale=await fetch(`${base}/${id}/decisions/${line.id}`,{method:'PUT',headers:{role:'owner','Content-Type':'application/json'},body:JSON.stringify({...decision,siteFingerprint:'stale'})});assert.equal(stale.status,409);
 assert.equal((await fetch(base)).status,403);
 if(process.env.SETTLEMENT_XLSX&&process.env.SETTLEMENT_CSV){
  const realExcel=parseSettlement(readFileSync(process.env.SETTLEMENT_XLSX)),realChat=parseChat(readFileSync(process.env.SETTLEMENT_CSV,'utf8'));
  assert.equal(realExcel.lines.length,202);assert.equal(realExcel.lines.reduce((s,l)=>s+l.qty,0),1601);assert.equal(realExcel.supplyAmount,37755968);assert.equal(realExcel.prices['울'],20364);
  assert(realChat.lines.some(l=>l.date==='2026-09-17'&&l.customer==='니트커피'));console.log('September files verified:',realExcel.lines.length,'Excel rows;',realChat.lines.length,'chat item rows.');
  const p=period('2026-09');console.log('Raw period quantities:',realExcel.lines.filter(l=>l.date>=p.from&&l.date<=p.to).reduce((s,l)=>s+l.qty,0),realChat.lines.filter(l=>l.date>=p.from&&l.date<=p.to).reduce((s,l)=>s+l.qty,0));
 }
 console.log('PASS: purchase sync/refunds/backdating/locks/duplicates, file parsers, review persistence, reupload idempotency, owner-only access, ledger isolation.');
}finally{globalThis.fetch=originalFetch;server.close();db.close();}
