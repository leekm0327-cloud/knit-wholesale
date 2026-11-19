import { useRef, useState, type FormEvent } from 'react';
import { MAX_TRACKINGS_PER_DISPATCH, normalizeTrackingNumber, type DispatchCompletion, type DispatchMethod, type DispatchSummary } from '@shared/roastery-dispatch';
import { carrierNames, shipmentTrackingNumbers } from '@shared/shipping';

const methodNames: Record<DispatchMethod, string> = { parcel: '택배', quick: '퀵', direct: '직접배송' };

type Shipment = {
  method: DispatchMethod;
  completion: DispatchCompletion;
  carrier?: string;
  trackings?: string[];
};
type Action = Shipment | { action: 'close_partial' };
type DispatchInput = Action & { revision: string; requestKey: string };

export function DispatchHistory({ dispatch }: { dispatch: DispatchSummary }) {
  if (!dispatch.consignments.length) return null;
  return <ol aria-label="출고 내역" className="dispatch-history">
    {dispatch.consignments.map((shipment, i) => {
      const numbers = shipmentTrackingNumbers(shipment);
      return <li key={shipment.id}>
        <strong>{i + 1}차 · {methodNames[shipment.method]}{numbers.length > 1 && ` · ${numbers.length}상자`}</strong>
        <time dateTime={new Date(shipment.createdAt).toISOString()}>
          {new Date(shipment.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </time>
        {shipment.method === 'parcel' && <div>
          {numbers.map((number, index) => <p key={number}>
            {numbers.length > 1 && `상자 ${index + 1} · `}{carrierNames[shipment.carrier] || shipment.carrier} {number}
          </p>)}
        </div>}
      </li>;
    })}
  </ol>;
}

type Props = {
  dispatch: DispatchSummary;
  disabled: boolean;
  orderNo: string;
  initialTracking: string;
  initialCarrier: string;
  singlePending: boolean;
  singleHasCarrier?: boolean;
  singleMessage?: string;
  singleFailed?: boolean;
  onSaveSingle?: (carrier: string, tracking: string) => Promise<void>;
  onSave: (input: DispatchInput) => Promise<void>;
};
type Mode = 'default' | 'quick' | 'partial' | 'last' | 'close';

export default function RoasteryDispatch({ dispatch, disabled, orderNo, initialTracking, initialCarrier, singlePending, singleHasCarrier = true, singleMessage, singleFailed, onSaveSingle, onSave }: Props) {
  const [mode, setMode] = useState<Mode>('default');
  const [method, setMethod] = useState<DispatchMethod>('parcel');
  const [carrier, setCarrier] = useState(initialCarrier || 'CJ');
  const [numbers, setNumbers] = useState([normalizeTrackingNumber(initialTracking)]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const lastRequest = useRef<DispatchInput | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const hasHistory = dispatch.consignments.length > 0;
  const locked = disabled || saving || singlePending || !!lastRequest.current;

  function open(next: Mode) {
    setMode(next);
    setMethod(next === 'quick' ? 'quick' : 'parcel');
    setError('');
  }

  function addBox() {
    setNumbers([...numbers, '']);
    requestAnimationFrame(() => inputs.current[numbers.length]?.focus());
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting.current || disabled) return;
    let payload = lastRequest.current;
    if (!payload && mode !== 'close' && method === 'parcel' && new Set(numbers).size !== numbers.length) {
      setError('같은 송장번호가 두 번 입력됐어요. 상자별 번호를 확인해 주세요.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      if (!payload && onSaveSingle && (singlePending || (mode === 'default' && numbers.length === 1))) {
        await onSaveSingle(carrier, numbers[0]);
        return;
      }
      if (!payload) {
        const action: Action = mode === 'close' ? { action: 'close_partial' } : {
          method, completion: mode === 'partial' ? 'partial' : 'complete',
          ...(method === 'parcel' ? { carrier, trackings: numbers } : {}),
        };
        payload = { ...action, revision: dispatch.revision, requestKey: crypto.randomUUID() };
        lastRequest.current = payload;
      }
      await onSave(payload);
      lastRequest.current = null;
      setMode('default');
    } catch (e) {
      const status = (e as {status?: number})?.status;
      if (status && status < 500) lastRequest.current = null;
      setError(e instanceof Error ? e.message : '저장 결과를 확인하지 못했습니다. 다시 확인해 주세요.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (mode === 'close') return <section className="dispatch-form" aria-label="출고 마감 확인">
    <strong>이 주문의 출고를 마감할까요?</strong>
    <p>지금까지 등록한 출고 내역으로 완료 처리합니다.</p>
    {error && <p role="alert" className="ship-warning">{error}</p>}
    <div className="dispatch-actions">
      <button type="button" disabled={locked} onClick={() => open('default')}>돌아가기</button>
      <button type="button" disabled={disabled || saving} className="ship-primary" onClick={() => submit()}>
        {saving ? '저장 중…' : lastRequest.current ? '저장 결과 확인' : '마감 확정'}
      </button>
    </div>
  </section>;

  const defaultMode = mode === 'default';
  const showCarrier = singleHasCarrier || !defaultMode || numbers.length > 1;
  return <>
    {(!defaultMode || !hasHistory) && <form className={defaultMode ? 'dispatch-inline' : 'dispatch-form'} aria-label="출고 등록" onSubmit={submit}>
      <fieldset disabled={locked}>
        {!defaultMode && <>
          <legend>{mode === 'partial' ? '부분출고' : mode === 'last' ? '마지막 출고' : '퀵·직배 출고'}</legend>
          <label>배송 방법
            <select value={method} onChange={e => { setMethod(e.target.value as DispatchMethod); setError(''); }}>
              {(Object.keys(methodNames) as DispatchMethod[]).filter(value => mode !== 'quick' || value !== 'parcel')
                .map(value => <option key={value} value={value}>{methodNames[value]}</option>)}
            </select>
          </label>
        </>}
        {method === 'parcel' && <div className={showCarrier ? "dispatch-parcels" : "dispatch-boxes"}>
          {showCarrier && <select aria-label={`${orderNo} 택배사`} value={carrier} onChange={e => setCarrier(e.target.value)}>
            {Object.entries(carrierNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>}
          <div className="dispatch-boxes">
            {numbers.map((number, index) => <div key={index} className="dispatch-box">
              <input ref={input => { inputs.current[index] = input; }} aria-label={`${orderNo} ${index + 1}번 상자 송장번호`}
                required inputMode="numeric" autoComplete="off" pattern="[0-9]{8,30}" title="송장번호 8~30자리를 입력해 주세요."
                placeholder={numbers.length === 1 ? '송장번호' : `상자 ${index + 1} 송장번호`} value={number}
                onPaste={e => {
                  if (/[\t\r\n]/.test(e.clipboardData.getData('text').trim())) {
                    e.preventDefault();
                    setError('송장번호는 상자마다 한 칸씩 입력해 주세요.');
                  }
                }}
                onChange={e => { setNumbers(numbers.map((n, i) => i === index ? normalizeTrackingNumber(e.target.value) : n)); setError(''); }}/>
              {index === 0
                ? <button type="button" aria-label="상자 송장 추가" title="상자 송장 추가" disabled={numbers.length >= MAX_TRACKINGS_PER_DISPATCH} onClick={addBox}>＋</button>
                : <button type="button" aria-label={`${index + 1}번 상자 송장 빼기`} onClick={() => { setNumbers(numbers.filter((_, i) => i !== index)); setError(''); inputs.current[index - 1]?.focus(); }}>−</button>}
            </div>)}
          </div>
        </div>}
      </fieldset>
      {mode === 'partial' && !hasHistory && <p className="ship-muted">부분출고 알림톡을 사용 중이면 이번 저장 시 거래처에 한 번 안내합니다.</p>}
      {error && <p role="alert" className="ship-warning">{error}</p>}
      {defaultMode && singleMessage && <p className={singleFailed ? 'ship-warning' : 'ship-muted'} role={singleFailed ? 'alert' : 'status'}>{singleMessage}</p>}
      <div className="dispatch-actions">
        {!defaultMode && <button type="button" disabled={locked} onClick={() => open('default')}>취소</button>}
        <button type="submit" className="ship-primary" disabled={disabled || saving}>
          {saving ? '저장 중…' : singlePending || lastRequest.current ? '저장 결과 확인' : mode === 'partial' ? '부분출고 저장' : defaultMode && numbers.length === 1 ? '송장 저장' : '출고 완료'}
        </button>
      </div>
    </form>}
    {defaultMode && <div className="dispatch-actions">
      {hasHistory ? <>
        <button type="button" disabled={locked} onClick={() => open('partial')}>추가 부분출고</button>
        <button type="button" disabled={locked} onClick={() => open('last')}>마지막 출고</button>
        {dispatch.status === 'partial' && <button type="button" disabled={locked} onClick={() => open('close')}>출고 마감</button>}
      </> : <>
        <button type="button" disabled={locked} onClick={() => open('quick')}>퀵·직배 출고</button>
        <button type="button" disabled={locked} onClick={() => open('partial')}>부분출고</button>
      </>}
    </div>}
  </>;
}
