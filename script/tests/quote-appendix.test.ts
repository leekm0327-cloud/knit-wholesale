import assert from 'node:assert/strict';
import { insertQuoteSchema, type Product } from '../../shared/schema';
import { productToAppendix, compositionRows, appendixMatchesProduct, beanEnglishName } from '../../client/src/lib/quoteAppendix';

const product = (id: number, name: string, category: string, detail: any): Product => ({ id, name, category, detailJson: JSON.stringify(detail) } as Product);
const cotton = product(1, '코튼 블렌드 1kg', 'blend', {
  tagline: '저장할 원두 설명', blendComponents: JSON.stringify([{ name: 'Brazil Natural', ratio: '40' }, { name: 'Colombia Washed', ratio: '60%' }]),
  flavorNotes: '견과류', roastLevel: '미디움 다크', espDose: '19g', recipeType: 'espresso',
});
const snapshot = productToAppendix(cotton);
const saved = insertQuoteSchema.parse({ issueDate: '2026-09-30', appendix: [snapshot] });
const restored = JSON.parse(JSON.stringify(saved.appendix))[0];
assert.deepEqual(restored, snapshot, 'API schema must preserve new description, origin and product identity across save/load');
assert.equal(restored.description, '저장할 원두 설명');
assert.equal(restored.recipe, '');
assert.equal(restored.name, '코튼 블렌드');
assert.deepEqual(compositionRows(restored.composition), [{ name: 'Brazil Natural', ratio: '40%' }, { name: 'Colombia Washed', ratio: '60%' }]);
assert.deepEqual(compositionRows('원산지 미정 · Colombia 100%\n비율 협의'), [{ name: '원산지 미정', ratio: '' }, { name: 'Colombia', ratio: '100%' }, { name: '비율 협의', ratio: '' }]);
assert.deepEqual(compositionRows('Brazil 50% / Colombia 50%'), [{ name: 'Brazil', ratio: '50%' }, { name: 'Colombia', ratio: '50%' }]);
const decaf = product(2, '디카페인 1kg', 'decaf', { template: 'single', country: '콜롬비아', region: '나리뇨', variety: '핑크 버번', process: 'Water EA', altitude: '1800m', flavorNotes: '흑설탕' });
const single = productToAppendix(decaf);
assert.equal(single.name, '디카페인');
assert.equal(single.description, '콜롬비아 · 나리뇨 · 핑크 버번');
assert.equal(single.origin, '콜롬비아 · 나리뇨\nWater EA\n재배 고도 1800m');
assert(appendixMatchesProduct(single, decaf));
assert(appendixMatchesProduct({ ...single, productId: undefined, name: '디카페인 콜롬비아 나리뇨 핑크 버번 Water EA' }, decaf), 'Legacy decaf selection must be removable rather than duplicated');
assert(!appendixMatchesProduct(single, cotton));
const legacy = { name: '예전 이름', composition: '이전 구성', flavor: '이전 향미', roast: '이전 배전', recipe: '이전 레시피' };
assert.deepEqual(insertQuoteSchema.parse({ issueDate: '2026-09-30', appendix: [legacy] }).appendix[0], legacy, 'Old saved information must remain unchanged');
assert.equal(beanEnglishName('실크 블렌드 1kg'), 'Silk Blend');
assert.equal(beanEnglishName('새 원두'), '');
assert.equal(productToAppendix({ ...cotton, detailJson: '{broken' }).description, '');
assert.equal(productToAppendix({ ...cotton, detailJson: 'null' }).name, '코튼 블렌드');
console.log('Quote snapshot compatibility and composition checks passed.');
