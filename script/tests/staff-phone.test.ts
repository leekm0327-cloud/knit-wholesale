import assert from 'node:assert/strict';
import { staffPhoneSchema, isStaffMobile } from '../../shared/staff-phone';
import { insertStaffSchema, updateStaffSchema } from '../../shared/schema';
import { mobilePhone } from '../../shared/staff-alerts';

for (const input of ['01012345678', '010-1234-5678', ' 010 1234 5678 ', '(010) 1234-5678']) {
  assert.equal(staffPhoneSchema.parse(input), '010-1234-5678');
  assert.equal(updateStaffSchema.parse({ phone: input }).phone, '010-1234-5678');
  assert.equal(mobilePhone(staffPhoneSchema.parse(input)), true);
}
for (const input of ['0101234567', '010123456789', '0212345678', 'abc01012345678', '010-1234-5678 내선1', '01011112222,01033334444']) {
  assert.equal(staffPhoneSchema.safeParse(input).success, false, input);
  assert.equal(isStaffMobile(input), false, input);
}
assert.equal(staffPhoneSchema.parse('  '), '');
assert.equal(mobilePhone(''), false);
assert.equal(staffPhoneSchema.safeParse(undefined).success, false);
assert.equal(staffPhoneSchema.safeParse(1012345678).success, false);
assert.equal(staffPhoneSchema.parse('0111234567'), '011-123-4567');
assert.deepEqual(updateStaffSchema.parse({ name: '미리보기 직원' }), { name: '미리보기 직원' });
assert.deepEqual(updateStaffSchema.parse({ phone: '01012345678' }), { phone: '010-1234-5678' });
assert.equal(insertStaffSchema.parse({ loginId: 'preview', password: 'preview-password', name: '미리보기 직원' }).phone, '');
assert.equal(insertStaffSchema.safeParse({ loginId: 'preview', password: 'preview-password', name: '미리보기 직원', phone: '02-1234-5678' }).success, false);
console.log('PASS: staff contact normalization, invalid phone rejection, optional creation, partial update preservation and reminder readiness consistency');
