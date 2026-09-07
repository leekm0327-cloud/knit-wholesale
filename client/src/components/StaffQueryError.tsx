export default function StaffQueryError({ retry }: { retry: () => unknown }) {
  return (
    <div className="s-card mt-3" role="alert">
      <p className="text-[14px] font-medium">정보를 불러오지 못했습니다.</p>
      <p className="mt-1 text-[12px]" style={{ color: "var(--s-muted)" }}>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <button type="button" className="s-pill line mt-3" onClick={() => retry()}>다시 시도</button>
    </div>
  );
}
