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
const out=resolve('artifacts/typography');mkdirSync(out,{recursive:true});


try {
 const baseline=process.env.FONT_BASELINE==='1';
 const baselinePath=resolve('script/tests/fixtures/typography-headings.json');
 const recorded:Record<string,unknown>={};
 const previous=baseline?{}:JSON.parse(readFileSync(baselinePath,'utf8'));
 for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const) {
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',(r:any)=>r.request().url().startsWith(origin)||r.request().url().startsWith('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/')?r.continue():r.abort());
  const page=await context.newPage();
  for(const route of ['/admin/products',`/products/${filter.id}`,'/catalog','/login','/register']) {
   await page.goto(origin+'/#'+route);await page.waitForTimeout(400);
   const headings=await page.locator('h1,h2,h3,h4,h5,h6,.eyebrow,.knit-landing .subhead').evaluateAll((els:any[])=>els.filter(e=>e.dataset.testid!=='text-name').map(e=>({text:e.textContent,font:getComputedStyle(e).fontFamily})));
   const key=size+route;recorded[key]=headings;
   if(!baseline){
    assert(headings.every((h:any)=>h.font.includes("Pretendard")),`Pretendard heading fonts: ${key}`);
    const content=await page.locator(route==='/login'?'.knit-landing':route==='/register'?'.registration-page':route==='/admin/products'?'.erp-admin':'body').first().evaluate((e:any)=>getComputedStyle(e).fontFamily);
    assert(content.includes('Pretendard'),`content font ${key}`);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${key}`);
    if(route.startsWith('/products/')) {
      assert((await page.getByTestId('text-name').evaluate((e:any)=>getComputedStyle(e).fontFamily)).includes('Pretendard'));
      await page.getByRole('heading',{name:'정수 필터 정보',exact:true}).waitFor();
    }
    if(route==='/admin/products') assert((await page.getByTestId(`row-product-${filter.id}`).evaluate((e:any)=>getComputedStyle(e).fontFamily)).includes('Pretendard'));
    await page.screenshot({path:join(out,size+'-'+route.replace(/[^a-z0-9]/gi,'_')+'.png'),fullPage:true});
   }
  }
  if(!baseline){
   const fontLoaded=await page.evaluate(async()=>{const fonts=await document.fonts.load('400 16px "Pretendard Variable"','에버퓨어 상품 정보');return fonts.some(f=>f.status==='loaded');});
   assert(fontLoaded,'actual Pretendard Korean font file loaded');
   const scopedHeadings=await page.evaluate(()=>{
    const box=document.createElement('div');box.innerHTML='<div class="qdoc"><h1>견적서</h1></div><div class="staff-ui"><h1 class="font-ui">직원 제목</h1></div>';document.body.append(box);
    const fonts=Array.from(box.querySelectorAll('h1')).map(e=>getComputedStyle(e).fontFamily);box.remove();return fonts;
   });
   assert(scopedHeadings[0].includes('KnitQuoteBatang'),'quote document heading preserved');
   assert(scopedHeadings[1].includes('Pretendard'),'staff UI heading uses Pretendard');
  }
  await context.close();
 }
 if(baseline){const {writeFileSync}=await import('node:fs');writeFileSync(baselinePath,JSON.stringify(recorded,null,2));}
 console.log(baseline?'Saved baseline heading fonts':'PASS Pretendard headings/body/product names and Korean glyphs loaded, desktop/mobile catalog/detail/admin/landing/registration, no horizontal overflow');
} finally {await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));sqlite.close();}
