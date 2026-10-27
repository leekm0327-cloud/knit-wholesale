# Roastery shipping

## Scope and lifecycle

- Customer orders, amounts, payments, POS, purchases and notifications are never updated by this module.
- The authenticated workflow requires a dedicated `customers.role = roastery` identity plus an enabled `roastery_members` entry. No account creation endpoint is added. The API middleware denies other application APIs for these identities, including product pricing and financial endpoints. `/api/auth/me` and login return only ID, role and display name for this role. The separate limited bearer-link workflow is described below.
- Administrators explicitly assign a whole order to a configured partner. Assignment is not inferred from product name or customer. Existing assignments cannot be silently replaced. Assign only orders whose entire contents belong to that roastery.
- `/roastery/shipping`: assigned orders, preparation, shipping-only recipient fields, item names/EA/weight indication, packing instructions, tracking submission, dispatch report and event history.
- `/admin/roastery-shipping`: explicit assignment and shipment review. Link from admin order list. Existing admin order workflow is preserved.
- Tracking: `submitted → approved → dispatch_reported → dispatch_confirmed`. `submitted` or `approved` can be rejected with a reason; rejected numbers can be corrected and resubmitted. Reporting dispatch requires preparation complete, approved tracking, and a separate explicit confirmation. This never changes `orders.status` or sends notifications.
- Order contents/address/status/tracking changes invalidate the preview. Changes after submission also block approval/dispatch until re-review. Existing administrator tracking numbers are not overwritten.

## Excel and matching

- Generic unencrypted `.xlsx`, at most 5 MB, 10 sheets, 501 rows including header per sheet. Cached content only, formula workbooks rejected, no external workbook content executed.
- Choose sheet, header row, order-number column, tracking-number column and carrier. Manual entry and explicit manual order selection are supported.
- Exact order number within the current roastery scope is the only automatic association. No recipient name/phone similarity matching. An explicit manual choice cannot contradict another exact order-number match.
- Tracking cells must be text to preserve leading zeroes. Numeric cells are not silently converted. 8–30 digits; CJ/HANJIN/LOTTE/POST/LOGEN identifiers are supported as manually selected carriers, without carrier API integration or validity certification.
- All included rows must be valid. Invalid/ambiguous rows may be corrected or explicitly unchecked before re-preview. Same tracking on the same order is skipped on reupload; reuse on another order is blocked. One active tracking number per order; split shipments require separate review/design.
- Preview has an actor/scope binding, 15-minute expiry and fingerprint. Apply runs in one immediate SQLite transaction and stores its result on the preview ID. Repeating that ID returns the same result. Lost responses can be recovered with result lookup. Cancellation marks the preview unusable.

## Additive storage and activation prerequisites

New, initially empty tables: `roastery_members`, `roastery_assignments`, `roastery_shipments`, `roastery_previews`, `roastery_audit`; unique active carrier/tracking index. Created by the same module-registration pattern as existing bank/settlement modules. No existing table conversion, customer migration, auto-assignment, historical import or startup processing.

Before deployment: separate approval, scoped code review, normal backup/rollout procedure, and confirm whether authenticated membership or limited bearer access will be used. No real accounts/grants have been created. Assignment UI lists partners with an enabled membership or an active unexpired link. Assignment remains an explicit administrator action. Existing receiving contact details remain unchanged.

Still needed: an actual CJ export sample to validate column/identifier formatting; handling requirements for multiple parcels per order; review of weight/packing data. Weight shown is an indication extracted from product name, not certified logistics weight. Unknown weight/packing is marked for administrator confirmation. Shipping-only instructions are entered at assignment; internal order notes are not disclosed automatically.

Rollback: remove/revert this feature's code without dropping its new tables; no legacy financial/order data was changed by the module. Do not automatically replay any shipping action on rollback/redeploy.

## Local verification

Run `node --import tsx script/tests/roastery-shipping.test.ts` using Node 22. This uses `node:sqlite` memory databases and localhost only; it never imports production storage or `.env`. Synthetic XLSX files live in `script/tests/fixtures/roastery/`.

Actual compiled UI tests and screenshots: `artifacts/roastery-shipping/` (local review artifacts, not production code). Headless Chrome has a separate test profile and blocks non-local requests; no user's logged-in browser is used.

## Limited secret-link workflow — local only

