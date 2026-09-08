// Selection shortcuts from ordering chat, June–September 2026. No stock, price or vendor guarantees.
export const supplyCategories = ["전체", "우유·크림", "제과 재료", "시럽·베이스", "차·음료", "토핑·생지"] as const;
export type SupplyCatalogItem = { id:string; name:string; category:string; aliases:string; unit:string };
export const supplyCatalog: SupplyCatalogItem[] = [
  {
    "id": "매일우유 오리지널",
    "name": "매일우유 오리지널",
    "category": "우유·크림",
    "aliases": "",
    "unit": "박스"
  },
  {
    "id": "생크림",
    "name": "생크림",
    "category": "우유·크림",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "휘핑크림",
    "name": "휘핑크림",
    "category": "우유·크림",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "연유",
    "name": "연유",
    "category": "우유·크림",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "오트사이드",
    "name": "오트사이드",
    "category": "우유·크림",
    "aliases": "오트 오트밀크",
    "unit": "개"
  },
  {
    "id": "난백액",
    "name": "난백액",
    "category": "제과 재료",
    "aliases": "난백 흰자 조인 아이엠에그",
    "unit": "개"
  },
  {
    "id": "난황액",
    "name": "난황액",
    "category": "제과 재료",
    "aliases": "난황 노른자 조인 아이엠에그",
    "unit": "개"
  },
  {
    "id": "버터",
    "name": "버터",
    "category": "제과 재료",
    "aliases": "레스큐어 롤버터 발효버터",
    "unit": "개"
  },
  {
    "id": "박력분",
    "name": "박력분",
    "category": "제과 재료",
    "aliases": "밀가루",
    "unit": "개"
  },
  {
    "id": "아몬드가루",
    "name": "아몬드가루",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "백설탕",
    "name": "백설탕",
    "category": "제과 재료",
    "aliases": "설탕 하얀설탕",
    "unit": "개"
  },
  {
    "id": "흑설탕",
    "name": "흑설탕",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "머스코바도",
    "name": "머스코바도",
    "category": "제과 재료",
    "aliases": "마스코바도",
    "unit": "개"
  },
  {
    "id": "소금",
    "name": "소금",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "베이킹파우더",
    "name": "베이킹파우더",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "다크 커버춰",
    "name": "다크 커버춰",
    "category": "제과 재료",
    "aliases": "초콜릿 커버추어",
    "unit": "개"
  },
  {
    "id": "코팅 다크 초콜릿",
    "name": "코팅 다크 초콜릿",
    "category": "제과 재료",
    "aliases": "카카오베리 브룬 빠떼아글라세",
    "unit": "개"
  },
  {
    "id": "바닐라빈",
    "name": "바닐라빈",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "바닐라 익스트랙",
    "name": "바닐라 익스트랙",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "바닐라 에센스",
    "name": "바닐라 에센스",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "시나몬 파우더",
    "name": "시나몬 파우더",
    "category": "제과 재료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "바닐라시럽",
    "name": "바닐라시럽",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "병"
  },
  {
    "id": "설탕시럽",
    "name": "설탕시럽",
    "category": "시럽·베이스",
    "aliases": "슈가시럽",
    "unit": "병"
  },
  {
    "id": "아몬드시럽",
    "name": "아몬드시럽",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "병"
  },
  {
    "id": "토피넛시럽",
    "name": "토피넛시럽",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "병"
  },
  {
    "id": "아가베시럽",
    "name": "아가베시럽",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "병"
  },
  {
    "id": "꿀",
    "name": "꿀",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "기라델리 초콜릿 소스",
    "name": "기라델리 초콜릿 소스",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "통"
  },
  {
    "id": "레몬베이스",
    "name": "레몬베이스",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "통"
  },
  {
    "id": "쌀베이스",
    "name": "쌀베이스",
    "category": "시럽·베이스",
    "aliases": "쌀베",
    "unit": "통"
  },
  {
    "id": "리치베이스",
    "name": "리치베이스",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "과육 꾹꾹 복숭아청",
    "name": "과육 꾹꾹 복숭아청",
    "category": "시럽·베이스",
    "aliases": "피치 꾹꾹이",
    "unit": "팩"
  },
  {
    "id": "피치베이스",
    "name": "피치베이스",
    "category": "시럽·베이스",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "탄산수",
    "name": "탄산수",
    "category": "차·음료",
    "aliases": "",
    "unit": "박스"
  },
  {
    "id": "말차 파우더",
    "name": "말차 파우더",
    "category": "차·음료",
    "aliases": "그린티",
    "unit": "개"
  },
  {
    "id": "화이트 템플 티백",
    "name": "화이트 템플 티백",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "화이트 템플 잎차",
    "name": "화이트 템플 잎차",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "쿨허벌 티백",
    "name": "쿨허벌 티백",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "쿨허벌 잎차",
    "name": "쿨허벌 잎차",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "뉴욕 브렉퍼스트 티백",
    "name": "뉴욕 브렉퍼스트 티백",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "뉴욕 브렉퍼스트 잎차",
    "name": "뉴욕 브렉퍼스트 잎차",
    "category": "차·음료",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "피칸",
    "name": "피칸",
    "category": "토핑·생지",
    "aliases": "다맘 반태",
    "unit": "개"
  },
  {
    "id": "소보루 크런치",
    "name": "소보루 크런치",
    "category": "토핑·생지",
    "aliases": "소보로 크럼블",
    "unit": "개"
  },
  {
    "id": "사과조림",
    "name": "사과조림",
    "category": "토핑·생지",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "캔옥수수",
    "name": "캔옥수수",
    "category": "토핑·생지",
    "aliases": "스위트콘 콘옥수수 통조림 옥수수캔",
    "unit": "캔"
  },
  {
    "id": "냉동 옥수수 슬라이스",
    "name": "냉동 옥수수 슬라이스",
    "category": "토핑·생지",
    "aliases": "",
    "unit": "팩"
  },
  {
    "id": "에그타르트쉘",
    "name": "에그타르트쉘",
    "category": "토핑·생지",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "플라워타르트쉘 30g",
    "name": "플라워타르트쉘 30g",
    "category": "토핑·생지",
    "aliases": "",
    "unit": "개"
  },
  {
    "id": "플라워타르트쉘 40g",
    "name": "플라워타르트쉘 40g",
    "category": "토핑·생지",
    "aliases": "",
    "unit": "개"
  }
];
export const supplyUnits = ['개','박스','팩','봉','병','통','캔','kg','g','L'];
export type SupplySelection = { id: string; quantity: string; unit: string };
export function selectedSupplyText(selection: SupplySelection[]): string {
 return selection.map(row=>{
  const item=supplyCatalog.find(i=>i.id===row.id);
  if(!item || !/^\d+(?:\.\d{1,3})?$/.test(row.quantity)||Number(row.quantity)<=0||Number(row.quantity)>100000||!supplyUnits.includes(row.unit)) throw new Error('수량은 0보다 큰 숫자로 입력해 주세요. 소수점 셋째 자리까지 쓸 수 있어요.');
  return `${item.name} ${Number(row.quantity)}${row.unit}`;
 }).join('\n');
}
export function appendSupplyText(body:string,selection:SupplySelection[]):string {
 const text=selectedSupplyText(selection);
 const result=[body.trimEnd(),text].filter(Boolean).join('\n');
 if(result.length>2000)throw new Error('품목 내용이 너무 길어요. 기록을 나누어 저장해 주세요.');
 return result;
}
