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
const out=resolve('artifacts/product-detail');mkdirSync(out,{recursive:true});

try {
 const legacy={template:'blend',tagline:'',blendComponents:'',flavorNotes:'',description:'',specifications:'',compatibility:'',recommendedUse:'',customLegacy:'preserve-me'};
 await storage.updateProduct(filter.id,{detailTemplate:'blend',detailJson:JSON.stringify(legacy)});
 await storage.updateProduct(bean.id,{detailTemplate:'blend',detailJson:JSON.stringify({template:'blend',blendRatio:'브라질 70%, 콜롬비아 30%',flavorNotes:'초콜릿',roastLevel:'미디엄'})});
 const single=await storage.createProduct({name:'싱글 테스트',category:'single_filter',price:20000,available:1,detailTemplate:'single',detailJson:JSON.stringify({template:'single',country:'Ethiopia',region:'Sidama',flavorNotes:'자스민'})});
 const drip=await storage.createProduct({name:'드립백 테스트',category:'dripbag',price:2000,available:1,detailJson:JSON.stringify({template:'blend',flavorNotes:'견과류'})});
 const parts=(await storage.listProducts()).find(p=>p.category==='machine_parts')!;
 await storage.updateProduct(parts.id,{detailJson:JSON.stringify({template:'blend',specifications:'18g / 58mm'})});
 for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const) {
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',(r:any)=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.goto(origin+`/#/products/${filter.id}`);
  await page.getByRole('heading',{name:'정수 필터 정보',exact:true}).waitFor();
  assert.equal(await page.getByText('블렌드 정보',{exact:true}).count(),0);
  assert.equal(await page.getByText('로스팅 레벨',{exact:true}).count(),0);
  await page.screenshot({path:join(out,size+'-filter.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const [id,expected] of [[bean.id,'블렌드 정보'],[single.id,'Ethiopia'],[drip.id,'블렌드 정보'],[parts.id,'머신 부품 정보']] as const) {
   await page.goto(origin+`/#/products/${id}`);await page.getByText(expected,{exact:true}).waitFor();
  }
  await page.goto(origin+'/#/admin/products');await page.getByTestId(`button-edit-${filter.id}`).click();
  await page.getByText('상세 콘텐츠·이미지 편집',{exact:true}).click();
  await page.getByRole('heading',{name:'정수 필터 정보',exact:true}).waitFor();
  assert.equal(await page.getByTestId('select-detail-template').count(),0);
  await page.getByLabel('규격·사양',{exact:true}).fill('카트리지 규격 테스트');
  await page.getByLabel('호환 정보',{exact:true}).fill('호환 헤드 테스트');
  await page.getByLabel('사용·관리 안내',{exact:true}).fill('제조사 안내 확인');
  await page.getByTestId('button-save-product').click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const saved=JSON.parse((await storage.getProduct(filter.id))!.detailJson);assert.equal(saved.customLegacy,'preserve-me');assert.equal(saved.template,'blend');
  await page.goto(origin+`/#/products/${filter.id}`);await page.getByText('카트리지 규격 테스트',{exact:true}).waitFor();await page.getByText('호환 헤드 테스트',{exact:true}).waitFor();
  await page.screenshot({path:join(out,size+'-specifications.png'),fullPage:true});
  await page.goto(origin+'/#/admin/products');await page.getByTestId(`button-edit-${bean.id}`).click();await page.getByText('상세 콘텐츠·이미지 편집',{exact:true}).click();await page.getByTestId('select-detail-template').waitFor();
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS category-aware detail and editor: legacy blend filter, machine parts, blend/single/dripbag regression, specifications save/read-back, unknown fields preserved, desktop/mobile');
} finally {await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));sqlite.close();}
