import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { insertEspressoLogSchema, type EspressoLog } from '../../shared/schema';
import { emptySensory, espressoSensorySchema, matchingNotes, normalizeNotes, readNotes, readSensory } from '../../shared/espresso-sensory';
import { buildPartnerBrewGuide } from '../../server/espresso-guide';

assert.deepEqual(normalizeNotes(['초콜렛', ' chocolate ', 'Ｃｈｏｃｏｌａｔｅ', '다크초콜릿', 'dark_chocolate', '카라멜', '캐러멜', '너티', '견과류', '특별한 향', '특별한향']), ['초콜릿', '다크 초콜릿', '캐러멜', '견과류', '특별한 향']);
assert.deepEqual(readNotes('["자스민", "재스민", 10]'), ['재스민']);
assert.deepEqual(readNotes('{"bad":true}'), []);
assert(matchingNotes('floral', '과일').includes('재스민'));
assert(matchingNotes('caramel', '꽃').includes('캐러멜'));
assert(matchingNotes('고소', '전체').includes('헤이즐넛'));
assert.equal(emptySensory().acidity.intensity, null);
assert.equal(espressoSensorySchema.parse({ acidity: { intensity: 0 } }).acidity.quality, null);
for (const bad of [{ acidity: { intensity: 6 } }, { acidity: { quality: 0 } }, { body: { intensity: 0 } }, { sweetness: { intensity: 2.5 } }, { flavor: { intensity: '3' } }, { defects: ['unknown'] }]) {
  assert.equal(espressoSensorySchema.safeParse(bad).success, false);
}
assert.equal(insertEspressoLogSchema.safeParse({ beanName: '테스트', flavorTags: ['x'.repeat(31)] }).success, false);
assert.equal(insertEspressoLogSchema.safeParse({ beanName: '테스트', flavorTags: Array(21).fill('꿀') }).success, false);
assert.equal(insertEspressoLogSchema.safeParse({ beanName: '테스트', recommendToPartners: true }).success, false);

const base: EspressoLog = { id: 1, staffId: 999, staffName: 'INTERNAL_STAFF', logDate: '2026-09-15', beanName: '테스트 블렌드', machine: '', grindSetting: '2.1', doseG: 18, yieldG: 36, timeSec: 28, waterTemp: 93, tds: '', rating: 5, flavorTags: '["초콜렛","초콜릿","꿀"]', memo: 'PRIVATE_MEMO', roomTemp: 24, roomHumidity: 55, grinderTemp: 30, roastDays: 8, source: 'staff', createdAt: 1, sensory: null, recommendToPartners: 0 };
const sensory = espressoSensorySchema.parse({ acidity: { intensity: 0, quality: 5 }, sweetness: { intensity: 4, quality: 2 }, textures: ['크리미함'], defects: ['고무 냄새'] });
const newRow = { ...base, sensory: JSON.stringify(sensory), recommendToPartners: 1 };
const records = [
  newRow,
  { ...newRow, id: 2, createdAt: 2, recommendToPartners: 0, sensory: JSON.stringify({ ...sensory, acidity: { intensity: 4, quality: 1 }, sweetness: { intensity: null, quality: null } }) },
  { ...base, id: 3, logDate: '2026-09-02' },
  { ...newRow, id: 4, logDate: '2026-09-01' },
  { ...newRow, id: 5, logDate: '2026-09-16' },
];
const guide = buildPartnerBrewGuide(records, new Date('2026-09-14T15:00:00.000Z'));
assert.equal(guide.from, '2026-09-02');
assert.equal(guide.to, '2026-09-15');
const bean = guide.beans[0];
assert.equal(bean.count, 3);
assert.deepEqual(bean.intensities.acidity, { count: 2, mean: 2, min: 0, max: 4 });
assert.deepEqual(bean.intensities.sweetness, { count: 1, mean: 4, min: 4, max: 4 });
assert.deepEqual(bean.intensities.body, { count: 0, mean: null, min: null, max: null });
assert.equal(bean.notes.find(n => n.label === '초콜릿')?.count, 3); // one vote per record
assert.equal(bean.recommendation?.id, 1); // newer unconfirmed row cannot replace it
assert.equal(bean.recommendationSource, 'confirmed');
const json = JSON.stringify(guide);
for (const privateValue of ['PRIVATE_MEMO', 'INTERNAL_STAFF', 'quality', 'defects', 'textures', 'rating', 'staffId', '고무 냄새', '크리미함']) assert(!json.includes(privateValue), privateValue);
assert.equal(buildPartnerBrewGuide([base], new Date('2026-09-14T14:59:59Z')).beans.length, 0); // before KST midnight
const legacy = buildPartnerBrewGuide([{ ...base, logDate: '2026-08-01' }], new Date('2026-09-15T00:00:00Z')).beans[0];
assert.equal(legacy.count, 0);
assert.equal(legacy.recommendationSource, 'legacy');
assert.equal(legacy.intensities.acidity.count, 0);
assert.equal(buildPartnerBrewGuide([{ ...newRow, recommendToPartners: 0 }], new Date('2026-09-15')).beans[0].recommendation, null);
assert.equal(buildPartnerBrewGuide([{ ...newRow, doseG: 0 }], new Date('2026-09-15')).beans[0].recommendation, null);
assert.deepEqual(readSensory('broken'), emptySensory());
console.log('PASS: aliases, category search, validation, KST window, missing vs zero, per-log frequency, recommendation and public field privacy');

