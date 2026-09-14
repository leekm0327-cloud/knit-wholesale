import { z } from 'zod';

export function isStaffMobile(value: string): boolean {
  if (!/^[\d\s()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return /^(010\d{8}|01[16789]\d{7,8})$/.test(digits);
}

// Empty means unregistered. Formatting does not verify who owns the number.
export const staffPhoneSchema = z.string().trim().max(30, '휴대전화번호를 확인해 주세요.')
  .refine(value => value === '' || isStaffMobile(value), '010-1234-5678 형식의 휴대전화번호를 입력해 주세요.')
  .transform(value => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`;
  });
