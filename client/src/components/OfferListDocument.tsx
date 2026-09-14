import { OFFER_ORDER_URL, OFFER_PRICE_NOTE, offerDate, offerPrice, type OfferList } from "@shared/offer-list";
import React from "react";

export function OfferListDocument({ list, showPrice }: { list: OfferList; showPrice: boolean }) {
  return <article className="offer-document print-area" aria-label="오퍼리스트 미리보기">
    <header className="offer-masthead">
      <img src="/knit-logo-stacked.png" alt="knit COFFEE" width="88" />
      <div><p className="offer-kicker">FRESHLY AVAILABLE</p><h2>Offer List</h2><p>{offerDate(list.generatedAt).replaceAll("-", " . ")}</p></div>
    </header>
    <div className="offer-intro"><span>지금 주문 가능한 상품</span><span>{list.count} selections</span></div>
    {showPrice && <p className="offer-price-note">{OFFER_PRICE_NOTE}</p>}
    {list.groups.map((group, index) => <section key={group.key} className="offer-group">
      <h3><span>{String(index + 1).padStart(2, "0")}</span>{group.label}</h3>
      <table><thead><tr><th scope="col">상품 / Coffee</th>{showPrice && <th scope="col" className="offer-price">도매가</th>}</tr></thead>
        <tbody>{group.items.map(p => <tr key={p.id} data-product-id={p.id}>
          <td><strong>{p.name}</strong>
            {p.origin && <p className="offer-origin">{p.origin}</p>}
            {p.notes && <p className="offer-notes">{p.notes}</p>}
            {(p.process || p.variety || p.roast) && <p className="offer-detail">{[p.process && `가공 ${p.process}`, p.variety && `품종 ${p.variety}`, p.roast && `로스팅 ${p.roast}`].filter(Boolean).join(" · ")}</p>}
            {p.minOrderQty > 0 && <p className="offer-detail">최소 주문 {p.minOrderQty}개</p>}
          </td>
          {showPrice && <td className="offer-price">{offerPrice(p.price)}</td>}
        </tr>)}</tbody>
      </table>
    </section>)}
    <footer className="offer-footer"><p>재고와 가격은 변경될 수 있습니다.<br/>주문 시 사이트에서 확인해 주세요.</p><a href={OFFER_ORDER_URL}>wholesale.knitcoffee.co.kr ↗</a></footer>
  </article>;
}
