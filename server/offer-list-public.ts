import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfferListDocument } from "../client/src/components/OfferListDocument";
import { OFFER_ORDER_URL, OFFER_SHARE_URL, type OfferList } from "@shared/offer-list";

// React escapes all stored product text. No account, admin or excluded-product data is serialized.
export function renderPublicOffer(list: OfferList | null): string {
  const content = list?.count
    ? renderToStaticMarkup(createElement(OfferListDocument, { list, showPrice: true }))
    : list
      ? '<section class="offer-public-empty"><h1>Offer List</h1><p>현재 주문 가능한 상품을 준비하고 있습니다.</p><a href="' + OFFER_ORDER_URL + '">주문 사이트 보기</a></section>'
      : '<section class="offer-public-empty"><h1>잠시 후 다시 확인해 주세요</h1><p>현재 상품 정보를 불러오지 못했습니다.</p><a href="' + OFFER_SHARE_URL + '">다시 불러오기</a></section>';
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>니트커피 오퍼리스트 | Knit Coffee Offer List</title>
<meta name="description" content="니트커피의 현재 주문 가능한 원두와 도매가를 확인하세요.">
<meta property="og:type" content="website"><meta property="og:site_name" content="Knit Coffee">
<meta property="og:title" content="니트커피 오퍼리스트"><meta property="og:description" content="지금 주문 가능한 상품과 기본 도매가를 확인하세요.">
<meta property="og:url" content="${OFFER_SHARE_URL}"><meta property="og:image" content="https://wholesale.knitcoffee.co.kr/knit-logo-stacked.png">
<link rel="canonical" href="${OFFER_SHARE_URL}"><link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://use.typekit.net/pdz1nxt.css"><link rel="stylesheet" href="/offer-list.css">
</head><body class="offer-public"><main>
<nav class="offer-public-bar" aria-label="오퍼리스트 메뉴"><p>KNIT COFFEE · WHOLESALE</p><div class="offer-public-actions"><a href="${OFFER_SHARE_URL}">최신 목록</a><a class="offer-order" href="${OFFER_ORDER_URL}">주문하러 가기 ↗</a></div></nav>
${content}
</main></body></html>`;
}
