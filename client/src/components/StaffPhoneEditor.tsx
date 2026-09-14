import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { errMsg } from '@/lib/format';
import { staffPhoneSchema, isStaffMobile } from '@shared/staff-phone';
import type { PublicStaff } from '@shared/schema';

export default function StaffPhoneEditor({ staff }: { staff: PublicStaff }) {
  const [phone, setPhone] = useState(staff.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const changed = phone !== (staff.phone || '');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !changed) return;
    const parsed = staffPhoneSchema.safeParse(phone);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await apiRequest('PATCH', `/api/admin/staff/${staff.id}`, { phone: parsed.data });
      const next = await response.json() as PublicStaff;
      setPhone(next.phone); setSaved(true);
      queryClient.setQueryData<PublicStaff[]>(['/api/admin/staff'], old => old?.map(s => s.id === next.id ? next : s));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/admin/staff'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/admin/staff/alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/staff/me'] }),
      ]);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="mt-3 border-t pt-3" data-testid={`staff-phone-form-${staff.id}`}>
    <label htmlFor={`staff-phone-${staff.id}`} className="text-xs font-medium">휴대전화 · 알림톡 수신 번호</label>
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Input id={`staff-phone-${staff.id}`} aria-label={`${staff.name} 휴대전화번호`} className="w-full sm:w-56" type="tel" inputMode="tel" autoComplete="off" placeholder="010-1234-5678" maxLength={30} value={phone} disabled={busy} onChange={e => { setPhone(e.target.value); setError(''); setSaved(false); }} data-testid={`input-staff-phone-${staff.id}`} />
      <Button type="submit" size="sm" disabled={busy || !changed} data-testid={`save-staff-phone-${staff.id}`}>{busy ? '저장 중…' : '번호 저장'}</Button>
      {changed && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setPhone(staff.phone || ''); setError(''); setSaved(false); }}>취소</Button>}
      <span className={`text-xs ${isStaffMobile(staff.phone || '') ? 'text-muted-foreground' : 'text-amber-700'}`}>{isStaffMobile(staff.phone || '') ? '번호 등록됨' : staff.phone ? '번호 확인 필요' : '번호 미등록'}</span>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {saved && <p role="status" className="mt-2 text-xs">번호를 저장했습니다. {phone ? '다음 알림부터 이 번호를 사용합니다.' : '번호를 등록하기 전까지 직원 알림을 보내지 않습니다.'}</p>}
  </form>;
}
