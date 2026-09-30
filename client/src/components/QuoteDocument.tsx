import { beanEnglishName, beanRank, compositionRows } from "@/lib/quoteAppendix";
import type { QuoteView } from "@shared/schema";
import lettering from "./quoteLettering.json";
import "./QuoteDocument.css";

// Fixed Ellery lettering is vector artwork, not a redistributed desktop font.
function Lettering({ text }: { text: keyof typeof lettering }) {
  const art = lettering[text];
  return <svg className="q-ellery" role="img" aria-label={text} viewBox={art.viewBox}
    style={{ width: `${art.width}em`, height: `${art.height}em` }}>
    <path fill="currentColor" d={art.path} />
  </svg>;
}
function EnglishName({ name }: { name: string }) {
  const english = beanEnglishName(name);
  return english ? <span className="q-bean-en"><Lettering text={english as keyof typeof lettering} /></span> : null;
}
function priceFmt(value: string): string {
  const text = (value || "").trim();
  if (!text) return "—";
  const digits = text.replace(/,/g, "");
  return /^\d+$/.test(digits) ? Number(digits).toLocaleString("ko-KR") : text;
}
function wonFmt(value: number): string {
  return value > 0 ? `₩${value.toLocaleString("ko-KR")}` : "협의";
}
function Header({ guide = false, date = "", consulting = false }) {
  return <header className="q-header">
    <img className="q-logo" src="/knit-logo-stacked.svg" alt="knit COFFEE" width="80" height="61" />
    <div className="q-heading">
      <h1><Lettering text={guide ? "Coffee Guide" : "Quotation"} /></h1>
      <p>{guide ? "별첨 · 원두 안내" : consulting ? "별첨 · 메뉴 컨설팅" : "원두 공급 견적서"}</p>
      {date && <p className="q-date">{date.replace(/-/g, ". ")}</p>}
    </div>
  </header>;
}
function Footer({ quote, validity = false }: { quote: QuoteView; validity?: boolean }) {
  return <footer className="q-footer">
    {validity && <p className="q-validity">본 견적은 <strong>발행일로부터 {quote.validDays}일간 유효</strong>합니다.</p>}
    <p className="q-contact">니트커피 · 070-7717-0613</p>
    <p className="q-address">서울특별시 중구 소월로2길 30 남산트라팰리스 1층 107호</p>
  </footer>;
}

// Shared by the admin preview and the customer's public quote; all commercial data remains dynamic.
export function QuoteDocument({ quote }: { quote: QuoteView }) {
  const headers = quote.usageHeaders.length ? quote.usageHeaders : ["공급가"];
  const appendix = (quote.appendix || []).filter(a => a.name && (a.composition || a.flavor || a.roast || a.description || a.origin))
    .slice().sort((a, b) => beanRank(a.name) - beanRank(b.name));
  const guidePages = Array.from({ length: Math.ceil(appendix.length / 4) }, (_, i) => appendix.slice(i * 4, i * 4 + 4));
  const consulting = (quote.consulting || []).filter(c => c.checked);
  const total = consulting.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
  return <div className="qdoc print-area">
    <style>{`@media print { @page { size: A4; margin: 0; } }`}</style>
    <article className="qpage" aria-label="원두 공급 견적서">
      <Header date={quote.issueDate} />
      <section className="q-parties" aria-label="공급자와 받는 분">
        <div>
          <h2 className="q-party-label"><Lettering text="From" /></h2>
          <p className="q-party-name">니트 커피</p>
          <dl><dt>사업자등록번호</dt><dd>714-21-01743</dd><dt>담당자</dt><dd>{quote.managerName || "—"}</dd><dt>연락처</dt><dd>{quote.managerPhone || "—"}</dd></dl>
        </div>
        <div>
          <h2 className="q-party-label"><Lettering text="To" /></h2>
          <p className="q-party-name">{quote.customerName || "—"}</p>
          <dl><dt>사업자등록번호</dt><dd>{quote.customerBizNo || "—"}</dd><dt>담당자</dt><dd>{quote.customerManager || "—"}</dd><dt>연락처</dt><dd>{quote.customerPhone || "—"}</dd></dl>
        </div>
      </section>
      <section aria-label="월 사용량별 원두 공급 단가">
        <p className="q-unit">모든 가격은 1kg 기준 · 원 · 부가세 별도</p>
        <table className={`q-table${headers.length > 3 ? " q-table-dense" : ""}`} aria-label="원두 정가와 월 사용량별 공급 단가">
          <colgroup><col className="q-name-col" /><col className="q-retail-col" /><col className="q-supply-col" span={headers.length} /></colgroup>
          <thead><tr className="q-groups"><th scope="col" rowSpan={2}>원두</th><th scope="col" rowSpan={2}>정가</th><th scope="colgroup" colSpan={headers.length}>월 사용량별 공급가</th></tr>
            <tr className="q-volumes">{headers.map((h, i) => <th scope="col" key={i}>{h || "—"}</th>)}</tr>
          </thead>
          <tbody>{quote.beans.map((b, i) => <tr key={i}>
            <th scope="row">{b.name}<EnglishName name={b.name} /></th>
            <td className="q-retail" data-label="정가">{priceFmt(b.listPrice)}</td>
            {headers.map((h, ci) => <td key={ci} data-label={h || "공급가"}>{priceFmt(b.prices[ci])}</td>)}
          </tr>)}</tbody>
        </table>
        <div className="q-single"><h2><Lettering text="Single Origin" /></h2><p>싱글 오리진은 생두 시세에 따라 단가가 변동되어,<br />주문 시 별도 안내드립니다.</p></div>
      </section>
      <Footer quote={quote} validity />
    </article>

    {guidePages.map((beans, page) => <article className="qpage q-guide" key={page} aria-label={`원두 안내 ${page + 1}`}>
      <Header guide />
      <div className="q-beans">{beans.map((a, i) => <section className="q-bean" key={i} aria-label={`${a.name} 원두 정보`}>
        <div className="q-bean-top"><h2>{a.name}</h2><EnglishName name={a.name} /></div>
        <p className="q-flavour">{a.flavor}</p>
        <p className="q-description">{a.description}</p>
        <div className="q-specs">
          {a.composition ? <div><h3><Lettering text="Blend Composition" /></h3><ul className="q-composition">
            {compositionRows(a.composition).map((part, j) => <li key={j}><span>{part.name}</span>{part.ratio && <b>{part.ratio}</b>}</li>)}
          </ul></div> : a.origin ? <div><h3><Lettering text="Origin & Process" /></h3><p className="q-origin-text">{a.origin}</p></div> : null}
          {a.roast && <div className="q-roast"><h3><Lettering text="Roast Level" /></h3><p>{a.roast}</p></div>}
        </div>
      </section>)}</div>
      <Footer quote={quote} />
    </article>)}

    {consulting.length > 0 && <article className="qpage q-consulting" aria-label="메뉴 컨설팅 견적">
      <Header consulting date={quote.issueDate} />
      <h2 className="q-consult-title">{quote.customerName || "—"} · 메뉴 컨설팅</h2>
      <div>{consulting.map((c, i) => <div className="q-consult-row" key={i}>
        <div><h3>{c.label}</h3>{c.desc && <p>{c.desc}</p>}</div><span>{wonFmt(Number(c.price) || 0)}</span>
      </div>)}<div className="q-consult-row q-total"><strong>컨설팅 합계 <small>(부가세 별도)</small></strong><strong>{wonFmt(total)}</strong></div></div>
      <Footer quote={quote} validity />
    </article>}
  </div>;
}
