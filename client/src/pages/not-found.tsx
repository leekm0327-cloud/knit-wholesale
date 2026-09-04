import { useLocation } from "wouter";

/** 없는 주소로 들어왔을 때. 직원·거래처·관리자 모두 이 화면을 본다. */
export default function NotFound() {
  const [location, navigate] = useLocation();
  const home = location.startsWith("/staff") ? "/staff" : location.startsWith("/admin") ? "/admin" : "/";
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6" style={{ background: "#f4f3ef" }}>
      <div className="w-full max-w-sm rounded-[18px] bg-white px-6 py-8 text-center shadow-sm">
        <div className="text-[13px] font-medium tracking-wide" style={{ color: "#9a998f" }}>
          404
        </div>
        <h1 className="mt-1 text-[18px] font-semibold break-keep" style={{ color: "#1e1e1c" }}>
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed break-keep" style={{ color: "#6d6c67" }}>
          주소가 잘못되었거나 없어진 페이지입니다.
        </p>
        <button
          onClick={() => navigate(home)}
          className="mt-5 w-full rounded-full py-3 text-[14px] font-medium text-white"
          style={{ background: "#1e1e1c" }}
          data-testid="button-notfound-home"
        >
          처음 화면으로
        </button>
      </div>
    </div>
  );
}
