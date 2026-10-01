import {inflateRawSync} from 'node:zlib';
import {XMLParser} from 'fast-xml-parser';
import crypto from 'node:crypto';

export const digest=(s:string|Buffer)=>crypto.createHash('sha256').update(s).digest('hex');
export type SourceLine={id:string;source:'chat'|'excel'|'site';date:string;customer:string;product:string;qty:number;
 amount?:number;unitPrice?:number;unit:string;reference:string;text:string;warnings:string[];excluded?:boolean;note?:string};
export function period(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('정산 월을 확인해 주세요.');
 const [y,m]=month.split('-').map(Number);if(y<2000||y>2100)throw new Error('정산 연도를 확인해 주세요.');
 return {from:new Date(Date.UTC(y,m-2,26)).toISOString().slice(0,10),to:month+'-25'};
}
export function customerName(s:string){
 const n=s.normalize('NFC').replace(/^\s*\d+\s*[-.)]\s*/,'').trim();
 if(/^니트커피(?:\s|\(|$)/.test(n))return '니트커피';
 const aliases:Record<string,string>={'대피':'카페대피','cccs_salon':'cccs','데일리 에스프레소':'데일리에스프레소'};
 return aliases[n]??n;
}
const knownProduct=(p:string)=>['코튼','실크','울','디카페인','몰케','게쉬','브루사','산타와니','브라질 게이샤'].includes(p);
export function productName(s:string){
 const n=s.normalize('NFC').trim();
 const aliases:[RegExp,string][]=[[/코튼|cotton/i,'코튼'],[/실크|silk/i,'실크'],[/^울(?:\s|$)|wool/i,'울'],[/디카|decaf/i,'디카페인'],[/산타와니|샨타와니|shantawane/i,'산타와니'],[/게쉬|geshe/i,'게쉬'],[/몰케|morke/i,'몰케'],[/브루사|부루사|burusa/i,'브루사'],[/브라질.*게이샤|brazil.*geisha/i,'브라질 게이샤']];
 return aliases.find(([re])=>re.test(n))?.[1]??n;
}
export function unitOf(name:string, knownKg=false){
 const m=name.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
 return m?`${m[1]}${m[2].toLowerCase()}`:knownKg?'1kg':'미확인';
}
function iso(v:unknown){
 if(typeof v==='number'&&v>20000&&v<80000)return new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000).toISOString().slice(0,10);
 const m=String(v??'').match(/(20\d{2})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/);
 const date=m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';
 return date&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:'';
}
export function csvRows(text:string){
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('카카오톡 CSV의 따옴표가 닫히지 않았습니다. 다시 내보내 주세요.');
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function parseChat(text:string){
 const raw=csvRows(text), lines:SourceLine[]=[],issues:{date:string;reference:string;text:string}[]=[];
 if(raw.length>50000)throw new Error('대화가 너무 많습니다. 기간을 나눠 올려 주세요.');
 let lastDate='';
 raw.forEach((r,index)=>{
  if(r.length!==3)return;
  const date=iso(r[0]);if(date)lastDate=date;
  const body=r[2], ref=`카톡 ${r[0]||lastDate} · ${r[1]} · ${index+1}행`;
  if(!date){if(body.includes('삭제'))issues.push({date:lastDate,reference:ref,text:'삭제된 메시지: 원문 확인 필요'});return;}
  const marker=body.match(/-\s*품목\s*:/);
  if(marker){
   const name=customerName(body.trim().split('\n')[0]);
   const list=body.slice(body.indexOf(marker[0])+marker[0].length);
   let count=0;
   list.split(/\r?\n/).forEach((line,n)=>{
    const m=line.trim().match(/^(?:\d+[.)]\s*)?(.+?)\s*[*×]\s*(-?\d+(?:\.\d+)?)\s*(?:kg|개)?\s*$/i);
    if(!m)return;
    const product=productName(m[1]);const unit=unitOf(m[1],['코튼','실크','울','디카페인','몰케','게쉬','브루사','산타와니','브라질 게이샤'].includes(product));
    if(/테이프|봉투|박스/.test(product))return;
    const warnings:string[]=[];
    if(/수정|추가해서|다시 드|다시드|변경/.test(body))warnings.push('수정본: 이전 발주 대체 여부 확인');
    if(/취소|미출고/.test(body))warnings.push('취소·미출고 확인');
    if(unit==='미확인')warnings.push('포장 단위 확인');
    else if(!/(\d+(?:\.\d+)?)\s*(kg|g)\b/i.test(m[1]))warnings.push('단위 표기 없음: 1kg 기준인지 확인');
    lines.push({id:'chat-'+digest(JSON.stringify([r,n,index])),source:'chat',date,customer:name,product,qty:Number(m[2]),unit,reference:ref,text:body,warnings});count++;
   });
   if(!count)issues.push({date,reference:ref,text:body});
  }else if(/추가|수정|취소|미출고|오지않|나눠|분할|킬로|kg|환불|파손|사진|대체/.test(body)){
   issues.push({date,reference:ref,text:body});
  }
 });
 const refs=new Map<string,Set<string>>();
 for(const l of lines){const no=l.text.match(/\[발주번호 ([^\]]+)\]/)?.[1];if(no){const set=refs.get(no)||new Set<string>();set.add(l.reference);refs.set(no,set);}}
 for(const l of lines){const no=l.text.match(/\[발주번호 ([^\]]+)\]/)?.[1];if(no&&(refs.get(no)?.size??0)>1)l.warnings.push(`같은 발주번호 ${no} 반복: 마지막 수정본 확인`);}
 return {lines,issues};
}

