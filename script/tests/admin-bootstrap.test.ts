import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-bootstrap-'));
delete process.env.INITIAL_ADMIN_PASSWORD;
const { seed, storage, sqlite } = await import('../../server/storage');
try {
  await assert.rejects(seed(), /INITIAL_ADMIN_PASSWORD/);
  assert.equal(sqlite.prepare('SELECT count(*) as n FROM customers').get().n, 0);
  const password = randomBytes(24).toString('hex');
  process.env.INITIAL_ADMIN_PASSWORD = password;
  await seed();
  const before = sqlite.prepare("SELECT * FROM customers WHERE role = 'admin'").all();
  assert.equal(before.length, 1);
  assert(bcrypt.compareSync(password, before[0].password));
  delete process.env.INITIAL_ADMIN_PASSWORD;
  await seed();
  assert.deepEqual(sqlite.prepare("SELECT * FROM customers WHERE role = 'admin'").all(), before);
  process.env.INITIAL_ADMIN_PASSWORD = randomBytes(24).toString('hex');
  await seed();
  assert.deepEqual(sqlite.prepare("SELECT * FROM customers WHERE role = 'admin'").all(), before);
  console.log('PASS bootstrap requires explicit secret for empty DB; existing administrator identity, password and all fields preserved with missing or changed environment value');
} finally { sqlite.close(); }