// Real migration on a synthetic pre-feature database, never the production database.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-sensory-test-'));
const oldDb = new Database(join(process.env.DATA_DIR, 'data.db'));
oldDb.exec(`CREATE TABLE espresso_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, staff_name TEXT NOT NULL DEFAULT '',
 log_date TEXT NOT NULL, bean_name TEXT NOT NULL DEFAULT '', machine TEXT NOT NULL DEFAULT '', grind_setting TEXT NOT NULL DEFAULT '',
 dose_g REAL NOT NULL DEFAULT 0, yield_g REAL NOT NULL DEFAULT 0, time_sec REAL NOT NULL DEFAULT 0, water_temp REAL NOT NULL DEFAULT 0,
 tds TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL DEFAULT 0, flavor_tags TEXT NOT NULL DEFAULT '[]', memo TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
 INSERT INTO espresso_logs (staff_id, staff_name, log_date, bean_name, flavor_tags, memo, rating, created_at)
 VALUES (999, 'fixture', '2026-09-01', 'old bean', '["너티","고소"]', 'retain verbatim', 4, 1);`);
const original = oldDb.prepare('SELECT * FROM espresso_logs WHERE id=1').get() as Record<string, unknown>;
oldDb.close();
const { staffStorage } = await import('../../server/staff-storage');
const { sqlite } = await import('../../server/storage');
const migrated = sqlite.prepare('SELECT * FROM espresso_logs WHERE id=1').get() as Record<string, unknown>;
for (const [key, value] of Object.entries(original)) assert.deepEqual(migrated[key], value);
assert.equal(migrated.sensory, null);
assert.equal(migrated.recommend_to_partners, 0);
const payload = insertEspressoLogSchema.parse({ beanName: '테스트 블렌드', logDate: '2026-09-15', doseG: 18, yieldG: 36, timeSec: 28, sensory, flavorTags: ['카라멜', '캐러멜'], recommendToPartners: true, memo: 'private' });
const saved = await staffStorage.createEspressoLog(999, 'fixture', payload);
assert.deepEqual(readSensory(saved.sensory), sensory);
assert.deepEqual(readNotes(saved.flavorTags), ['캐러멜']);
assert.equal(saved.recommendToPartners, 1);
const read = await staffStorage.listEspressoLogs('2026-09-15', '2026-09-15', 999);
assert.equal(read.length, 1);
assert.equal(read[0].memo, 'private');
const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', 'await import("./server/staff-storage.ts"); process.exit(0)'], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
assert.equal(child.status, 0, child.stderr);
assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM espresso_logs').get() as { n: number }).n, 2);
await staffStorage.deleteEspressoLog(saved.id);
assert.equal((await staffStorage.listEspressoLogs('2026-09-15', '2026-09-15')).length, 0);
sqlite.close();
console.log('PASS: repeatable old-schema migration, original data retention, full save/read/delete round trip in disposable database');