// Read only cached cell values. Ignore styles, macros, links and formulas; never execute workbook content.
function zipEntries(bytes:Buffer){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('올바른 XLSX 파일이 아닙니다.');
 const count=bytes.readUInt16LE(end+10),entries=new Map<string,Buffer>();let pos=bytes.readUInt32LE(end+16),total=0;
 if(count>2000)throw new Error('엑셀 내부 파일이 너무 많습니다.');
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw new Error('엑셀 파일이 손상됐습니다.');
  const method=bytes.readUInt16LE(pos+10),size=bytes.readUInt32LE(pos+20),unpacked=bytes.readUInt32LE(pos+24);
  const nl=bytes.readUInt16LE(pos+28),el=bytes.readUInt16LE(pos+30),cl=bytes.readUInt16LE(pos+32),off=bytes.readUInt32LE(pos+42);
  const name=bytes.subarray(pos+46,pos+46+nl).toString();pos+=46+nl+el+cl;
  if(!/^xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/sheet\d+.xml)$/.test(name))continue;
  total+=unpacked;if(unpacked>16*1024*1024||total>40*1024*1024)throw new Error('엑셀 내용이 너무 큽니다.');
  if(off+30>bytes.length||bytes.readUInt32LE(off)!==0x04034b50)throw new Error('엑셀 압축 정보가 잘못됐습니다.');
  const start=off+30+bytes.readUInt16LE(off+26)+bytes.readUInt16LE(off+28);if(start+size>bytes.length)throw new Error('엑셀 파일이 잘렸습니다.');
  if(method!==0&&method!==8)throw new Error('지원하지 않는 엑셀 압축 방식입니다.');
  const data=method===0?bytes.subarray(start,start+size):inflateRawSync(bytes.subarray(start,start+size),{maxOutputLength:16*1024*1024});
  if(data.length!==unpacked)throw new Error('엑셀 파일 크기가 맞지 않습니다.');entries.set(name,data);
 }return entries;
}
const arr=(v:any)=>v==null?[]:Array.isArray(v)?v:[v];
const str=(v:any):string=>typeof v==='object'?String(v?.['#text']??''):String(v??'');
export function readWorkbook(bytes:Buffer, names?:string[]){
 const entries=zipEntries(bytes),parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false});
 const xml=(key:string)=>{const text=entries.get(key)?.toString('utf8');if(!text)return {};if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('외부 참조가 있는 엑셀은 읽을 수 없습니다.');return parser.parse(text);};
 const wb=xml('xl/workbook.xml').workbook;if(!wb)throw new Error('엑셀 통합문서를 찾지 못했습니다.');
 if(['1','true'].includes(wb.workbookPr?.['@_date1904']))throw new Error('1904 날짜 형식은 지원하지 않습니다. 일반 날짜 형식으로 저장해 주세요.');
 const rich=(o:any)=>o?.t!=null?str(o.t):arr(o?.r).map(r=>str(r.t)).join('');
 const strings=arr(xml('xl/sharedStrings.xml').sst?.si).map(rich);
 const rels=arr(xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship);
 return arr(wb.sheets?.sheet).filter(s=>!names||names.includes(String(s['@_name']))).map(s=>{
  const target=rels.find(r=>r['@_Id']===(s['@_r:id']??s['@_id']))?.['@_Target']??'';
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const rows:any[][]=[];
  for(const r of arr(xml(path).worksheet?.sheetData?.row)){
   const cells=arr(r.c).filter(c=>c.v!=null||c.is!=null);if(!cells.length)continue;
   const index=Number(r['@_r'])-1;if(!Number.isInteger(index)||index<0||index>30000)throw new Error('엑셀 행 수가 너무 많습니다.');const row:any[]=[];
   for(const c of cells){
    const letters=String(c['@_r']).match(/^[A-Z]+/)?.[0]??'';let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;
    if(col<1||col>200)continue;
    row[col-1]=c['@_t']==='s'?strings[Number(c.v)]:c['@_t']==='inlineStr'?rich(c.is):c.v==null?'':c['@_t']==='str'?str(c.v):Number.isFinite(Number(c.v))?Number(c.v):str(c.v);
   }rows[index]=row;
  }return {name:String(s['@_name']),rows};
 });
}
export function parseSettlement(bytes:Buffer){
 const sheets=readWorkbook(bytes,['원장','(1)정산서']),sheet=sheets.find(s=>s.name==='원장');
 if(!sheet)throw new Error('‘원장’ 시트가 필요합니다. 날짜·업체명·제품명·제품수량 열이 있는 클라리멘토 양식을 올려 주세요.');
 const head=sheet.rows[0]?.map(String)??[];
 if(!['날짜','업체명','제품명','제품수량'].every((v,i)=>head[i]===v))throw new Error('원장 열 구성이 달라졌습니다. 파일을 확인해 주세요.');
 let date='',customer='';const lines:SourceLine[]=[],issues:{date:string;reference:string;text:string}[]=[];
 sheet.rows.forEach((r,i)=>{
  if(i===0||!r)return;if(r[0])date=iso(r[0]);if(r[1])customer=customerName(String(r[1]));
  if(!r[2]&&!r[3])return;const qty=Number(r[3]);
  if(!date||!customer||!Number.isFinite(qty)||r[3]==null||r[3]===''||!r[2]){issues.push({date,reference:`원장 ${i+1}행`,text:'날짜·업체·품목·수량을 읽지 못했습니다.'});return;}
  const product=productName(String(r[2])),warnings:string[]=[];
  if(!knownProduct(product))warnings.push('정산표 품목 확인');
  if(!r[1])warnings.push('업체명 빈칸: 위 업체명으로 연결, 소속 확인');
  lines.push({id:'excel-'+digest(JSON.stringify([date,customer,product,qty,i])),source:'excel',date,customer,product,qty,unit:'1kg',reference:`원장!A${i+1}:D${i+1}`,text:JSON.stringify(r),warnings});
 });
 const summary=sheets.find(s=>s.name==='(1)정산서'),prices:Record<string,number>={};
 for(const r of summary?.rows??[]){if(!r)continue;const n=String(r[1]??r[2]??'');const p=productName(n);if(Number(r[6])>0&&knownProduct(p))prices[p]=Number(r[6]);}
 for(const l of lines)if(prices[l.product]!=null){l.unitPrice=prices[l.product];l.amount=l.qty*l.unitPrice;}
 const billed=summary?.rows[25];
 return {lines,issues,prices,supplyAmount:Number(billed?.[7])||null,vat:Number(billed?.[8])||null};
}
