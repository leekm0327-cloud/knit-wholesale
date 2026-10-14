# Smartstore online order integration

## Capabilities
- Dedicated Online orders navigation with Smartstore and Cafe24 pages.
- Default 30 days, today/7/30/90-day presets, and a maximum 90-day payment-date interval in Korea time.
- Server batches the upstream daily API and consumes all pages before moving to the previous day. The browser merges and deduplicates batches before presenting complete search results.
- New, ready, shipping, overdue, and claim queues. Counts cover the selected payment-date interval, not all historical outstanding orders.
- Search order number, buyer, product, and option; direct product-order detail lookup; select preparation rows for CSV export.
- Order/recipient/shipment details remain on-demand reads.
- Explicitly confirmed actions support new-order confirmation and dispatch with a supported parcel carrier and tracking number.
- Cancellation/refund, return/exchange, split shipment, and tracking corrections remain in Smartstore Seller Center.

## Data and safety
- No customer-order replication and no wholesale ledger writes.
- Authentication tokens remain in server memory. Credentials and deployment-specific allowlists are private hosting settings and must not be committed.
- The additive online_order_actions table records operation IDs, payload digests, actor, result, and time, without raw customer addresses, phones, or tracking numbers.
- Every write validates the latest payment, claim, and fulfillment state. Require administrator authentication, same-origin requests, and explicit confirmation.
- Mutation requests are never automatically retried. A durable operation record blocks repeats after success or an uncertain response.
- Synthetic tests cover range pagination, authorization, duplicate suppression, state/claim guards, and ambiguous network outcomes. Real orders must not be mutated for testing.

## Validation
- node --import tsx script/tests/smartstore-orders.test.ts
- node --import tsx script/tests/online-order-actions.test.ts
- node --import tsx script/build.ts

## Official references
- https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-confirm-product-orders-pay-order-seller
- https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-dispatch-product-orders-pay-order-seller
