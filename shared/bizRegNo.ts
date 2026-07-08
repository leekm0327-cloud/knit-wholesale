// ===== 사업자등록번호 검증 (국세청 체크섬 알고리즘) =====
// 프론트엔드·백엔드 공용 유틸. 10자리 숫자, 가중치 [1,3,7,1,3,7,1,3,5],
// 9번째 자리는 가중치(5)를 곱한 값의 십의 자리를 더해주는 특수처리를 한다.

// 하이픈·공백 등을 제거하고 숫자만 남긴다.
export function normalizeBizRegNo(raw: string): string {
  return (raw ?? "").replace(/[^0-9]/g, "");
}

// 사업자등록번호 유효성(형식 + 체크섬) 검증. 유효하면 true.
export function isValidBizRegNo(raw: string): boolean {
  const digits = normalizeBizRegNo(raw);
  if (digits.length !== 10) return false;

  const nums = digits.split("").map((d) => Number(d));
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += nums[i] * weights[i];
  }
  // 9번째 자리(index 8)에 가중치 5를 곱한 값의 십의 자리를 추가로 더한다.
  sum += Math.floor((nums[8] * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === nums[9];
}
