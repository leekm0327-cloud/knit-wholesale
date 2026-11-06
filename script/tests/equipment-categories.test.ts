import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-equipment-'));
const { storage, seedProductCategories, seedEquipmentCategories, sqlite } = await import('../../server/storage');
try {
  seedProductCategories();
  const before = await storage.listProductCategories();
  const product = await storage.createProduct({name:'기존 원두', category:'blend', price:10000, available:1});
  seedEquipmentCategories();
  const after = await storage.listProductCategories();
  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.slice(before.length).map(c => [c.key,c.label,c.groupLabel,c.isBean,c.sampleEligible]), [
    ['water_filter','정수 필터','장비·소모품',0,0], ['machine_parts','머신 부품','장비·소모품',0,0]
  ]);
  assert.deepEqual(await storage.getProduct(product.id), product);
  seedEquipmentCategories();
  assert.deepEqual(await storage.listProductCategories(), after);
  const water = after.find(c => c.key === 'water_filter')!;
  await storage.updateProductCategory(water.id, {label:'관리자가 수정한 필터', active:0});
  await storage.deleteProductCategory(after.find(c => c.key === 'machine_parts')!.id);
  const edited = await storage.listProductCategories();
  seedEquipmentCategories();
  assert.deepEqual(await storage.listProductCategories(), edited, 'later administrator changes must persist');
  const extra = await storage.createProductCategory({key:'fixture',label:'테스트',groupLabel:'장비·소모품',isBean:false,sampleEligible:false,active:true,sortOrder:50});
  assert.equal(extra.groupLabel, '장비·소모품');
  console.log('PASS category migration: exact requested leaves, non-bean/sample flags, idempotence, existing data and later admin edits preserved');
} finally { sqlite.close(); }
