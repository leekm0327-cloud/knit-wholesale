import { KNIT_LOGO } from "@/lib/knitLogo";
import { beanRank } from "@/lib/quoteAppendix";
import type { QuoteView } from "@shared/schema";

function wonFmt(n: number): string {
  return n > 0 ? `₩${n.toLocaleString()}` : "협의";
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
    <div className="qdoc">
      <style>{QDOC_CSS}</style>
      <div className="qpage">
        <img className="qlogo" src={KNIT_LOGO} alt="knit COFFEE" />

        <div className="qmeta">
          <div>
            <div><span className="qk">사업자등록번호</span> 714-21-01743</div>
            <div><span className="qk">회사명</span> 니트 커피(knit coffee)</div>
            <div><span className="qk">담당자</span> {quote.managerName || "—"}</div>
            <div><span className="qk">연락처</span> {quote.managerPhone || "—"}</div>
          </div>
          <div className="qright">{dateStr || "—"}</div>
        </div>

        <div className="qcust">{quote.customerName || "—"}</div>

        <div className="qlabel">Quotation</div>

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
                <td className="qp qlistc">{b.listPrice || "—"}</td>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="qp">{b.prices[ci] || "—"}</td>
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

        <div className="qspacer" />

        <div className="qconsult">
          <div className="qh">Menu Consulting</div>
          {consultingItems.length === 0 ? (
            <div className="qempty">—</div>
          ) : (
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
          )}
          <div className="qvalid">Valid · 발행일로부터 {quote.validDays}일</div>
        </div>

        <div className="qsign">
          <div className="qbox"><div className="qline" />Knit Coffee · Signature</div>
        </div>

        <div className="qfoot">
          본 견적의 유효기간은 발행일로부터 {quote.validDays}일입니다. 표기 단가는 부가세 별도이며 1kg 기준입니다.<br />
          니트커피 · 서울특별시 중구 소월로2길 30 남산트라팰리스 1층 107호 · 070-7717-0613
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
.qdoc{--ink:#20201e;--soft:#9a978f;--hair:#dcd9d1;--faint:#c3bfb5;
  font-family:"Helvetica Neue",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
  color:var(--ink);font-weight:300;letter-spacing:.02em}
.qdoc .qpage{max-width:620px;margin:0 auto;background:#fefdfb;padding:52px 58px 40px;min-height:840px;
  display:flex;flex-direction:column;box-shadow:0 6px 30px rgba(0,0,0,.09);font-size:10.5px;line-height:1.7}
.qdoc .qlogo{display:block;margin:0 auto 42px;width:132px;height:auto}
.qdoc .qmeta{display:flex;justify-content:space-between;font-size:10px;line-height:2.05}
.qdoc .qk{display:inline-block;width:90px;color:var(--soft)}
.qdoc .qright{text-align:right;color:var(--soft)}
.qdoc .qcust{margin-top:22px;font-size:11.5px}
.qdoc .qlabel{text-align:center;font-size:9.5px;letter-spacing:.42em;text-transform:uppercase;margin:40px 0 16px}
.qdoc .qtable{width:100%;border-collapse:collapse}
.qdoc .qtable th,.qdoc .qtable td{padding:7px 4px;font-weight:300}
.qdoc .qtable thead th{font-size:9px;letter-spacing:.04em;color:var(--soft);text-align:right;
  border-bottom:1px solid var(--hair);padding-bottom:8px}
.qdoc .qtable thead th.qbean{text-align:left}
.qdoc .qtable tbody td{font-size:10.5px}
.qdoc .qtable td.qbean{text-align:left}
.qdoc .qtable td.qp{text-align:right;font-variant-numeric:tabular-nums}
.qdoc .qtable th.qlist,.qdoc .qtable td.qlistc{color:var(--faint)}
.qdoc .qhintline{margin-top:7px;font-size:8.5px;letter-spacing:.02em;color:var(--faint);text-align:right}
.qdoc .qsingle{margin-top:14px;font-size:9.5px;color:var(--soft)}
.qdoc .qspacer{flex:1;min-height:40px}
.qdoc .qh{font-size:10px;font-weight:500;margin-bottom:10px}
.qdoc .qn{font-variant-numeric:tabular-nums}
.qdoc .qconsult{padding-top:6px}
.qdoc .qempty{font-size:9.5px;color:var(--faint)}
.qdoc .qclist{border-top:1px solid var(--hair)}
.qdoc .qcrow{display:flex;justify-content:space-between;align-items:baseline;gap:18px;border-bottom:1px solid var(--hair);padding:8px 0}
.qdoc .qcname{font-size:11px}
.qdoc .qcdesc{font-size:9px;color:var(--soft);margin-top:2px;line-height:1.6}
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
/* 별첨 */
.qdoc .qpage2{margin-top:24px}
.qdoc .qapp{display:flex;flex-direction:column;gap:18px}
.qdoc .qai{border-top:1px solid var(--hair);padding-top:12px}
.qdoc .qainame{font-size:12px;font-weight:500;margin-bottom:7px}
.qdoc .qairow{display:flex;gap:12px;font-size:10px;padding:2px 0}
.qdoc .qaik{width:74px;flex-shrink:0;color:var(--soft)}
.qdoc .qaiv{color:var(--ink);flex:1}
@media print{
  .qdoc .qpage{box-shadow:none;margin:0;max-width:none;min-height:auto;padding:16mm 18mm}
  .qdoc .qpage2{page-break-before:always;margin-top:0}
}
`;
