import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { insertProductCategorySchema, insertProductSchema } from '../../shared/schema';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(),'knit-products-ui-'));
const { storage, sqlite, seedProductCategories, seedEquipmentCategories } = await import('../../server/storage');
seedProductCategories(); seedEquipmentCategories();
const bean = await storage.createProduct({name:'코튼 블렌드 1kg',category:'blend',origin:'브라질',price:32000,available:1});
const filter = await storage.createProduct({name:'정수 필터 교체 카트리지',category:'water_filter',origin:'규격 A',price:75000,available:1,ecountCode:'WF-01'});
await storage.createProduct({name:'포터필터 바스켓 18g',category:'machine_parts',price:45000,available:0});
const hidden = await storage.createProduct({name:'숨긴 테스트 상품',category:'blend',price:10000,available:1});
await storage.updateProduct(hidden.id,{hidden:1});
let role = 'owner';
const app = express(); app.use(express.json());
app.use((req,_res,next) => { (req as any).session = {role:'admin',adminRole:role,userId:1}; next(); });
const ast = ts.createSourceFile('routes.ts',readFileSync('server/routes.ts','utf8'),ts.ScriptTarget.Latest,true);
const parts:string[]=[];
function visit(n:ts.Node) {
 if(ts.isFunctionDeclaration(n) && ['requireAdmin','requireAuth','requireOwner'].includes(n.name?.text??'')) parts.push(n.getText(ast));
 if(ts.isCallExpression(n) && /^app\.(get|post|patch|delete)$/.test(n.expression.getText(ast)) && ts.isStringLiteral(n.arguments[0]) && ['/api/products','/api/products/:id','/api/admin/products','/api/admin/products/:id','/api/product-categories','/api/admin/product-categories','/api/admin/product-categories/:id'].includes(n.arguments[0].text)) parts.push(n.getText(ast)+';');
 ts.forEachChild(n,visit);
}
visit(ast);
new Function('app','storage','getActor','insertProductCategorySchema','insertProductSchema',transformSync(parts.join('\n'),{loader:'ts'}).code)(app,storage,async()=>({actorUserId:1,actorEmail:'fixture@example.invalid',actorRole:'admin'}),insertProductCategorySchema,insertProductSchema);
app.get('/api/auth/me',(_req,res)=>res.json({id:1,role:'admin',adminRole:role,businessName:'테스트',managerName:'테스트 관리자',bizVerified:1}));
app.get('/api/{*path}',(_req,res)=>res.json([]));
app.use('/api',(_req,res)=>res.status(405).end());
app.use(express.static(resolve('dist/public')));
const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const out=resolve('artifacts/catalog');mkdirSync(out,{recursive:true});


try {
 for (const [size,width,height] of [['desktop',1440,1000],['mobile',390,844],['small',320,740]] as const) {
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage();
  const news=[{id:41,title:'새로운 커피와 함께하는 니트커피의 가을 이야기',coverImage:'',pinned:1,publishedAt:Date.now()},{id:42,title:'파트너를 위한 커피 세팅 안내',coverImage:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23958c77"/></svg>',pinned:0,publishedAt:Date.now()}];
  await page.route('**/api/news',r=>r.fulfill({json:news}));
  await page.goto(origin+'/#/catalog');
  await page.getByTestId('section-water_filter').waitFor();
  await page.getByRole('heading',{name:'니트커피 소식',exact:true}).waitFor();
  assert.equal(await page.getByTestId('section-water_filter').locator('.catalog-category-count').innerText(),'1개 상품');
  assert.equal(await page.getByTestId('section-water_filter').locator('.catalog-category-parent').innerText(),'장비·소모품');
  assert.equal(await page.getByTestId('section-machine_parts').count(),0,'sold out categories hidden');
  await page.getByTestId('anchor-water_filter').click();
  await page.waitForTimeout(500);
  assert((await page.getByTestId('section-water_filter').boundingBox())!.y>=0,'anchor target visible');
  await page.getByTestId(`button-qty-plus-${filter.id}`).click();
  assert.equal(await page.getByTestId('text-total').innerText(),'82,500원');
  await page.getByTestId(`input-qty-${bean.id}`).fill('2');
  await page.getByTestId(`input-qty-${bean.id}`).blur();
  assert.equal(await page.getByTestId('text-total').innerText(),'152,900원');
  const card=page.getByTestId('card-news-41');
  await card.scrollIntoViewIfNeeded();
  assert.equal(await card.getAttribute('href'),'#/news/41');
  assert.equal(await card.locator('h3').evaluate(e=>getComputedStyle(e).opacity),'1','news title visible without hover');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+size);
  assert.equal(await page.getByTestId('section-water_filter').evaluate(e=>getComputedStyle(e).borderLeftWidth),'1px','category panel border');
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300);
  await page.screenshot({path:join(out,size+'.png'),fullPage:true});
  await page.getByTestId('button-add-all-to-cart').click();
  assert.equal(await page.getByTestId(`input-qty-${filter.id}`).inputValue(),'');
  await page.route('**/api/products',r=>r.fulfill({json:[]}));
  await page.reload();
  await page.getByText('판매 중인 상품이 없습니다.',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('anchor-bar').count(),0);
  await page.getByTestId('section-catalog-news').waitFor();
  await page.route('**/api/news',r=>r.fulfill({json:[]}));
  await page.reload();await page.getByText('판매 중인 상품이 없습니다.',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('section-catalog-news').count(),0);
  await page.route('**/api/products',r=>r.fulfill({status:500,json:{message:'test'}}));
  await page.reload();await page.getByText('상품 목록을 불러오지 못했습니다.',{exact:true}).waitFor({timeout:20000});
  await context.close();
 }
 console.log('PASS category anchors/counts/group labels, quantities/cart, always visible news, desktop/mobile/320px, sold out/empty/error states');
} finally {await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));sqlite.close();}
