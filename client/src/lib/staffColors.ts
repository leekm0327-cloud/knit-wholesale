// 근무표에서 직원마다 고정 색을 갖게 하기 위한 팔레트.
// 니트커피 기준색 #647e5e (세이지 그린)에서 파생한 같은 계열 색들이며,
// id 순서가 아니라 값에 따라 안정적으로 배정된다.
const PALETTE = [
  { bg: "#d1dece", fg: "#34592c" }, // 세이지
  { bg: "#d6e1d9", fg: "#2e563c" }, // 초록
  { bg: "#dce2d0", fg: "#4b5b29" }, // 올리브
  { bg: "#c3cdc1", fg: "#385232" }, // 짙은 세이지
  { bg: "#d3dedb", fg: "#30554c" }, // 청록
  { bg: "#e4edde", fg: "#3d5f25" }, // 연둣빛
  { bg: "#b3c6b5", fg: "#305533" }, // 진한 초록
  { bg: "#e4e4d8", fg: "#58582d" }, // 카키
];

export function staffColor(staffId: number): { bg: string; fg: string } {
  if (!staffId) return { bg: "transparent", fg: "inherit" };
  return PALETTE[Math.abs(staffId) % PALETTE.length];
}
