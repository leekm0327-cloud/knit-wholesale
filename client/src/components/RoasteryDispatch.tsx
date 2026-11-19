import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { DispatchCompletion, DispatchMethod, DispatchSummary } from '@shared/roastery-dispatch';
import { carrierNames } from '@shared/shipping';

const methodNames: Record<DispatchMethod, string> = { parcel: '택배', quick: '퀵', direct: '직접배송' };
type DispatchInput = {
  revision: string;
  requestKey: string;
  method: DispatchMethod;
  carrier?: string;
  tracking?: string;
  completion: DispatchCompletion;
};

export function DispatchHistory({ dispatch }: { dispatch: DispatchSummary }) {
  if (!dispatch.consignments.length) return null;
  return <ol aria-label="출고 내역" className="dispatch-history">
    {dispatch.consignments.map((shipment, i) => <li key={shipment.id}>
      <strong>{i + 1}차 · {methodNames[shipment.method]}</strong>
      <time dateTime={new Date(shipment.createdAt).toISOString()}>
        {new Date(shipment.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </time>
      {shipment.method === 'parcel' && <p>{carrierNames[shipment.carrier] || shipment.carrier} {shipment.tracking}</p>}
    </li>)}
  </ol>;
}

type Props = {
  dispatch: DispatchSummary;
  disabled: boolean;
  parcelForm: ReactNode;
  onSave: (input: DispatchInput) => Promise<void>;
};

export default function RoasteryDispatch({ dispatch, disabled, parcelForm, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [partial, setPartial] = useState(false);
  const [method, setMethod] = useState<DispatchMethod>('parcel');
  const [carrier, setCarrier] = useState('CJ');
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const lastRequest = useRef<{ body: string; key: string } | null>(null);
  const hasHistory = dispatch.consignments.length > 0;

  function start(partialMode: boolean, delivery: DispatchMethod) {
    setMethod(delivery);
    setPartial(partialMode);
    setError('');
    setTracking('');
    setEditing(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting.current) return;
    const submitted: Omit<DispatchInput, 'requestKey'> = {
      revision: dispatch.revision, method, completion: partial ? 'partial' : 'complete',
      ...(method === 'parcel' ? { carrier, tracking: tracking.trim() } : {}),
    };
    const body = JSON.stringify(submitted);
    if (lastRequest.current?.body !== body) lastRequest.current = { body, key: crypto.randomUUID() };
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave({ ...submitted, requestKey: lastRequest.current.key });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '출고를 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (!editing) return <>
    {!hasHistory && parcelForm}
    <div className="dispatch-actions">
      {hasHistory ? <>
        <button type="button" disabled={disabled} onClick={() => start(true, 'parcel')}>추가 부분출고</button>
        <button type="button" disabled={disabled} onClick={() => start(false, 'parcel')}>마지막 출고</button>
      </> : <>
        <button type="button" disabled={disabled} onClick={() => start(false, 'quick')}>퀵·직배 출고</button>
        <button type="button" disabled={disabled} onClick={() => start(true, 'parcel')}>부분출고</button>
      </>}
    </div>
  </>;

  return <form className="dispatch-form" aria-label="출고 등록" onSubmit={submit}>
    <fieldset disabled={disabled || saving}>
      <legend>{partial ? '부분출고' : hasHistory ? '마지막 출고' : '퀵·직배 출고'}</legend>
      <label>배송 방법
        <select value={method} onChange={e => setMethod(e.target.value as DispatchMethod)}>
          {(Object.keys(methodNames) as DispatchMethod[])
            .filter(value => partial || hasHistory || value !== 'parcel')
            .map(value => <option key={value} value={value}>{methodNames[value]}</option>)}
        </select>
      </label>
      {method === 'parcel' && <div className="dispatch-parcel">
        <label>택배사<select value={carrier} onChange={e => setCarrier(e.target.value)}>
          {Object.entries(carrierNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select></label>
        <label>송장번호<input required inputMode="numeric" autoComplete="off" pattern="[0-9]{8,30}" maxLength={30} title="8~30자리 숫자로 입력해 주세요." value={tracking} onChange={e => setTracking(e.target.value.trim())}/></label>
      </div>}
      {error && <p role="alert" className="ship-warning">{error}</p>}
      <div className="dispatch-actions"><button type="button" onClick={() => setEditing(false)}>취소</button>
        <button className="ship-primary" type="submit">
          {saving ? '저장 중…' : partial ? '부분출고 저장' : '출고 완료'}
        </button>
      </div>
    </fieldset>
  </form>;
}
