// Inserted into the standalone link page's CSP-hashed script.
export const dispatchView = String.raw`
const methods={parcel:'택배',quick:'퀵',direct:'직접배송'};
const carriers={CJ:'CJ대한통운',HANJIN:'한진택배',LOTTE:'롯데택배',POST:'우체국택배',LOGEN:'로젠택배'};

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
      const li=el('li');
      li.append(el('b',(i+1)+'차 · '+(methods[entry.method]||entry.method)+(entry.tracking?' · '+(carriers[entry.carrier]||entry.carrier)+' '+entry.tracking:'')));

      const time=el('time',new Date(entry.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));
      time.dateTime=new Date(entry.createdAt).toISOString();li.append(document.createTextNode(' · '),time);
      history.append(li);
    }
    panel.append(history);
  } else if(!canEditParcel && o.tracking && o.status!=='cancelled') {
    panel.append(el('p',(carriers[o.carrier]||o.carrier)+' '+o.tracking));
  }
  const locked=!!(d.saving||d.pending||d.legPending||d.saved);
  if (canShip || canEditParcel || d.legPending) {
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
      const input=el('input');input.value=d.tracking;input.inputMode='numeric';input.pattern='[0-9]{8,30}';input.required=true;
      input.placeholder='송장번호 8~30자리'; input.autocomplete='off';input.disabled=locked;input.dataset.focus=o.id+'-tracking';input.setAttribute('aria-label',o.storeName+' 송장번호');
      input.oninput=()=>{d.tracking=input.value;d.message='';};form.append(input);
    }
    const button=el('button',d.saving?'저장 중…':(d.legPending||d.pending)?'저장 결과 확인':d.completion==='partial'?'부분출고 저장':hasHistory||!parcel?'출고 완료 저장':'송장 입력');
    button.type='submit';button.disabled=!!(d.saving||d.saved);form.append(button);
    form.onsubmit=e=>{
      e.preventDefault();
      if(d.legPending || (canShip && (d.completion==='partial'||hasHistory||!parcel))) return saveLeg(o,d);
      return save(o,d);
    };
    panel.append(form);
  }
  if(d.message){const message=el('p',d.message,d.error?'error':'');message.setAttribute('role',d.error?'alert':'status');panel.append(message);}
  return panel;
}

async function saveLeg(o,d){
  if(d.saving||!secret)return;
  if(!d.legPending){
    const payload={requestKey:crypto.randomUUID(),revision:o.dispatch.revision,method:d.method,completion:d.completion};
    if(d.method==='parcel'){payload.carrier=d.carrier;payload.tracking=d.tracking.trim();}
    d.legPending=payload;
  }
  d.saving=true;d.error=false;d.message='저장 중…';render();
  try{
    const result=await api('/orders/'+o.id+'/consignments','POST',d.legPending);
    o.dispatch=result.dispatch;o.editable=false;
    drafts.delete(o.id);d.saved=true;
    await load();
    if(secret)feedback.textContent=o.storeName+' 출고를 저장했습니다.';
  }catch(e){
    if(e.status){d.legPending=null;d.message=e.message; if(e.status===409)await load();}
    else d.message='저장 결과를 확인할 수 없습니다. 같은 버튼으로 다시 확인하세요.';
    d.error=true;
  }finally{d.saving=false;render();}
}
`;
