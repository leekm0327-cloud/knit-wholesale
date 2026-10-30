import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transformSync} from 'esbuild';
import {insertPurchaseSchema} from '../../shared/schema';
import {purchaseDuplicateCheck} from '../../server/purchase-duplicates';
import {initPurchaseLinks,purchaseLocked} from '../../server/purchase-link';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'knit-purchase-segment-'));
const {storage,sqlite}=await import('../../server/storage');
initPurchaseLinks(sqlite);
// Execute the actual HTTP handlers with isolated storage, without starting any integration or scheduler.
const source=readFileSync('server/routes.ts','utf8');
const handlers:any={};
const app:any={post:(path:string,_auth:any,fn:any)=>handlers.post=fn,patch:(path:string,_auth:any,fn:any)=>handlers.patch=fn};
for(const method of ['post','patch']) {
 const marker=`  app.${method}("/api/admin/purchases${method==='patch'?'/:id':''}",`;
 const start=source.indexOf(marker); assert(start>=0);
 const end=source.indexOf('\n  });',start)+6;
 const js=transformSync(source.slice(start,end),{loader:'ts'}).code;
 new Function('app','requireAdmin','insertPurchaseSchema','storage','sqlite','purchaseDuplicateCheck','purchaseLocked','getActor',js)(app,()=>{},insertPurchaseSchema,storage,sqlite,purchaseDuplicateCheck,purchaseLocked,async()=>({actorUserId:0,actorName:'test',actorEmail:'fixture@example.invalid',actorRole:'owner'}));
}
async function call(method:string,body:any,id?:number){let code=200,result:any;const res:any={status(n:number){code=n;return this},json(v:any){result=v;return this}};await handlers[method]({body,params:{id}},res);return {code,result};}
try {
 const supplier=await storage.createSupplier({name:'fixture',contact:'',phone:'',ecountCode:'',memo:''});
 const base:any={supplierId:supplier.id,purchaseDate:'2026-10-01',customerName:'fixture store',memo:'단가 미확정·추후 정산',items:[{productId:null,name:'코튼 1kg',qty:2,unitPrice:21900,amount:1},{productId:null,name:'싱글 1kg',qty:1,unitPrice:0,amount:0}]};
 const a=await call('post',{...base,segment:'store'});assert.equal(a.code,200);assert.equal(a.result.segment,'store');assert.equal(a.result.totalAmount,43800);assert.equal(a.result.memo,base.memo);assert.equal(JSON.parse(a.result.items)[1].unitPrice,0);
 const b=await call('post',{...base,customerName:'fixture wholesale'});assert.equal(b.result.segment,'wholesale');
 assert.equal((await call('post',{...base,segment:'store'})).code,409);
 for(const patch of [{segment:'bad'},{supplierId:0},{purchaseDate:''},{items:[]},{items:[{...base.items[0],qty:0}]},{items:[{...base.items[0],unitPrice:-1}]}]) assert.equal((await call('post',{...base,...patch})).code,400);
 const preserved=await call('patch',base,a.result.id);assert.equal(preserved.result.segment,'store');
 const changed=await call('patch',{...base,segment:'store',customerName:'fixture wholesale'},b.result.id);assert.equal(changed.result.segment,'store');
 await call('patch',{...base,segment:'wholesale',customerName:'fixture wholesale'},b.result.id);
 const store=await storage.getDashboardSummary('2026-10-01','2026-10-31','day','store');
 const wholesale=await storage.getDashboardSummary('2026-10-01','2026-10-31','day','wholesale');
 assert.equal(store.purchaseTotal,43800);assert.equal(wholesale.purchaseTotal,43800);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM supplier_payments').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM purchases').get().n,2);
 console.log('PASS actual POST/PATCH: store save, wholesale default, omitted segment preservation, explicit correction, zero price, memo, recomputed totals, validation, duplicate rejection, isolated sector totals, no sales/payments.');
} finally {sqlite.close();}