- `/shipping-link` is a standalone page without SPA analytics. A 256-bit random bearer token arrives in a URL fragment, is immediately removed from the address, and stays only in page memory. Requests carry it in the Authorization header with no cookies, cache or referrer. Refreshing the page requires reopening the original link; no credential is persisted in browser storage.
- Only token hashes are stored. Every request validates expiry and revocation. Issuance, expiry, revocation and atomic rotation are owner-only actions on `/shipping-link-management#/admin/roastery-shipping`, a separate same-origin CSP-restricted surface without external analytics. The raw link is shown once for at most 60 seconds. Issuance retries never create another grant or recover plaintext; a lost issuance response requires deliberate revoke/reissue.
- The token scopes to one supplier's explicitly assigned orders, including future assignments during its lifetime. The response includes only order ID, store, order timestamp, product name/EA quantity, tracking/state and opaque revision. It excludes recipient address/phone, financial fields, original notes and original order APIs. It returns at most the latest 500 assigned orders and clearly indicates truncation.
- The public capability only lists orders, submits tracking for administrator review, and retrieves an idempotent request result. It cannot prepare/dispatch orders, upload Excel, approve tracking or alter order/payment/POS records. Existing tracking is read-only unless rejected by an administrator. The supplied tracking format is validated, not certified by a carrier.
- Writes use immediate transactions, bound UUID request keys, current assignment/order fingerprints and carrier/tracking uniqueness. The existing audit records the link ID and `bearer_not_person`, never a guessed worker identity. Rate limits are persisted in SQLite (120 requests/minute per hashed IP and link; 30 writes/minute/link; 5 issues/minute/owner), and JSON bodies are limited to 4 KiB.
- Four additional empty tables are additive: `roastery_links`, `roastery_link_requests`, `roastery_link_limits`, `roastery_link_events`. No production schema operation, real token issuance, account creation or assignment has been performed. No startup data processing occurs.
- Revocation prevents subsequent requests immediately. Previously displayed information cannot be recalled; the UI clears on the next protected request, focus refresh or expiry timer. Bearer possession is transferable and does not prove individual identity. Proxy-level logging and production HTTPS behavior have not been exercised in this local task.
- Before activation, obtain separate approval for deployment, recipient/roastery, lifetime (1 hour; 1/3/7/30/90/180/365 days; default 24 hours), and assigned whole orders. Keep raw links out of analytics, proxy header logs, screenshots and support messages. On any future rollback after issuance, revoke issued access and retain an inert fragment-clearing, no-analytics `/shipping-link` page; do not route old credential-bearing links into the ordinary SPA.

Verification: `script/tests/roastery-link.test.ts` passed 26 checks and the existing shipping suite passed 30. Actual compiled owner UI and standalone portal tests passed; portal widths 1440/390/320 passed with no overflow, including expiry/revocation, scope changes, duplicate clicks, failed writes and lost-response recovery. Build passed. TypeScript still reports the same 35 baseline diagnostics by file/code, with no new diagnostics. Evidence and redacted test summaries are in `artifacts/roastery-link/`; screenshots contain synthetic data only. No usable token is included in artifacts or reports.

## Customer tracking projection (approved 2026-10-27)

Customer order list/detail reads now project the committed `roastery_shipments` row as the single tracking source, immediately after either authenticated manual/Excel apply or secret-link submission. The pending administrator review does not delay visibility. The legacy order row is not copied or mutated; legacy administrator tracking remains authoritative when present and blocks roastery overwrite. Customer Invoice receives the same effective tracking number. Admin order editing retains its original legacy field.

Rejected/changed records show “송장 정보 확인 중” without the invalid number; corrected resubmissions replace the projected number atomically. Cancelled orders expose no active shipment. Only separately administrator-confirmed dispatch is labelled “출고 확인”; all other valid saved numbers are “송장 등록”, never inferred in-transit/delivered. Official carrier lookup pages open without sending numbers automatically; customer enters the displayed number there. No carrier API or messaging call is introduced.

Customer authorization is checked before projection; secret bearer and roastery sessions cannot access these order APIs. Customer pages refetch on mount/focus and every 15 seconds while open (not push realtime). GET responses are no-store. A new customer integration suite covers immediate projection, correction, cross-customer scope, bearer denial, cancelled/stale data, duplicate requests and preservation of legacy orders/amounts/status. Final evidence: `artifacts/roastery-release/`.

Release requires only the nine new initially empty roastery tables (five workflow + four link tables) and the shipment uniqueness index; no schema conversion or historical processing. Deployment itself issues no token, creates no account, assigns no order and performs no shipping operation. Roll back to the recorded pre-release Railway deployment, preserving additive tables. Once links have actually been issued, the fragment-safe rollback requirements above also apply.

Duration update (2026-10-27): new issuance and rotation accept positive integer hours up to8760 (365 days); existing links are never extended automatically. Browser expiry scheduling is capped to the JavaScript timer limit and rechecks the absolute expiry to prevent long-duration overflow. Tests: roastery-link-expiry.test.ts and artifacts/roastery-expiry/. Existing expiration timestamps are never rewritten by deployment.
