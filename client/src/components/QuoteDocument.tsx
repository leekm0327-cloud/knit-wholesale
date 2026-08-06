import { KNIT_LOGO } from "@/lib/knitLogo";
import type { QuoteView } from "@shared/schema";

// 견적서 문서 렌더 (관리자 미리보기 + 공개 뷰 공용). CÉLINE 무드 · 단색 미니멀.
export function QuoteDocument({ quote }: { quote: QuoteView }) {
  const cols = quote.usageHeaders.length || 1;
  const dateStr = (quote.issueDate || "").replace(/-/g, " . ");
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
              {quote.usageHeaders.map((h, i) => (
                <th key={i}>{h || "—"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quote.beans.map((b, ri) => (
              <tr key={ri}>
                <td className="qbean">{b.name}</td>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="qp">{b.prices[ci] || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="qsingle">
          Single Origin — 생두 시세에 따라 단가가 변동되어, 주문 시 별도 안내드립니다. 표기 단가 부가세 별도.
        </div>

        <div className="qspacer" />

        <div className="qbottom">
          <div className="qbl">
            <div className="qh">Menu Consulting</div>
            {quote.consulting.length === 0 ? (
              <div className="qempty">—</div>
            ) : (
              <ul className="qcout">
                {quote.consulting.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="qbr">
            <div className="qrowt"><span>Valid</span><span className="qn">발행일 +{quote.validDays}일</span></div>
            <div className="qrowt qtotal"><span>컨설팅 비용</span><span className="qn">{quote.consultingFee || "—"}</span></div>
          </div>
        </div>

        <div className="qsign">
          <div className="qbox"><div className="qline" />Knit Coffee · Signature</div>
        </div>

        <div className="qfoot">
          본 견적의 유효기간은 발행일로부터 {quote.validDays}일입니다. 표기 단가는 부가세 별도이며 1kg 기준입니다.<br />
          니트커피 · 서울특별시 중구 소월로2길 30 남산트라팰리스 1층 107호 · 070-7717-0613
        </div>
      </div>
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
.qdoc .qsingle{margin-top:16px;font-size:9.5px;color:var(--soft)}
.qdoc .qspacer{flex:1;min-height:56px}
.qdoc .qbottom{display:flex;justify-content:space-between;align-items:flex-start;gap:30px;padding-top:6px}
.qdoc .qbl{max-width:320px}
.qdoc .qh{font-size:10px;font-weight:500;margin-bottom:8px}
.qdoc .qcout{margin:0;padding:0}
.qdoc .qcout li{list-style:none;font-size:10px;padding:2px 0}
.qdoc .qempty{font-size:9.5px;color:var(--faint)}
.qdoc .qbr{text-align:right;min-width:160px}
.qdoc .qrowt{display:flex;justify-content:space-between;gap:24px;font-size:10px;color:var(--soft);padding:3px 0}
.qdoc .qrowt.qtotal{color:var(--ink);font-weight:500;border-top:1px solid var(--hair);margin-top:6px;padding-top:8px}
.qdoc .qn{font-variant-numeric:tabular-nums}
.qdoc .qsign{display:flex;justify-content:flex-end;margin-top:40px}
.qdoc .qbox{text-align:center;font-size:9px;letter-spacing:.1em;color:var(--soft)}
.qdoc .qline{width:150px;border-top:1px solid var(--hair);margin-bottom:5px}
.qdoc .qfoot{margin-top:26px;text-align:center;font-size:8px;letter-spacing:.06em;color:var(--soft);line-height:1.9}
@media print{
  .qdoc .qpage{box-shadow:none;margin:0;max-width:none;min-height:auto;padding:16mm 18mm}
}
`;
