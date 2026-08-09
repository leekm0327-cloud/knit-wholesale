// 근무표에서 직원마다 고정 색을 갖게 하기 위한 팔레트.
// 니트커피 기준색 #647e5e (세이지 그린)에서 파생한 같은 계열 색들이며,
// id 순서가 아니라 값에 따라 안정적으로 배정된다.
// 색이 '사람'을 가리키므로, 옆칸과 헷갈리지 않을 만큼은 벌려 둔다.
// 다만 채도는 낮게 유지해 세이지 톤에서 벗어나지 않게 한다.
const PALETTE = [
  { bg: "#d3dfcd", fg: "#3a5a31" }, // 세이지
  { bg: "#d2dee2", fg: "#33525f" }, // 블루그레이
  { bg: "#e3e5d3", fg: "#5b5a2b" }, // 카키
  { bg: "#e8ddd6", fg: "#6e5040" }, // 토프
  { bg: "#cfe0d9", fg: "#29564a" }, // 청록
  { bg: "#dcd9e0", fg: "#4c4658" }, // 라벤더그레이
  { bg: "#c2cfc3", fg: "#2f4a30" }, // 짙은 세이지
  { bg: "#e6e2d7", fg: "#6a5c3e" }, // 모래
];

export function staffColor(staffId: number): { bg: string; fg: string } {
  if (!staffId) return { bg: "transparent", fg: "inherit" };
  return PALETTE[Math.abs(staffId) % PALETTE.length];
}
