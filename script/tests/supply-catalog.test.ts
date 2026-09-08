import assert from 'node:assert/strict';
import { appendSupplyText, supplyCatalog } from '../../client/src/lib/supply-catalog';
assert.equal(new Set(supplyCatalog.map(i=>i.id)).size,supplyCatalog.length);
assert.equal(appendSupplyText('생레몬 5개',[{id:'매일우유 오리지널',quantity:'2',unit:'박스'},{id:'버터',quantity:'2.5',unit:'kg'}]),'생레몬 5개\n매일우유 오리지널 2박스\n버터 2.5kg');
for(const quantity of ['0','-1','1e2','NaN','1.0001',''])assert.throws(()=>appendSupplyText('',[{id:'버터',quantity,unit:'개'}]));
assert.throws(()=>appendSupplyText('a'.repeat(1999),[{id:'버터',quantity:'1',unit:'개'}]));
assert.equal(appendSupplyText('기존 기록',[]),'기존 기록');
assert(supplyCatalog.some(i=>i.name==='생크림')&&supplyCatalog.some(i=>i.name==='휘핑크림'));
console.log('PASS: unique items, append preservation, decimal quantity, invalid/empty/overlong rejection, separate creams');
