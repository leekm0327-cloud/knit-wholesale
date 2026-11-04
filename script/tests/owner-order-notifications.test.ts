import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {customers,products,orders} from '../../shared/schema';
import {confirmCustomerOrder,OrderConfirmationError} from '../../server/order-confirmation';

// Real order persistence in a disposable database; every outbound sender is a spy.
// Do not import routes.ts: its integration registration can start real senders.
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'knit-owner-order-alert-'));
const {storage,db,sqlite}=await import('../../server/storage');
const customer=db.insert(customers).values({email:'fixture@example.invalid',password:'fixture',businessName:'가상 거래처',managerName:'가상 담당자',phone:'000',defaultAddress:'가상 배송지',createdAt:1}).returning().get();
const product=db.insert(products).values({name:'테스트 원두 1kg',category:'blend',price:10000}).returning().get();
const source=readFileSync(new URL('../../server/routes.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('routes.ts',source,ts.ScriptTarget.Latest,true);
let route='';
function visit(node:ts.Node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='app.post'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/api/orders')route=node.getText(ast)+';';
 ts.forEachChild(node,visit);
}
visit(ast);assert(route);
const calls:string[]=[];
const spy=(name:string)=>async(..._args:any[])=>{calls.push(name);};
let handler:any,serial=0;
const deps={app:{post:(_path:string,...handlers:any[])=>{handler=handlers.at(-1);}},requireAuth:()=>{},confirmCustomerOrder,OrderConfirmationError,db,genOrderNo:()=>`FIXTURE-${++serial}`,
 storage:{createNotification:async(value:any)=>{calls.push(`notification:${value.type}`);return storage.createNotification(value);}},
 sendOrderMergedEmail:spy('ownerMergedEmail'),sendNewOrderEmail:spy('ownerNewEmail'),sendOrderAlertSms:spy('ownerSms'),sendOrderAcceptedEmail:spy('customerAcceptedEmail'),sendKakaoMemo:spy('ownerKakao')};
new Function(...Object.keys(deps),transformSync(route,{loader:'ts'}).code)(...Object.values(deps));
const body=(qty:number)=>({items:[{productId:product.id,name:product.name,category:'blend',unitPrice:10000,qty,amount:10000*qty}]});
async function submit(qty:number,invalid=false){
 calls.length=0;
 const payload=body(qty),quote=confirmCustomerOrder(db,customer.id,payload).quote;
 let status=200,result:any;
 await handler({session:{userId:customer.id},body:{...payload,confirmationRevision:invalid?'stale':quote.revision},headers:{origin:'https://fixture.invalid'}},{status(n:number){status=n;return this;},json(value:any){result=value;return this;}});
 return {status,result,quote};
}
try{
 const first=await submit(5);assert.equal(first.status,200);assert.equal(first.result.merged,false);assert.equal(first.result.totalAmount,55000);
 assert.deepEqual([...calls].sort(),['ownerNewEmail','ownerSms','customerAcceptedEmail','notification:order_new'].sort());
 const second=await submit(1);assert.equal(second.status,200);assert.equal(second.result.merged,true);assert.equal(second.result.id,first.result.id);assert.equal(second.result.totalAmount,66000);
 assert.deepEqual([...calls].sort(),['ownerMergedEmail','ownerSms','customerAcceptedEmail','notification:order_merged'].sort());
 const saved=db.select().from(orders).all();assert.equal(saved.length,1);assert.equal(JSON.parse(saved[0].items)[0].qty,6);
 const before=JSON.stringify(saved);const invalid=await submit(1,true);assert.equal(invalid.status,409);assert.deepEqual(calls,[]);assert.equal(JSON.stringify(db.select().from(orders).all()),before);
 console.log('PASS: new and merged wholesale orders persist correct quantities/totals; no owner Kakao; owner SMS/email, customer acceptance and in-app notifications preserved; rejected order sends nothing; no real outbound senders loaded');
}finally{sqlite.close();}
