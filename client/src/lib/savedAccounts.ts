// #3 멀티 계정 빠른 전환
// 한 사장님이 여러 지점(여러 상호명 계정)을 운영하는 경우, 매번 로그아웃/로그인하지
// 않고 저장된 계정 간 빠르게 전환할 수 있도록 로그인 정보를 이 기기(브라우저)의
// localStorage에 저장한다.
//
// 주의: 편의를 위해 비밀번호를 로컬에 보관한다. 본인 소유 기기 사용을 전제로 하며,
// 공용 PC에서는 사용을 권장하지 않는다. (사장님이 명시적으로 요청한 기능)

export interface SavedAccount {
  businessName: string;
  password: string;
  managerName?: string; // 표시용 (있으면 함께 노출)
  savedAt: number;
}

const STORAGE_KEY = "knit_saved_accounts_v1";

// 저장된 계정 목록 읽기
export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a) => a && typeof a.businessName === "string" && typeof a.password === "string",
    );
  } catch {
    return [];
  }
}

function persist(accounts: SavedAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* localStorage 사용 불가 환경 무시 */
  }
}

// 계정 저장(추가 또는 갱신). 같은 상호명이면 최신 정보로 덮어씀.
export function saveAccount(account: {
  businessName: string;
  password: string;
  managerName?: string;
}) {
  const accounts = getSavedAccounts();
  const idx = accounts.findIndex((a) => a.businessName === account.businessName);
  const entry: SavedAccount = {
    businessName: account.businessName,
    password: account.password,
    managerName: account.managerName,
    savedAt: Date.now(),
  };
  if (idx >= 0) {
    accounts[idx] = entry;
  } else {
    accounts.push(entry);
  }
  persist(accounts);
}

// 계정 제거
export function removeAccount(businessName: string) {
  const accounts = getSavedAccounts().filter((a) => a.businessName !== businessName);
  persist(accounts);
}

// 전체 삭제 (예: 완전 로그아웃 시 사용 가능)
export function clearSavedAccounts() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
