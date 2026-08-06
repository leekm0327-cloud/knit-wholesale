import { KNIT_LOGO } from "@/lib/knitLogo";
import { beanRank } from "@/lib/quoteAppendix";
import type { QuoteView } from "@shared/schema";

function wonFmt(n: number): string {
  return n > 0 ? `₩${n.toLocaleString()}` : "협의";
}

// 숫자로만 이루어진 가격 문자열에 천단위 콤마를 넣는다. (예: "32000" → "32,000")
// "협의" 처럼 숫자가 아닌 값은 그대로 둔다.
function priceFmt(v: string): string {
  const t = (v || "").trim();
  if (!t) return "";
  const digits = t.replace(/,/g, "");
  if (/^\d+$/.test(digits)) return Number(digits).toLocaleString();
  return t;
}

// 견적서 문서 렌더 (관리자 미리보기 + 공개 뷰 공용). CÉLINE 무드 · 단색 미니멀.
export function QuoteDocument({ quote }: { quote: QuoteView }) {
  const cols = quote.usageHeaders.length || 1;
  const dateStr = (quote.issueDate || "").replace(/-/g, " . ");
  // 이름이 있고 정보가 하나라도 채워진 별첨 항목만 노출 (코튼>울>실크>디카페인 순)
  const appendixEntries = (quote.appendix || [])
    .filter((a) => a.name && (a.composition || a.flavor || a.roast || a.recipe))
    .slice()
    .sort((a, b) => beanRank(a.name) - beanRank(b.name));
  // 체크된 컨설팅 항목 + 합계
  const consultingItems = (quote.consulting || []).filter((c) => c.checked);
  const consultingTotal = consultingItems.reduce((s, c) => s + (Number(c.price) || 0), 0);
  return (
    <div className="qdoc print-area">
      <style>{QDOC_CSS}</style>
      <div className="qpage">
        <img className="qlogo" src={KNIT_LOGO} alt="knit COFFEE" />

        <div className="qmeta">
          <div className="qcol">
            <div className="qcap">견적자</div>
            <div><span className="qk">사업자등록번호</span> 714-21-01743</div>
            <div><span className="qk">회사명</span> 니트 커피(knit coffee)</div>
            <div><span className="qk">담당자</span> {quote.managerName || "—"}</div>
            <div><span className="qk">연락처</span> {quote.managerPhone || "—"}</div>
          </div>
          <div className="qcol qcolr">
            <div className="qcap">받는 분</div>
            <div><span className="qk">사업자등록번호</span> {quote.customerBizNo || "—"}</div>
            <div><span className="qk">회사명</span> {quote.customerName || "—"}</div>
            <div><span className="qk">담당자</span> {quote.customerManager || "—"}</div>
            <div><span className="qk">연락처</span> {quote.customerPhone || "—"}</div>
          </div>
        </div>

        <div className="qlabel">Quotation</div>

        <div className="qsec">Coffee Bean</div>

        <table className="qtable">
          <thead>
            <tr>
              <th className="qbean">원두</th>
              <th className="qlist">정가</th>
              {quote.usageHeaders.map((h, i) => (
                <th key={i}>{h || "—"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quote.beans.map((b, ri) => (
              <tr key={ri}>
                <td className="qbean">{b.name}</td>
                <td className="qp qlistc">{priceFmt(b.listPrice) || "—"}</td>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="qp">{priceFmt(b.prices[ci]) || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {quote.usageHeaders.length > 0 && (
          <div className="qhintline">정가 대비 월 사용량 구간별 제안가 · 모든 단가 VAT 별도</div>
        )}
        <div className="qsingle">
          Single Origin — 생두 시세에 따라 단가가 변동되어, 주문 시 별도 안내드립니다. 표기 단가 부가세 별도.
        </div>

        {consultingItems.length > 0 && (
          <>
            <div className="qspacer" />
            <div className="qconsult">
              <div className="qsec">Menu Consulting</div>
              <div className="qclist">
                {consultingItems.map((c, i) => (
                  <div className="qcrow" key={i}>
                    <div className="qcl">
                      <div className="qcname">{c.label}</div>
                      {c.desc ? <div className="qcdesc">{c.desc}</div> : null}
                    </div>
                    <div className="qcp qn">{wonFmt(Number(c.price) || 0)}</div>
                  </div>
                ))}
                <div className="qcrow qctotal">
                  <div className="qcl"><div className="qcname">컨설팅 합계 <span className="qvat">(VAT 별도)</span></div></div>
                  <div className="qcp qn">{wonFmt(consultingTotal)}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="qbottom">
          <div className="qdateline">{dateStr || "—"}</div>
          <div className="qfoot">
            본 견적의 유효기간은 발행일로부터 {quote.validDays}일입니다. 표기 단가는 부가세 별도이며 1kg 기준입니다.<br />
            니트커피 · 서울특별시 중구 소월로2길 30 남산트라팰리스 1층 107호 · 070-7717-0613
          </div>
        </div>
      </div>

      {appendixEntries.length > 0 && (
        <div className="qpage qpage2">
          <div className="qlabel">별첨 · 원두 정보</div>
          <div className="qapp">
            {appendixEntries.map((a, i) => (
              <div className="qai" key={i}>
                <div className="qainame">{a.name}</div>
                {a.composition ? <div className="qairow"><span className="qaik">블렌드 구성</span><span className="qaiv">{a.composition}</span></div> : null}
                {a.flavor ? <div className="qairow"><span className="qaik">향미 노트</span><span className="qaiv">{a.flavor}</span></div> : null}
                {a.roast ? <div className="qairow"><span className="qaik">로스팅 레벨</span><span className="qaiv">{a.roast}</span></div> : null}
                {a.recipe ? <div className="qairow"><span className="qaik">권장 레시피</span><span className="qaiv">{a.recipe}</span></div> : null}
              </div>
            ))}
          </div>
          <div className="qfoot">니트커피 · knit coffee · 070-7717-0613</div>
        </div>
      )}
    </div>
  );
}

const QDOC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap');
@import url('https://use.typekit.net/pdz1nxt.css');
/* 한글: Gowun Batang / 영어: Mendl Serif Dusk (Adobe Fonts) */
.qdoc{--ink:#181712;--soft:#6b6858;--hair:#cfc9b8;--faint:#8f8b7c;
  font-family:"mendl-serif-dusk","Gowun Batang",serif;
  color:var(--ink);font-weight:400;letter-spacing:.01em}
.qdoc .qpage{max-width:620px;margin:0 auto;background:#fefdfb;padding:52px 58px 40px;min-height:840px;
  display:flex;flex-direction:column;box-shadow:0 6px 30px rgba(0,0,0,.09);font-size:10.5px;line-height:1.7}
.qdoc .qlogo{display:block;margin:0 auto 42px;width:132px;height:auto}
.qdoc .qmeta{display:flex;justify-content:space-between;gap:24px;font-size:10px;line-height:2.05}
.qdoc .qcol{min-width:0}
/* 좌측(견적자)·우측(받는 분) 모두 라벨을 좌측 정렬로 통일 */
.qdoc .qcol{text-align:left}
.qdoc .qcap{font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.qdoc .qk{display:inline-block;width:90px;color:var(--soft)}
.qdoc .qright{text-align:right;color:var(--soft)}
.qdoc .qcust{margin-top:22px;font-size:12px;font-weight:500}
.qdoc .qto{color:var(--soft);font-weight:400}
.qdoc .qbottom{margin-top:34px}
.qdoc .qdateline{text-align:center;font-size:9.5px;letter-spacing:.08em;color:var(--soft);margin-bottom:10px}
.qdoc .qlabel{text-align:center;font-size:11px;font-weight:300;letter-spacing:.42em;text-transform:uppercase;margin:40px 0 16px}
.qdoc .qsec{text-align:center;font-size:9.5px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--soft);margin:0 0 14px}
.qdoc .qtable{width:100%;border-collapse:collapse}
.qdoc .qtable th,.qdoc .qtable td{padding:7px 4px;font-weight:300}
.qdoc .qtable thead th{font-size:9px;letter-spacing:.04em;color:var(--soft);text-align:right;
  border-bottom:1px solid var(--hair);padding-bottom:8px}
.qdoc .qtable thead th.qbean{text-align:left}
.qdoc .qtable tbody td{font-size:11px;color:var(--ink)}
.qdoc .qtable td.qbean{text-align:left;font-weight:500}
.qdoc .qtable td.qp{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
.qdoc .qtable th.qlist,.qdoc .qtable td.qlistc{color:var(--soft);font-weight:400}
.qdoc .qhintline{margin-top:7px;font-size:8.5px;letter-spacing:.02em;color:var(--faint);text-align:right}
.qdoc .qsingle{margin-top:14px;font-size:9.5px;color:var(--soft)}
.qdoc .qspacer{min-height:108px}
.qdoc .qh{font-size:10px;font-weight:500;margin-bottom:10px}
.qdoc .qn{font-variant-numeric:tabular-nums}
.qdoc .qconsult{padding-top:6px}
.qdoc .qempty{font-size:9.5px;color:var(--faint)}
.qdoc .qclist{border-top:1px solid var(--hair)}
.qdoc .qcrow{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:1px solid var(--hair);padding:10px 0}
.qdoc .qcname{font-size:10.5px;line-height:1.7}
.qdoc .qcdesc{font-size:8.5px;color:var(--soft);margin-top:4px;line-height:1.75;white-space:pre-line}
.qdoc .qcp{font-size:11px;white-space:nowrap}
.qdoc .qcrow.qctotal{border-bottom:none;border-top:1px solid var(--ink);margin-top:2px;padding-top:9px}
.qdoc .qcrow.qctotal .qcname{font-weight:600}
.qdoc .qcrow.qctotal .qcp{font-weight:600;font-size:12px}
.qdoc .qvat{color:var(--soft);font-weight:400;font-size:9px}
.qdoc .qvalid{margin-top:12px;font-size:9px;letter-spacing:.06em;color:var(--soft);text-align:right}
.qdoc .qsign{display:flex;justify-content:flex-end;margin-top:40px}
.qdoc .qbox{text-align:center;font-size:9px;letter-spacing:.1em;color:var(--soft)}
.qdoc .qline{width:150px;border-top:1px solid var(--hair);margin-bottom:5px}
.qdoc .qfoot{margin-top:26px;text-align:center;font-size:8px;letter-spacing:.06em;color:var(--soft);line-height:1.9}
.qdoc .qbottom .qfoot{margin-top:0;border-top:1px solid var(--hair);padding-top:12px}
/* 별첨 */
.qdoc .qpage2{margin-top:24px}
.qdoc .qapp{display:flex;flex-direction:column;gap:18px}
.qdoc .qai{border-top:1px solid var(--hair);padding-top:12px}
.qdoc .qainame{font-size:12px;font-weight:500;margin-bottom:7px}
.qdoc .qairow{display:flex;gap:12px;font-size:10px;padding:2px 0}
.qdoc .qaik{width:74px;flex-shrink:0;color:var(--soft)}
.qdoc .qaiv{color:var(--ink);flex:1}
@media print{
  /* 전역 .print-area(위치/가시성)와 @page A4(margin 14mm)를 그대로 사용 */
  .qdoc.print-area{position:absolute;left:0;top:0;width:100%}
  /* 본문 페이지를 A4 한 장 높이로 채우고(266mm<인쇄영역 269mm) 푸터는 아래에 고정 */
  .qdoc .qpage{box-shadow:none;margin:0;max-width:none;min-height:266mm;padding:0;width:100%;background:#fff;line-height:1.5;display:flex;flex-direction:column}
  .qdoc .qbottom{margin-top:auto}
  /* 본문(첫 페이지)이 A4 한 장에 들어오도록 세로 간격 압축 */
  .qdoc .qlogo{margin-bottom:14px;width:110px}
  .qdoc .qmeta{line-height:1.75}
  .qdoc .qcust{margin-top:10px}
  .qdoc .qlabel{margin:14px 0 8px}
  .qdoc .qtable th,.qdoc .qtable td{padding:5px 4px}
  .qdoc .qsingle{margin-top:8px}
  .qdoc .qspacer{flex:0 0 auto;min-height:56px}
  .qdoc .qconsult{padding-top:2px}
  .qdoc .qsec{margin-bottom:10px}
  .qdoc .qcrow{padding:7px 0}
  .qdoc .qcdesc{font-size:8px;line-height:1.6;margin-top:3px}
  .qdoc .qvalid{margin-top:6px}
  .qdoc .qdateline{margin-bottom:8px}
  .qdoc .qbottom .qfoot{padding-top:10px}
  /* 첫 페이지 본문은 쪼개지지 않게, 별첨은 다음 장부터 */
  .qdoc .qpage2{page-break-before:always;margin-top:0}
  /* 라이트 웨이트 보정 */
  .qdoc,.qdoc .qcname,.qdoc td,.qdoc .qmeta{font-weight:400}
}
`;
