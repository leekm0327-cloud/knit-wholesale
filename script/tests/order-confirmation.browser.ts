import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { customers, products, orders } from '../../shared/schema';
import { confirmCustomerOrder, OrderConfirmationError } from '../../server/order-confirmation';
// Supply a locally installed playwright-core path; never download during this test.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-browser-test-'));
const { db, sqlite } = await import('../../server/storage');
const user = db.insert(customers).values({email:'fixture@example.invalid',password:'fixture',businessName:'테스트 커피',managerName:'가상 담당자',phone:'000-0000-0000',defaultAddress:'서울 테스트구 테스트로 10, 1층 (가상 배송지)',bizVerified:1,createdAt:1}).returning().get();
const cart = [{name:'코튼 블렌드',category:'blend',price:23000,qty:3},{name:'린넨 블렌드',category:'blend',price:25000,qty:2}].map(p=>{
  const row=db.insert(products).values({name:p.name,category:p.category,price:p.price,description:'가상 상품'} as any).returning().get();
  return {productId:row.id,name:row.name,category:row.category,unitPrice:row.price,qty:p.qty};
});
const app=express();app.use(express.json());let submissions=0;
app.get('/api/auth/me',(_req,res)=>{const {password,...pub}=db.select().from(customers).get()!;res.json(pub);});
app.get('/api/products',(_req,res)=>res.json(db.select().from(products).all().map(p=>({...p,effectivePrice:p.price}))));
app.get('/api/product-categories',(_req,res)=>res.json([{key:'blend',label:'블렌드',isBean:1,active:1}]));
app.get('/api/orders/mine',(_req,res)=>res.json(db.select().from(orders).all()));
app.post('/api/orders/preview',(req,res)=>{try{res.json(confirmCustomerOrder(db,user.id,req.body).quote);}catch(e){res.status(e instanceof OrderConfirmationError?e.status:500).json({message:(e as Error).message});}});
app.post('/api/orders',(req,res)=>{try{const r=confirmCustomerOrder(db,user.id,req.body,`UI-${++submissions}`);res.json({...r.order,merged:!!r.todayPending});}catch(e){res.status(e instanceof OrderConfirmationError?e.status:500).json({message:(e as Error).message});}});
app.get('/api/{*path}',(_req,res)=>res.json([]));
app.use(express.static(process.env.UI_DIST || resolve('dist/public')));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const out=resolve('artifacts/order-confirmation');mkdirSync(out,{recursive:true});
try{
 for(const [label,width,height] of [['desktop',1440,1050],['mobile',390,844]] as const){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await context.addInitScript(items=>localStorage.setItem('knit.cart.v1',JSON.stringify(items)),cart);
  const page=await context.newPage();
  const shot = async (options:any) => { await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'})); await page.waitForFunction(() => window.scrollY === 0); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.screenshot({...options,animations:'disabled',style: options.fullPage && label === 'mobile' ? '[data-testid=mobile-tabbar] { visibility: hidden !important; }' : undefined}); };
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/cart');await page.getByTestId('button-submit-order').waitFor();
  await page.getByTestId('input-note').fill('문 앞에 놓아 주세요.');
  await shot({path:join(out,`${label}-${process.env.BASELINE_SCREENSHOTS ? "before" : "cart"}.png`),fullPage:true});
  if (process.env.BASELINE_SCREENSHOTS) { await shot({path:join(out,`${label}-before.png`),fullPage:true}); await context.close(); continue; }
  await page.getByTestId('button-submit-order').click();await page.getByTestId('order-confirmation').waitFor();
  assert.equal(await page.getByTestId('button-confirm-order').innerText(),'CONFIRM ORDER');
  assert.equal(await page.getByTestId('button-confirm-order').isEnabled(),true);
  assert.equal(await page.getByText('3 EA',{exact:true}).count(),1);
  assert.equal(await page.getByText('2 EA',{exact:true}).count(),1);
  assert.equal(await page.getByText('희망 배송일',{exact:false}).count(),0);
  assert.equal(await page.locator('input[type=checkbox]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const styles=await page.getByTestId('button-confirm-order').evaluate(el=>({justify:getComputedStyle(el).justifyContent,align:getComputedStyle(el).alignItems,radius:getComputedStyle(el).borderRadius}));
  assert.deepEqual(styles,{justify:'center',align:'center',radius:'0px'});
  await shot({path:join(out,`${label}-confirmation.png`),fullPage:true});
  if (label === 'mobile') {
    await shot({path:join(out,'mobile-viewport.png'),fullPage:false});
    const note = page.getByText('문 앞에 놓아 주세요.',{exact:true});
    await note.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    const noteBox=await note.boundingBox(), navBox=await page.getByTestId('mobile-tabbar').boundingBox();
    assert(noteBox && navBox && noteBox.y+noteBox.height < navBox.y);
    await page.screenshot({path:join(out,'mobile-details-viewport.png'),animations:'disabled'});
    await page.getByTestId('button-confirm-order').scrollIntoViewIfNeeded();
    const buttonBox=await page.getByTestId('button-confirm-order').boundingBox();
    assert(buttonBox && navBox && buttonBox.y+buttonBox.height < navBox.y);
    assert.equal(await page.getByTestId('button-confirm-order').evaluate(el=>{
      const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return hit === el || el.contains(hit);
    }),true);
    await page.screenshot({path:join(out,'mobile-summary-viewport.png'),animations:'disabled'});
  }
  // Change the real fixture DB after review; final submission must fail and retain cart.
  db.update(products).set({price:24000}).where(eq(products.id,cart[0].productId)).run();
  await page.getByTestId('button-confirm-order').click();await page.getByTestId('button-submit-order').waitFor();
  assert.equal(db.select().from(orders).all().length,0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('knit.cart.v1')!).length),2);
  await page.getByTestId('button-submit-order').click();await page.getByTestId('order-confirmation').waitFor();
  assert.equal(await page.getByTestId('button-confirm-order').isDisabled(),true);
  await shot({path:join(out,`${label}-price-change.png`),fullPage:true});
  await page.getByRole('button',{name:'변경된 주문 다시 확인'}).click();
  await page.waitForFunction(()=>!(document.querySelector('[data-testid=button-confirm-order]') as HTMLButtonElement)?.disabled);
  await page.getByTestId('button-confirm-order').click();await page.waitForURL('**/#/invoice/*');
  assert.equal(db.select().from(orders).all().length,1);
  assert.equal(db.select().from(orders).get()!.totalAmount,134200);
  db.delete(orders).run();db.update(products).set({price:23000}).where(eq(products.id,cart[0].productId)).run();
  // Missing address uses existing account navigation and blocks final confirmation.
  db.update(customers).set({defaultAddress:''}).run();
  await page.goto(origin+'/#/cart');await page.reload();await page.getByTestId('button-submit-order').click();await page.getByTestId('order-confirmation').waitFor();
  assert.equal(await page.getByTestId('button-confirm-order').isDisabled(),true);
  await shot({path:join(out,`${label}-missing-address.png`),fullPage:true});
  await page.getByRole('button',{name:'내 정보에서 수정'}).click();await page.waitForURL('**/#/account');
  db.update(customers).set({defaultAddress:user.defaultAddress}).run();
  const requestBody = {items:cart.map(i=>({...i,amount:i.unitPrice*i.qty})),note:'동시 제출 검증',quickRequest:false};
  const fresh = await (await context.request.post(origin+'/api/orders/preview',{data:requestBody})).json();
  const results = await Promise.all([1,2].map(()=>context.request.post(origin+'/api/orders',{data:{...requestBody,confirmationRevision:fresh.revision}})));
  assert.deepEqual(results.map(r=>r.status()).sort(),[200,409]);
  assert.equal(db.select().from(orders).all().length,1);db.delete(orders).run();
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${label}: real React + isolated API/DB, price conflict/reconfirmation, order write, missing address, concurrent duplicate submission, overflow/centering/zero-radius/unobscured mobile controls`);
 }
}finally{await browser.close();server.closeAllConnections();server.close();sqlite.close();}
