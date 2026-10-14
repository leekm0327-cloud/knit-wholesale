# Cafe24 online order integration

## Capabilities
- Online orders has a dedicated navigation category with separate Cafe24 and Smartstore pages.
- Default 30 days; presets for today, 7, 30, and 90 days. Maximum 90 days per query.
- Fetch every upstream result page before showing local search, queue counts, and 50-row pagination. Errors never appear as a complete empty result.
- Search buyer, order, product, and option. Export selected preparation rows to CSV with formula escaping.
- Read order items, payment status, recipients, shipping requests, and shipment details on demand.
- Authorized administrators can change eligible paid items from product preparation to shipping preparation and dispatch single-destination orders with a carrier and tracking number.
- Owner-only OAuth requests read_order and write_order when enabling processing. Existing read-only tokens remain usable; processing stays disabled until the owner grants the additional scope.
- Cancellation, return, exchange, refund, split shipment, and existing tracking edits remain in the channel administrator.

## Data and safety
- Do not copy customer orders into the wholesale ledger or revenue accounts.
- OAuth tokens remain encrypted in the existing connection table.
- The additive online_order_actions table stores request ID, channel/order ID, actor, request digest, result, and timestamp. It does not store addresses, phone numbers, or raw tracking numbers.
- Verify current upstream order state before a write. Require same-origin requests, administrator authentication, and explicit confirmation.
- Never retry a mutation automatically. Persist uncertain responses and prevent duplicate processing; use the channel administrator to reconcile.
- Test with synthetic API responses and an isolated in-memory database. Do not change real customer orders for validation.
- Connection credentials and deployment-specific settings belong in the private hosting configuration, never in the public repository.

## Validation
- node --import tsx script/tests/cafe24-orders.test.ts
- node --import tsx script/tests/online-order-actions.test.ts
- node --import tsx script/build.ts
- Existing repository type errors are tracked separately; do not claim a clean full type check.

## Official references
- https://apidocs.cafe24.com/en/docs/admin/put-orders-by-order-id
- https://apidocs.cafe24.com/en/docs/admin/post-orders-by-order-id-shipments
- https://apidocs.cafe24.com/en/docs/guide/oauth2-authentication
