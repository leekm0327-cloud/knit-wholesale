// 근무표에서 직원마다 고정 색을 갖게 하기 위한 팔레트.
// Numbers 근무표와 비슷한 파스텔 톤이며, id 순서가 아니라 값에 따라 안정적으로 배정된다.
const PALETTE = [
  { bg: "#e8e3d9", fg: "#3f3a30" }, // 베이지
  { bg: "#f8c9d8", fg: "#7a2f47" }, // 핑크
  { bg: "#f7d9a0", fg: "#7a5310" }, // 살구
  { bg: "#f3c5c0", fg: "#7d3a33" }, // 연한 코랄
  { bg: "#c2d4e8", fg: "#2f4a66" }, // 블루
  { bg: "#cfe3cd", fg: "#365239" }, // 그린
  { bg: "#e0d3ec", fg: "#4c3a63" }, // 라벤더
  { bg: "#dfe0e2", fg: "#3b3d40" }, // 그레이
];

export function staffColor(staffId: number): { bg: string; fg: string } {
  if (!staffId) return { bg: "transparent", fg: "inherit" };
  return PALETTE[Math.abs(staffId) % PALETTE.length];
}
