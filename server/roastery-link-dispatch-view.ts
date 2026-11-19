import { MAX_TRACKINGS_PER_DISPATCH, trackingSeparators } from '../shared/roastery-dispatch';

// Inserted into the standalone link page's CSP-hashed script.
export const dispatchView = String.raw`
const methods={parcel:'택배',quick:'퀵',direct:'직접배송'};
const carriers={CJ:'CJ대한통운',HANJIN:'한진택배',LOTTE:'롯데택배',POST:'우체국택배',LOGEN:'로젠택배'};
const canonicalTracking=value=>value.trim().replace(${trackingSeparators},'');
function focusBox(orderId,index){root.querySelector('[data-focus="'+ orderId +'-tracking-'+ index +'"]')?.focus();}

function renderEditor(o,d) {
  const panel=el('div',null,'shipping');
  const info=o.dispatch;
  const hasHistory=info.consignments.length>0;
  const canShip=o.confirmed && (info.status==='open'||info.status==='partial') && o.status!=='cancelled';
  const canEditParcel=o.editable && !hasHistory;
  let label=labels[o.status]||'확인 필요';
  if (hasHistory && o.status!=='cancelled') {
    label=info.status==='complete'?'출고 완료':info.status==='review_required'?'주문 변경 · 관리자 확인':'부분출고';
  }
  panel.append(el('strong',label,'state'));
  if(hasHistory && o.status!=='cancelled') {
    const history=el('ol',null,'packages');
    for(const [i,entry] of info.consignments.entries()) {
      const numbers=entry.trackings || (entry.tracking?[entry.tracking]:[]);
      const li=el('li');
      li.append(el('b',(i+1)+'차 · '+(methods[entry.method]||entry.method)+(numbers.length>1?' · '+numbers.length+'상자':'')));
      const time=el('time',new Date(entry.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));
      time.dateTime=new Date(entry.createdAt).toISOString();li.append(document.createTextNode(' · '),time);
      numbers.forEach((number,index)=>li.append(el('span',(numbers.length>1?'상자 '+(index+1)+' · ':'')+(carriers[entry.carrier]||entry.carrier)+' '+number)));
      history.append(li);
    }
    panel.append(history);
  } else if(!canEditParcel && o.tracking && o.status!=='cancelled') {
    panel.append(el('p',(carriers[o.carrier]||o.carrier)+' '+o.tracking));
  }
  const locked=!!(d.saving||d.pending||d.legPending||d.saved);
  if(d.confirmClose && (canShip||d.legPending?.action==='close_partial')){
    const confirm=el('div',null,'leg-form');
    confirm.append(el('b','이 주문의 출고를 마감할까요?'),el('p','지금까지 등록한 출고 내역으로 완료 처리합니다.'));
    const buttons=el('div',null,'dispatch-choices');
    const back=el('button','돌아가기');back.disabled=locked;back.onclick=()=>{d.confirmClose=false;d.message='';render();};
    const close=el('button',d.saving?'저장 중…':d.legPending?'저장 결과 확인':'마감 확정');
    close.disabled=!!(d.saving||d.saved);close.onclick=()=>saveLeg(o,d,true);
    buttons.append(back,close);confirm.append(buttons);panel.append(confirm);
  }else if (canShip || canEditParcel || d.legPending) {
    const form=el('form',null,'leg-form');
    if (canShip) {
      const choices=el('div',null,'dispatch-choices');
      choices.setAttribute('role','group');
      choices.setAttribute('aria-label','이번 출고 상태');
      for(const [value,label] of [['partial',hasHistory?'추가 부분출고':'부분출고'],['complete',hasHistory?'마지막 출고':'전체 출고']]) {
        const button=el('button',label);
        button.type='button';button.disabled=locked;
        button.setAttribute('aria-pressed',String(d.completion===value));
        button.onclick=()=>{d.completion=value;d.message='';render();};
        choices.append(button);
      }
      if(hasHistory && info.status==='partial'){
        const close=el('button','출고 마감');close.type='button';close.disabled=locked;
        close.onclick=()=>{d.confirmClose=true;d.message='';render();};
        choices.append(close);
      }
      form.append(choices);
    }
    function addSelect(choices,selected,title,change){
      const field=el('label',null,'line');field.append(el('span',title));
      const select=el('select');select.setAttribute('aria-label',title);select.dataset.focus=o.id+'-'+title;
      for(const [key,value] of Object.entries(choices)){const option=el('option',value);option.value=key;select.append(option);}
      select.value=selected;select.disabled=locked;select.onchange=()=>change(select.value);
      field.append(select);form.append(field);
    }
    if(canShip)addSelect(methods,d.method,'배송 방법',method=>{d.method=method;d.message='';render();});
    const parcel=d.method==='parcel'||!canShip;
    if(parcel){
      addSelect(carriers,d.carrier,'택배사',carrier=>{d.carrier=carrier;});
      for(const [index,number] of [d.tracking,...d.extraTrackings].entries()){
        const box=el('div',null,'box');
        const input=el('input');input.value=number;input.inputMode='numeric';input.pattern='[0-9]{8,30}';input.required=true;
        input.placeholder=d.extraTrackings.length?'상자 '+(index+1)+' 송장번호':'송장번호 8~30자리';
        input.autocomplete='off';input.disabled=locked;input.dataset.focus=o.id+'-tracking-'+index;input.setAttribute('aria-label',o.storeName+' '+(index+1)+'번 상자 송장번호');
        input.onpaste=e=>{
          if(/[\t\r\n]/.test(e.clipboardData.getData('text').trim())){
            e.preventDefault();d.error=true;d.message='송장번호는 상자마다 한 칸씩 입력해 주세요.';render();
          }
        };
        input.oninput=()=>{
          const value=canonicalTracking(input.value);
          if(input.value!==value)input.value=value;
          if(index===0)d.tracking=value;else d.extraTrackings[index-1]=value;
          d.message='';
        };
        box.append(input);
        if(canShip){
          const button=el('button',index===0?'＋':'−');button.type='button';
          button.disabled=locked||(index===0 && d.extraTrackings.length+1>=${MAX_TRACKINGS_PER_DISPATCH});
          button.setAttribute('aria-label',index===0?'상자 송장 추가':(index+1)+'번 상자 송장 빼기');
          button.onclick=()=>{
            if(index===0)d.extraTrackings.push('');else d.extraTrackings.splice(index-1,1);
            d.message='';render();focusBox(o.id,index===0?d.extraTrackings.length:index-1);
          };
          box.append(button);
        }
        form.append(box);
      }
    }
    if(canShip && d.completion==='partial' && !hasHistory) {
      form.append(el('small','부분출고 알림톡을 사용 중이면 이번 저장 시 거래처에 한 번 안내합니다.','muted'));
    }
    const button=el('button',d.saving?'저장 중…':(d.legPending||d.pending)?'저장 결과 확인':d.completion==='partial'?'부분출고 저장':hasHistory||!parcel||d.extraTrackings.length?'출고 완료 저장':'송장 입력');
    button.type='submit';button.disabled=!!(d.saving||d.saved);form.append(button);
    form.onsubmit=e=>{
      e.preventDefault();
      if(d.legPending || (canShip && (d.completion==='partial'||hasHistory||!parcel||d.extraTrackings.length))) return saveLeg(o,d);
      return save(o,d);
    };
    panel.append(form);
  }
  if(d.message){const message=el('p',d.message,d.error?'error':'');message.setAttribute('role',d.error?'alert':'status');panel.append(message);}
  return panel;
}

async function saveLeg(o,d,close=false){
  if(d.saving||!secret)return;
  if(!d.legPending){
    const payload={requestKey:crypto.randomUUID(),revision:o.dispatch.revision};
    if(close)payload.action='close_partial';
    else{
      payload.method=d.method;payload.completion=d.completion;
      if(d.method==='parcel'){
        const numbers=[d.tracking,...d.extraTrackings].map(canonicalTracking);
        if(numbers.some(n=>!/^\d{8,30}$/.test(n)) || new Set(numbers).size!==numbers.length){
          d.error=true;d.message='상자마다 서로 다른 8~30자리 송장번호를 입력해 주세요.';render();return;
        }
        payload.carrier=d.carrier;payload.trackings=numbers;
      }
    }
    d.legPending=payload;
  }
  d.saving=true;d.error=false;d.message='저장 중…';render();
  try{
    const result=await api('/orders/'+o.id+'/consignments','POST',d.legPending);
    o.dispatch=result.dispatch;o.editable=false;
    drafts.delete(o.id);d.saved=true;
    await load();
    if(secret)feedback.textContent=o.storeName+(close?' 출고를 마감했습니다.':' 출고를 저장했습니다.');
  }catch(e){
    if(e.status&&e.status<500){d.legPending=null;d.message=e.message;if(e.status===409)await load();}
    else d.message='저장 결과를 확인할 수 없습니다. 같은 버튼으로 다시 확인하세요.';
    d.error=true;
  }finally{d.saving=false;render();}
}
`;
