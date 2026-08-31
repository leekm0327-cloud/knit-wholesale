import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ===== 비밀번호 재설정 토큰 (#26) =====
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

// ===== 거래처(도매 고객) + 관리자 통합 사용자 =====
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"), // "customer" | "admin"
  // 관리자 서브 역할: "owner" | "manager" (role="admin"인 경우만 사용)
  adminRole: text("admin_role").notNull().default("owner"),
  businessName: text("business_name").notNull(), // 상호
  managerName: text("manager_name").notNull(), // 담당자명
  phone: text("phone").notNull(), // 연락처
  bizRegNo: text("biz_reg_no").notNull().default(""), // 사업자등록번호
  taxEmail: text("tax_email").notNull().default(""), // 세금계산서 이메일
  defaultAddress: text("default_address").notNull().default(""), // 기본 배송지
  paymentMethod: text("payment_method").notNull().default("transfer"), // transfer | card | deferred
  // 매장 내부 계정 여부. 1이면 이 계정의 주문은 '매장 내부 발주'로 처리 —
  // 도매 매출/세금계산서(ECOUNT)에서 제외하고, 그 자동발주는 매장(음식점업) 매출원가로 집계.
  isStore: integer("is_store").notNull().default(0),
  // B-3: 사업자번호 검증/승인 여부 (1=승인, 0=승인대기). 샘플 신청 가능 조건.
  bizVerified: integer("biz_verified").notNull().default(0),
  // B-3: 샘플 사용 여부 (1=이미 샘플 주문함). 승인 고객당 1회 제한.
  sampleUsed: integer("sample_used").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ===== 상품 =====
// 원칙: ECOUNT는 1품목 1코드 → 중량별로 별도 상품으로 등록 (예: "코튼 블렌드 1kg", "코튼 블렌드 200g")
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 중량 포함 전체 상품명 (예: "코튼 블렌드 1kg")
  category: text("category").notNull(), // blend | decaf | single
  origin: text("origin").notNull().default(""), // 산지 / 설명
  price: integer("price").notNull().default(0), // 단가 (원)
  costPrice: integer("cost_price").notNull().default(0), // 매입금 (클라리멘토 원가) — 관리자 전용, 발주 단가 기본값
  available: integer("available").notNull().default(1), // 1 판매중 / 0 품절
  // 상품별 최소 주문 수량 (0이면 제한 없음). 예: 드립백 6개 이상. 원두 5kg 규칙과 별개로 이 상품 라인에 적용.
  minOrderQty: integer("min_order_qty").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  // ECOUNT 품목코드 (ECOUNT 마스터의 PROD_CD와 일치해야 매칭됨). 비어있으면 ECOUNT 전송 불가.
  ecountCode: text("ecount_code").notNull().default(""),
  // 상세페이지 양식: "blend" | "single". 비어있으면 category에서 자동 유추 ("blend"->blend, 그 외 single).
  detailTemplate: text("detail_template").notNull().default(""),
  // 상세페이지 필드 JSON — 양식별 키 다름
  detailJson: text("detail_json").notNull().default(""),
  // 상세페이지 이미지 (base64 data URL 배열 JSON)
  detailImages: text("detail_images").notNull().default("[]"),
});

// ===== 상품 카테고리 (관리자가 생성·수정·삭제·순서변경) =====
// 상품의 category 필드는 이 테이블의 key 를 참조한다. (예: blend / decaf / single / dripbag ...)
export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // 상품에 저장되는 코드값 (영문 슬러그)
  label: text("label").notNull(), // 화면 표시명 (예: "싱글 오리진 에스프레소")
  sortOrder: integer("sort_order").notNull().default(0), // 카탈로그 노출 순서 (작을수록 먼저)
  isBean: integer("is_bean").notNull().default(1), // 1이면 원두 — 5kg 최소주문 수량에 포함
  sampleEligible: integer("sample_eligible").notNull().default(0), // 1이면 무료 샘플 신청 대상
  active: integer("active").notNull().default(1), // 1 노출 / 0 숨김
  createdAt: integer("created_at").notNull().default(0),
});

// ===== 거래처별 상품 가격 오버라이드 =====
// 거래처가 특정 상품을 보는 가격. 행이 없는 상품은 products.price 그대로 적용.
export const customerPrices = sqliteTable("customer_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  productId: integer("product_id").notNull(),
  price: integer("price").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ===== 즐겨찾기 (거래처별 상품 즐겨찾기) =====
// 거래처가 별표한 상품. 카탈로그에서 즐겨찾기 품목을 최상단에 노출.
export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  productId: integer("product_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ===== 게시판 =====
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(), // notice | inquiry | free
  title: text("title").notNull(),
  body: text("body").notNull(),
  images: text("images").notNull().default("[]"), // base64 data URL 배열 JSON
  authorId: integer("author_id"), // 관리자 작성 시 null
  authorBusinessName: text("author_business_name").notNull(),
  authorManagerName: text("author_manager_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  pinned: integer("pinned").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  body: text("body").notNull(),
  authorId: integer("author_id"), // 관리자 작성 시 null
  authorBusinessName: text("author_business_name").notNull(),
  authorManagerName: text("author_manager_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ===== 주문 =====
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), // 주문번호 KC-YYMMDD-XXXX
  customerId: integer("customer_id").notNull(),
  // 주문 시점 거래처 스냅샷 (JSON)
  customerSnapshot: text("customer_snapshot").notNull(),
  // 품목 라인 JSON 배열: [{productId,name,category,unitPrice,qty,amount}]
  items: text("items").notNull(),
  // 주문 시점의 '매장 내부 계정' 여부 스냅샷. 거래처를 삭제하거나 isStore를 나중에 바꿔도
  // 과거 손익이 흔들리지 않도록 주문에 기록해 둔다. (-1 = 미기록: 거래처 현재값으로 판정)
  isStoreOrder: integer("is_store_order").notNull().default(-1),
  // 정액 할인 — 공급가액에서 빼는 금액(양수로 저장, 0이면 할인 없음).
  // 공급가액에서 차감하므로 부가세도 10%만큼 함께 줄고, 거래처가 덜 내는 실제 금액은 할인액의 110%다.
  // (예: 할인 200,000 → 공급가액 -200,000, 부가세 -20,000, 합계 -220,000)
  discountAmount: integer("discount_amount").notNull().default(0),
  discountLabel: text("discount_label").notNull().default(""), // 할인 사유 (예: 8월 프로모션)
  supplyAmount: integer("supply_amount").notNull(), // 공급가액 (할인 반영 후)
  vat: integer("vat").notNull(), // 부가세
  totalAmount: integer("total_amount").notNull(), // 합계
  desiredDate: text("desired_date").notNull().default(""), // 희망 납품일
  ecountDate: text("ecount_date").notNull().default(""), // 관리자 지정 주문 일자(YYYY-MM-DD). ECOUNT IO_DATE로 사용, 비면 createdAt 기준
  note: text("note").notNull().default(""), // 요청사항
  status: text("status").notNull().default("pending"), // pending | done | cancelled
  isSample: integer("is_sample").notNull().default(0), // B-2: 샘플 주문 여부 (1=샘플, 무료·5kg검증 제외)
  trackingNo: text("tracking_no").notNull().default(""), // 송장번호
  adminMemo: text("admin_memo").notNull().default(""), // 관리자 메모
  quickRequest: integer("quick_request").notNull().default(0), // 퀵 요청 여부 (#6)
  cancelledAt: integer("cancelled_at"), // 취소 시각 (nullable)
  cancelledBy: integer("cancelled_by"), // 취소한 사용자 customer.id (관리자/거래처, nullable)
  // 처리완료(done) 전환 시 클라리멘토 자동발주로 생성된 purchase.id (중복 자동발주 방지, nullable)
  autoPurchaseId: integer("auto_purchase_id"),
  // ECOUNT 판매전표 전송 이력 — 전송됨/미전송/재전송 필요 표시 및 중복 전송 방지에 사용.
  // 세금계산서는 이 판매전표를 근거로 이카운트에서 월 단위 일괄 발행하므로,
  // '빠짐없이 넘어갔는지'를 앱에서 확인할 수 있어야 한다.
  ecountSentAt: integer("ecount_sent_at"),          // 마지막 성공 전송 시각 (null = 미전송)
  ecountSentAmount: integer("ecount_sent_amount"),  // 전송 당시 합계 금액
  ecountSentCount: integer("ecount_sent_count").notNull().default(0), // 성공 전송 횟수
  createdAt: integer("created_at").notNull(),
});

// ===== ECOUNT 연동 설정 (단일 레코드, id=1) =====
export const ecountSettings = sqliteTable("ecount_settings", {
  id: integer("id").primaryKey(),
  comCode: text("com_code").notNull().default(""),
  userId: text("user_id").notNull().default(""),
  apiCertKeyEnc: text("api_cert_key_enc").notNull().default(""), // AES 암호화된 인증키
  zone: text("zone").notNull().default(""),
  warehouseCode: text("warehouse_code").notNull().default(""),
  // 이카운트 구매입력 "추가항목(구매상단)" 중 납품 거래처명을 넣을 필드코드 (예: 추가문자형식1의 API 필드명)
  //  - 비워두면 후보 필드코드(U_TXT1~10, U_MEMO1~5)를 모두 넣어본다(이카운트는 모르는 코드는 무시).
  deliverFieldCode: text("deliver_field_code").notNull().default(""),
  // 판매전표에 정액 할인을 한 줄로 붙일 때 쓰는 이카운트 품목코드.
  // 비어 있으면 할인이 있는 주문은 전송을 막는다(할인이 빠진 채로 넘어가면 세금계산서 금액이 틀어지므로).
  discountProductCode: text("discount_product_code").notNull().default(""),
  useTestEndpoint: integer("use_test_endpoint").notNull().default(1), // 1=sboapi, 0=oapi
  autoSendSales: integer("auto_send_sales").notNull().default(0),
  autoSendPayments: integer("auto_send_payments").notNull().default(0),
  autoSendCustomer: integer("auto_send_customer").notNull().default(1),
  autoSendProduct: integer("auto_send_product").notNull().default(1),
  lastVerifiedAt: integer("last_verified_at"),
  verificationLog: text("verification_log").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

// ===== ECOUNT 호출 로그 =====
export const ecountLogs = sqliteTable("ecount_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  // 작업 종류: customer | product | sale | payment | invoice_auto | verify | login
  action: text("action").notNull(),
  // 한글 표시용 레이블 (예: "판매전표 등록")
  label: text("label").notNull(),
  // 관련 주문번호 / 거래처ID 등 조회 키 (선택)
  refKind: text("ref_kind").notNull().default(""), // order | customer | payment | verify
  refId: text("ref_id").notNull().default(""),
  // 요청 요약 (사람이 읽기 좋게)
  summary: text("summary").notNull().default(""),
  // 결과
  ok: integer("ok").notNull().default(0), // 1 성공 / 0 실패
  message: text("message").notNull().default(""), // 쇼트 메시지 (성공/에러)
  // 원본 요청/응답 (JSON 문자열, 아랫바이 펼침용)
  requestJson: text("request_json").notNull().default(""),
  responseJson: text("response_json").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
});

// ===== 입금(수금) 기록 =====
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  amount: integer("amount").notNull(), // 입금액 (원)
  paidAt: text("paid_at").notNull(), // 입금일 YYYY-MM-DD
  method: text("method").notNull().default("transfer"), // transfer | cash | card | other
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== OEM 공급처(매입처) =====
// 클라리멘토 등 원두를 OEM 생산/납품받는 공장. 대부분 소수(1곳)지만 확장 가능하게 테이블화.
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 공급처 상호 (예: 클라리멘토)
  contact: text("contact").notNull().default(""), // 담당자명
  phone: text("phone").notNull().default(""), // 연락처
  ecountCode: text("ecount_code").notNull().default(""), // 이카운트 거래처코드 (매입전표 CUST) — 이미 이카운트에 등록된 공급처 코드
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== 발주(매입) =====
// 공급처에 원두를 발주한 내역. 저장 시 공장에 대한 채무(외상매입금)가 증가한다.
// items JSON 배열: [{productId(nullable), name, qty, unitPrice, amount}]
//  - 기존 제품을 고르면 productId 채움, 직접 입력 품목이면 productId=null
//  - 매입단가(unitPrice)는 판매가와 별개로 직접 입력
export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id").notNull(),
  purchaseNo: text("purchase_no").notNull().unique(), // 발주번호 PO-YYMMDD-XXXX
  purchaseDate: text("purchase_date").notNull(), // 발주일 YYYY-MM-DD
  items: text("items").notNull(), // 품목 라인 JSON 배열
  totalAmount: integer("total_amount").notNull(), // 발주 합계 금액 (원)
  memo: text("memo").notNull().default(""),
  // 부문: "wholesale"(도매 매출원가) | "store"(매장 내부 발주 → 음식점업 매출원가)
  segment: text("segment").notNull().default("wholesale"),
  // 이 발주가 어느 거래처(주문)를 위한 것인지. 자동발주는 주문 거래처가 자동 기입, 직접등록은 선택/입력.
  customerId: integer("customer_id"), // 매칭된 회원 id (없으면 null)
  customerName: text("customer_name").notNull().default(""), // 표시용 거래처명(직접 입력 가능)
  // ECOUNT 구매전표 전송 이력 — 전송됨/미전송/재전송 필요 표시에 사용
  ecountSentAt: integer("ecount_sent_at"), // 마지막 성공 전송 시각 (null = 미전송)
  ecountSentAmount: integer("ecount_sent_amount"), // 전송 당시 공급가 합계 (이후 발주가 수정되면 현재 금액과 달라짐)
  ecountSentCount: integer("ecount_sent_count").notNull().default(0), // 성공 전송 횟수 (2 이상이면 중복 전송)
  createdAt: integer("created_at").notNull(),
});

// ===== 공급처 지급(공장에 송금) =====
// 공장에 지급한 내역. 저장 시 채무가 감소한다. (거래처 입금(payments)의 매입 버전)
export const supplierPayments = sqliteTable("supplier_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id").notNull(),
  amount: integer("amount").notNull(), // 지급액 (원)
  paidAt: text("paid_at").notNull(), // 지급일 YYYY-MM-DD
  method: text("method").notNull().default("transfer"), // transfer | cash | card | other
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== 경영 대시보드 (C): 매장매출 / 고정비 항목 / 지출 =====
// 매장(오프라인) 일별 매출. 같은 날짜는 하나만 유지(upsert).
export const storeSales = sqliteTable("store_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleDate: text("sale_date").notNull().unique(), // 매출일 YYYY-MM-DD (고유)
  amount: integer("amount").notNull().default(0), // 당일 매장매출 (원)
  memo: text("memo").notNull().default(""),
  // D: 재무 부문. 매장매출 기본 store, 온라인 매출은 online 선택.
  sector: text("sector").notNull().default("store"),
  createdAt: integer("created_at").notNull(),
});

// 고정비 항목 정의 (지출 입력 시 카테고리 선택지)
export const fixedCostItems = sqliteTable("fixed_cost_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 항목명 (예: 임대료)
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active").notNull().default(1), // 1 사용 / 0 숨김
  // D: 재무 부문 (고정비도 부문 지정) — 지출 입력 시 기본 선택되는 부문
  sector: text("sector").notNull().default("common"),
  // 비용 구분: 손익계산서에서 어디로 집계할지 ("cogs" 매출원가 | "sga" 판매관리비 | "nonop" 영업외비용 | "none" 비용 아님)
  costType: text("cost_type").notNull().default("sga"),
  // 입력 금액에 부가세가 포함되어 있는지 (1=포함/과세, 0=미포함/면세·불공제).
  // 손익은 공급가액 기준이므로 1이면 ÷1.1 하여 집계한다. 인건비·4대보험·이자·보험료 등은 0.
  vatIncluded: integer("vat_included").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

// 지출 기록 (고정비 항목 or '기타')
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseDate: text("expense_date").notNull(), // 지출일 YYYY-MM-DD
  category: text("category").notNull(), // 고정비 항목명 or '기타'
  amount: integer("amount").notNull().default(0), // 지출액 (원)
  memo: text("memo").notNull().default(""),
  // D: 재무 부문 (입력 시 선택)
  sector: text("sector").notNull().default("common"),
  createdAt: integer("created_at").notNull(),
});

// ===== POS 매출 (POS 매출리포트 엑셀 업로드 → 집계 저장) =====
// 상품 단위 집계 (일자 · 카테고리 · 상품) — 메뉴 순위 / 카테고리 / 일별·월별 추이
export const posProductSales = sqliteTable("pos_product_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleDate: text("sale_date").notNull(), // YYYY-MM-DD
  category: text("category").notNull().default(""),
  product: text("product").notNull().default(""),
  qty: integer("qty").notNull().default(0),
  amount: integer("amount").notNull().default(0), // 실판매금액 합(원)
  createdAt: integer("created_at").notNull(),
});
// 시간대 단위 집계 (일자 · 시간 · 카테고리) — 시간대 / 요일 패턴
export const posHourlySales = sqliteTable("pos_hourly_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleDate: text("sale_date").notNull(),
  hour: integer("hour").notNull().default(0), // 0-23
  category: text("category").notNull().default(""),
  qty: integer("qty").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ===== E: 개인 가계부 (owner 전용, 사업 재무와 완전 분리) =====
export const personalCategories = sqliteTable("personal_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // income | expense
  createdAt: integer("created_at").notNull(),
});

export const personalLedger = sqliteTable("personal_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  type: text("type").notNull(), // income | expense
  categoryId: integer("category_id").notNull(),
  amount: integer("amount").notNull().default(0), // 원
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== F: 카카오 "나에게 보내기" 토큰 (단일 행, id=1) =====
export const kakaoTokens = sqliteTable("kakao_tokens", {
  id: integer("id").primaryKey(), // 고정 1
  accessToken: text("access_token").notNull().default(""),
  refreshToken: text("refresh_token").notNull().default(""),
  accessTokenExpiresAt: integer("access_token_expires_at").notNull().default(0), // epoch ms
  refreshTokenExpiresAt: integer("refresh_token_expires_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

// ===== 에스프레소 추출 환경 (인포그래픽, 관리자 수정) =====
export const espressoSetup = sqliteTable("espresso_setup", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  icon: text("icon").notNull().default(""), // 이모지
  label: text("label").notNull(), // 카테고리 (예: ESPRESSO MACHINE)
  value: text("value").notNull().default(""), // 내용 (예: LA MARZOCCO LINEA PB)
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
});

// ===== ③ 니트커피 소식 (블로그형 매거진) =====
// 기존 게시판(posts)과 완전 별개. 관리자가 발행하는 콘텐츠, 로그인 거래처 모두 열람.
export const news = sqliteTable("news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  coverImage: text("cover_image").notNull().default(""), // 대표 커버 (base64 data URL, 없을 수 있음)
  blocks: text("blocks").notNull().default("[]"), // 본문 블록 배열 JSON: {type:"paragraph",text} | {type:"image",src}
  status: text("status").notNull().default("draft"), // draft | published
  pinned: integer("pinned").notNull().default(0), // 상단고정
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: integer("published_at").notNull().default(0), // 발행 시각(epoch ms). draft면 0
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ===== 활동 로그 (#10) =====
export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorRole: text("actor_role").notNull(), // owner | manager
  action: text("action").notNull(), // e.g. order.status_change, customer.create
  targetType: text("target_type"), // order | customer | product | manager | board_post | system
  targetId: text("target_id"),
  summary: text("summary"), // 한 줄 한국어 요약
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at").notNull(),
});

// ===== 관리자 알림 센터 (종 아이콘 드롭다운) =====
// 주요 이벤트(거래처 가입/신규 주문/주문 병합/문의/방문 신청)를 모아서 보여준다.
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // customer_register | order_new | order_merged | inquiry | visit_request
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""), // 해시 라우트 (예: /admin/orders/123)
  readAt: integer("read_at"), // 읽은 시각(ms). null이면 안 읽음
  createdAt: integer("created_at").notNull(),
});
export type Notification = typeof notifications.$inferSelect;

// ===== 예비 거래처 견적서 =====
export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quoteNo: text("quote_no").notNull().unique(),
  token: text("token").notNull().unique(), // 공개 공유 링크용
  customerName: text("customer_name").notNull().default(""), // 예비 거래처명(회사명)
  customerBizNo: text("customer_biz_no").notNull().default(""),   // 받는 분 사업자등록번호(선택)
  customerManager: text("customer_manager").notNull().default(""),// 받는 분 담당자(선택)
  customerPhone: text("customer_phone").notNull().default(""),    // 받는 분 연락처(선택)
  managerName: text("manager_name").notNull().default(""),   // 견적자 담당자(직접 입력)
  managerPhone: text("manager_phone").notNull().default(""), // 견적자 연락처(직접 입력)
  issueDate: text("issue_date").notNull(),                   // YYYY-MM-DD
  validDays: integer("valid_days").notNull().default(30),
  usageHeaders: text("usage_headers").notNull().default("[]"), // JSON string[] (열: 월 사용량 구간, 가변)
  beans: text("beans").notNull().default("[]"),               // JSON [{name, prices:string[]}]
  consulting: text("consulting").notNull().default("[]"),     // JSON string[] (선택된 컨설팅 항목)
  consultingFee: text("consulting_fee").notNull().default(""),
  appendix: text("appendix").notNull().default("[]"),         // JSON QuoteAppendix[] (별첨 · 원두 정보)
  createdAt: integer("created_at").notNull(),
});
export type Quote = typeof quotes.$inferSelect;
// listPrice = 정가(기준가), prices = 월 사용량 구간별 제안가
export type QuoteBean = { name: string; listPrice: string; prices: string[] };
// 별첨(원두 정보) 항목 — 상품 상세페이지에서 가져옴
export type QuoteAppendix = { name: string; composition: string; flavor: string; roast: string; recipe: string };
// 메뉴 컨설팅 항목 — 항목별 금액, 체크 시 합산
export type QuoteConsulting = { label: string; desc: string; price: number; checked: boolean };
// 파싱된 견적서(뷰용)
export type QuoteView = {
  id: number;
  quoteNo: string;
  token: string;
  customerName: string;
  customerBizNo: string;
  customerManager: string;
  customerPhone: string;
  managerName: string;
  managerPhone: string;
  issueDate: string;
  validDays: number;
  usageHeaders: string[];
  beans: QuoteBean[];
  consulting: QuoteConsulting[];
  consultingFee: string;
  appendix: QuoteAppendix[];
  createdAt: number;
};
export const insertQuoteSchema = z.object({
  customerName: z.string().optional().default(""),
  customerBizNo: z.string().optional().default(""),
  customerManager: z.string().optional().default(""),
  customerPhone: z.string().optional().default(""),
  managerName: z.string().optional().default(""),
  managerPhone: z.string().optional().default(""),
  issueDate: z.string().min(1, "발행일을 입력해 주세요."),
  validDays: z.number().int().positive().optional().default(30),
  usageHeaders: z.array(z.string()).optional().default([]),
  beans: z.array(z.object({
    name: z.string(),
    listPrice: z.string().optional().default(""),
    prices: z.array(z.string()),
  })).optional().default([]),
  consulting: z.array(z.object({
    label: z.string(),
    desc: z.string().optional().default(""),
    price: z.number().optional().default(0),
    checked: z.boolean().optional().default(false),
  })).optional().default([]),
  consultingFee: z.string().optional().default(""),
  appendix: z.array(z.object({
    name: z.string(),
    composition: z.string().optional().default(""),
    flavor: z.string().optional().default(""),
    roast: z.string().optional().default(""),
    recipe: z.string().optional().default(""),
  })).optional().default([]),
});
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

// ===== 거래처 1:1 채팅 =====
// 거래처 1곳당 스레드 1개 (customerId 기준). sender 로 관리자/거래처 구분.
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(), // 대화 상대 거래처 id (스레드 키)
  sender: text("sender").notNull(), // "admin" | "customer"
  body: text("body").notNull(),
  readByAdmin: integer("read_by_admin").notNull().default(0), // 관리자가 읽었나 (거래처 발신 메시지 대상)
  readByCustomer: integer("read_by_customer").notNull().default(0), // 거래처가 읽었나 (관리자 발신 메시지 대상)
  createdAt: integer("created_at").notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;

// 관리자 채팅 스레드 목록 행
export type ChatThread = {
  customerId: number;
  businessName: string;
  managerName: string;
  lastBody: string;
  lastSender: string; // "admin" | "customer"
  lastAt: number;
  unread: number; // 거래처가 보낸 미읽음 수
};

// ===== Insert schemas =====
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const insertPaymentSchema = z.object({
  customerId: z.number().int().positive(),
  amount: z.number().int().positive("입금액을 입력해 주세요."),
  paidAt: z.string().min(1, "입금일을 선택해 주세요."),
  method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  memo: z.string().optional().default(""),
});


export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  role: true,
  adminRole: true,
  // 아래 값들은 가입자가 스스로 정할 수 없어야 한다 (관리자만 변경 가능).
  // isStore=1 이면 상품을 매입원가로 구매하고 최소주문 검증도 우회되므로 반드시 차단.
  isStore: true,
  bizVerified: true,
  sampleUsed: true,
});

export const registerSchema = insertCustomerSchema.extend({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  passwordConfirm: z.string().min(1, "비밀번호 확인을 입력해 주세요."),
  businessName: z.string().min(1, "상호를 입력해 주세요."),
  managerName: z.string().min(1, "담당자명을 입력해 주세요."),
  phone: z.string().min(1, "연락처를 입력해 주세요."),
}).refine((d) => d.password === d.passwordConfirm, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["passwordConfirm"],
});

// 비밀번호 찾기 (#26)
export const forgotPasswordSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "토큰이 필요합니다."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  passwordConfirm: z.string().min(1, "비밀번호 확인을 입력해 주세요."),
}).refine((d) => d.password === d.passwordConfirm, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["passwordConfirm"],
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// 거래처 로그인: 상호명 + 비밀번호
export const loginSchema = z.object({
  businessName: z.string().min(1, "상호명을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
  // #45: 로그인 상태 유지 (체크 시 30일 쿠키, 해제 시 세션 쿠키). 기본값 true
  rememberMe: z.boolean().optional().default(true),
});

// 관리자 로그인: 이메일 + 비밀번호
export const adminLoginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// 비밀번호 변경 (거래처/관리자 공용)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "새 비밀번호는 6자 이상이어야 합니다."),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderNo: true,
  createdAt: true,
  status: true,
  trackingNo: true,
  adminMemo: true,
  customerSnapshot: true,
  customerId: true,
  supplyAmount: true,
  vat: true,
  totalAmount: true,
});

// 클라이언트가 보내는 주문 페이로드
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number(),
        name: z.string(),
        category: z.string(),
        unitPrice: z.number(),
        qty: z.number().min(1),
        amount: z.number(),
      }),
    )
    .min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
});

// 관리자 전용 수량 규칙 — 손상·반품 차감을 주문에 그대로 남기기 위해 음수를 허용한다.
//  · 음수 한 줄이 들어가면 그 금액만큼 주문 합계가 줄고, ECOUNT 판매전표와 세금계산서에도
//    차감된 금액으로 반영된다.
//  · 0은 아무 의미가 없으므로 막는다. 거래처가 직접 넣는 주문에는 적용하지 않는다.
const adminOrderQty = z
  .number()
  .int("수량은 정수로 입력해 주세요.")
  .refine((v) => v !== 0, "수량은 0일 수 없습니다.");

const adminOrderItemSchema = z.object({
  productId: z.number(),
  name: z.string(),
  category: z.string(),
  unitPrice: z.number(),
  qty: adminOrderQty,
  amount: z.number(),
});

// ② 관리자 대리 주문 생성 페이로드 (requireAdmin) — 거래처 지정
// 정액 할인 입력값 — 0 이상의 정수. 상한(공급가액 초과 금지)은 서버에서 품목 합계를 안 뒤에 검사한다.
const adminDiscountAmount = z
  .number()
  .int("할인 금액은 원 단위 정수로 입력해 주세요.")
  .min(0, "할인 금액은 0원 이상이어야 합니다.")
  .optional()
  .default(0);
const adminDiscountLabel = z.string().max(60, "할인 사유는 60자 이내로 입력해 주세요.").optional().default("");

export const adminCreateOrderSchema = z.object({
  items: z.array(adminOrderItemSchema).min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
  discountAmount: adminDiscountAmount,
  discountLabel: adminDiscountLabel,
  customerId: z.number().int().min(1, "거래처를 선택해 주세요."),
});
export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;

// 관리자가 기존 주문의 품목을 고칠 때 쓰는 페이로드 (음수 허용)
export const adminUpdateOrderItemsSchema = z.object({
  items: z.array(adminOrderItemSchema).min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
  discountAmount: adminDiscountAmount,
  discountLabel: adminDiscountLabel,
});
export type AdminUpdateOrderItemsInput = z.infer<typeof adminUpdateOrderItemsSchema>;

// 주문 수정(품목 변경) 페이로드 — 거래처/관리자 공용
export const updateOrderItemsSchema = z.object({
  items: z.array(z.object({
    productId: z.number(),
    name: z.string(),
    category: z.string(),
    unitPrice: z.number(),
    qty: z.number().min(1),
    amount: z.number(),
  })).min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
});
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;

// ===== Types =====
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type ProductCategory = typeof productCategories.$inferSelect;
export const insertProductCategorySchema = z.object({
  key: z
    .string()
    .min(1, "코드값을 입력해 주세요.")
    .regex(/^[a-z0-9_]+$/, "코드값은 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다."),
  label: z.string().min(1, "표시명을 입력해 주세요."),
  sortOrder: z.number().int().optional().default(0),
  isBean: z.boolean().optional().default(true),
  sampleEligible: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;

export type CustomerPrice = typeof customerPrices.$inferSelect;
// API 응답용 — 상품에 거래처별 가격 적용 여부표시
export type ProductWithPrice = Product & { effectivePrice: number; hasCustomPrice: boolean };

export type Favorite = typeof favorites.$inferSelect;

export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PostWithMeta = Post & { commentCount: number };

// ===== ③ 소식(news) 타입 & 입력 스키마 =====
export type News = typeof news.$inferSelect;

// 본문 블록: 문단 또는 이미지
export const newsBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("image"), src: z.string() }),
]);
export type NewsBlock = z.infer<typeof newsBlockSchema>;

// ===== 홀세일 납품 문의 (비회원 공개 폼) =====
// 문의 유형 — 원두 납품인지 카페 컨설팅인지, 아니면 둘 다인지
export const INQUIRY_TYPES = ["wholesale", "consulting", "both"] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];
export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  wholesale: "원두 납품",
  consulting: "카페 컨설팅",
  both: "원두 납품 + 카페 컨설팅",
};

export const wholesaleInquiries = sqliteTable("wholesale_inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inquiryType: text("inquiry_type").notNull().default("wholesale"), // wholesale | consulting | both
  businessName: text("business_name").notNull(), // 상호
  contactName: text("contact_name").notNull().default(""), // 담당자
  phone: text("phone").notNull(), // 연락처
  email: text("email").notNull().default(""),
  region: text("region").notNull().default(""), // 지역
  volume: text("volume").notNull().default(""), // 예상 월 물량
  message: text("message").notNull(), // 문의 내용
  status: text("status").notNull().default("new"), // new | done
  adminMemo: text("admin_memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
export type WholesaleInquiry = typeof wholesaleInquiries.$inferSelect;
export const insertInquirySchema = z.object({
  inquiryType: z.enum(INQUIRY_TYPES).optional().default("wholesale"),
  businessName: z.string().trim().min(1, "상호(업체명)를 입력해 주세요.").max(120),
  contactName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().min(1, "연락처를 입력해 주세요.").max(60),
  email: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  volume: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(1, "문의 내용을 입력해 주세요.").max(3000),
});

// ===== 방문 커피 세팅 신청 (거래처 로그인 전용) =====
// 방문 목적: 신규 오픈 세팅 / 원두 변경 후 재세팅 / 추출 재점검 / 기타
export const VISIT_PURPOSES = ["open", "beanchange", "recalib", "etc"] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];
export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  open: "신규 오픈 세팅",
  beanchange: "원두 변경 후 재세팅",
  recalib: "추출 재점검",
  etc: "기타",
};
// 상태: 신규 → 일정 조율 → 방문 확정 → 완료
export const VISIT_STATUSES = ["new", "coordinating", "confirmed", "done"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const visitRequests = sqliteTable("visit_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(), // 신청 거래처
  businessName: text("business_name").notNull(), // 신청 당시 상호 스냅샷
  contactName: text("contact_name").notNull().default(""), // 담당자(스냅샷)
  phone: text("phone").notNull().default(""), // 연락처
  purpose: text("purpose").notNull().default("open"), // VISIT_PURPOSES
  preferredDate1: text("preferred_date1").notNull().default(""), // 희망일 1지망
  preferredDate2: text("preferred_date2").notNull().default(""), // 희망일 2지망
  message: text("message").notNull().default(""), // 요청사항
  status: text("status").notNull().default("new"), // VISIT_STATUSES
  confirmedDate: text("confirmed_date").notNull().default(""), // 관리자 확정 방문일
  adminMemo: text("admin_memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
export type VisitRequest = typeof visitRequests.$inferSelect;
// 신청 폼 입력 (상호·담당자는 로그인 세션에서 채움 → 폼에서 받지 않음)
export const insertVisitRequestSchema = z.object({
  purpose: z.enum(VISIT_PURPOSES).default("open"),
  preferredDate1: z.string().trim().max(40).optional().default(""),
  preferredDate2: z.string().trim().max(40).optional().default(""),
  phone: z.string().trim().max(60).optional().default(""),
  message: z.string().trim().max(3000).optional().default(""),
});

export const NEWS_STATUSES = ["draft", "published"] as const;

// 생성: blocks는 배열로 받아 서버에서 JSON 직렬화
export const createNewsSchema = z.object({
  title: z.string().min(1, "제목을 입력해 주세요."),
  coverImage: z.string().optional().default(""),
  blocks: z.array(newsBlockSchema).default([]),
  status: z.enum(NEWS_STATUSES).default("draft"),
  pinned: z.boolean().optional().default(false),
});
export type CreateNewsInput = z.infer<typeof createNewsSchema>;

// 수정: 모든 필드 선택적
export const updateNewsSchema = z.object({
  title: z.string().min(1, "제목을 입력해 주세요.").optional(),
  coverImage: z.string().optional(),
  blocks: z.array(newsBlockSchema).optional(),
  status: z.enum(NEWS_STATUSES).optional(),
  pinned: z.boolean().optional(),
});
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

// ===== 게시판 입력 스키마 =====
export const POST_CATEGORIES = ["notice", "inquiry", "free"] as const;
export type PostCategory = typeof POST_CATEGORIES[number];

export const createPostSchema = z.object({
  category: z.enum(POST_CATEGORIES),
  title: z.string().min(1, "제목을 입력해 주세요.").max(200, "제목은 200자 이내로 입력해 주세요."),
  body: z.string().min(1, "내용을 입력해 주세요.").max(20000, "내용은 20,000자 이내로 입력해 주세요."),
  images: z.array(z.string()).optional().default([]),
  pinned: z.number().int().min(0).max(1).optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
  images: z.array(z.string()).optional(),
  pinned: z.number().int().min(0).max(1).optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const createCommentSchema = z.object({
  body: z.string().min(1, "댓글 내용을 입력해 주세요.").max(5000, "댓글은 5,000자 이내로 입력해 주세요."),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ===== 상품 상세페이지 양식 =====
export const productDetailBlendSchema = z.object({
  template: z.literal("blend"),
  tagline: z.string().optional().default(""),
  blendRatio: z.string().optional().default(""),
  flavorNotes: z.string().optional().default(""),
  roastLevel: z.string().optional().default(""),
  recommendedUse: z.string().optional().default(""),
  description: z.string().optional().default(""),
  // B-1: 원두 상세정보 강화 (문자열로 저장, acidity/body는 "1"~"5")
  tastingNotes: z.string().optional().default(""),
  acidity: z.string().optional().default(""),
  body: z.string().optional().default(""),
  brewMethods: z.string().optional().default(""),
  originProcess: z.string().optional().default(""),
});

export const productDetailSingleSchema = z.object({
  template: z.literal("single"),
  tagline: z.string().optional().default(""),
  country: z.string().optional().default(""),
  region: z.string().optional().default(""),
  farm: z.string().optional().default(""),
  farmer: z.string().optional().default(""),
  variety: z.string().optional().default(""),
  process: z.string().optional().default(""),
  altitude: z.string().optional().default(""),
  flavorNotes: z.string().optional().default(""),
  roastLevel: z.string().optional().default(""),
  description: z.string().optional().default(""),
  // B-1: 원두 상세정보 강화 (문자열로 저장, acidity/body는 "1"~"5")
  tastingNotes: z.string().optional().default(""),
  acidity: z.string().optional().default(""),
  body: z.string().optional().default(""),
  brewMethods: z.string().optional().default(""),
  originProcess: z.string().optional().default(""),
});

export const productDetailSchema = z.discriminatedUnion("template", [
  productDetailBlendSchema,
  productDetailSingleSchema,
]);
export type ProductDetailBlend = z.infer<typeof productDetailBlendSchema>;
export type ProductDetailSingle = z.infer<typeof productDetailSingleSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;

export type ProductWithDetail = Product & {
  detailParsed: ProductDetail | null;
  imageUrls: string[];
};

export type Order = typeof orders.$inferSelect;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ===== OEM 공장 채무: 공급처 / 발주 / 지급 =====
export type Supplier = typeof suppliers.$inferSelect;
export const insertSupplierSchema = z.object({
  name: z.string().min(1, "공급처 상호를 입력해 주세요."),
  contact: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  ecountCode: z.string().optional().default(""),
  memo: z.string().optional().default(""),
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

// 발주 품목 라인 (기존 제품 선택 또는 직접 입력)
export const purchaseItemSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, "품목명을 입력해 주세요."),
  qty: z.number().positive("수량을 입력해 주세요."),
  unitPrice: z.number().int().min(0, "매입단가를 입력해 주세요."),
  amount: z.number().int().min(0),
});
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export type Purchase = typeof purchases.$inferSelect;
export const insertPurchaseSchema = z.object({
  supplierId: z.number().int().positive("공급처를 선택해 주세요."),
  purchaseDate: z.string().min(1, "발주일을 선택해 주세요."),
  items: z.array(purchaseItemSchema).min(1, "품목을 1개 이상 추가해 주세요."),
  memo: z.string().optional().default(""),
  segment: z.enum(["wholesale", "store"]).optional().default("wholesale"),
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().optional().default(""),
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;

export type SupplierPayment = typeof supplierPayments.$inferSelect;
export const insertSupplierPaymentSchema = z.object({
  supplierId: z.number().int().positive(),
  amount: z.number().int().positive("지급액을 입력해 주세요."),
  paidAt: z.string().min(1, "지급일을 선택해 주세요."),
  method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  memo: z.string().optional().default(""),
});
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;

// 공장 채무 현황 (공급처별 요약)
export type SupplierBalance = {
  supplierId: number;
  name: string;
  contact: string;
  phone: string;
  totalPurchased: number; // 누적 발주액
  totalPaid: number; // 누적 지급액
  balance: number; // 채무 = totalPurchased - totalPaid
  lastPurchaseAt: number | null;
  lastPaidAt: string | null;
};

// 공장 채무 원장 행 (발주 또는 지급)
export type SupplierLedgerRow =
  | {
      kind: "purchase";
      id: number;
      purchaseNo: string;
      date: number;
      debit: number; // 발주액 (채무 증가, +)
      credit: 0;
      balance: number;
      memo: string;
    }
  | {
      kind: "payment";
      id: number;
      date: number;
      debit: 0;
      credit: number; // 지급액 (채무 감소, -)
      balance: number;
      method: string;
      memo: string;
    };

// 발주량 집계 (품목별 누계)
export type PurchaseQtyAgg = {
  key: string; // 품목명 (기준)
  name: string;
  totalQty: number;
  totalAmount: number;
};

// 공장 채무 원장 — 선택 기간 요약 (기간 필터가 걸렸을 때만 채워짐)
export type SupplierLedgerPeriod = {
  from: string | null;
  to: string | null;
  openingBalance: number; // 기초 잔액 (기간 시작 직전까지의 채무)
  purchased: number; // 기간 발주 합계 (부가세 포함)
  paid: number; // 기간 지급 합계
  net: number; // 순증감 = 발주 - 지급
  closingBalance: number; // 기말 잔액 = 기초 + 순증감
  count: number; // 기간 내 원장 건수
};

// ===== D: 재무 부문(sector) =====
// 5개 고정 부문. store(매장)/wholesale(홀세일)/online(온라인)/atelier(아뜰리에)/common(공통)
export const SECTORS = ["store", "wholesale", "online", "atelier", "consulting", "popup", "common"] as const;
export type Sector = (typeof SECTORS)[number];
export const sectorSchema = z.enum(SECTORS);
export const SECTOR_LABEL: Record<Sector, string> = {
  store: "매장",
  wholesale: "홀세일",
  online: "온라인",
  atelier: "아뜰리에",
  consulting: "컨설팅",
  popup: "팝업",
  common: "공통",
};

// ===== 경영 대시보드 (C) 타입/스키마 =====
export type StoreSale = typeof storeSales.$inferSelect;
export const insertStoreSaleSchema = z.object({
  saleDate: z.string().min(1, "매출일을 선택해 주세요."),
  amount: z.number().int().min(0, "매출액을 입력해 주세요."),
  memo: z.string().optional().default(""),
  sector: sectorSchema.optional().default("store"),
});
export type InsertStoreSale = z.infer<typeof insertStoreSaleSchema>;

export type FixedCostItem = typeof fixedCostItems.$inferSelect;
// 비용 구분 (손익계산서 집계 위치)
export const COST_TYPES = ["cogs", "sga", "nonop", "none"] as const;
export type CostType = (typeof COST_TYPES)[number];
export const COST_TYPE_LABEL: Record<CostType, string> = {
  cogs: "매출원가",
  sga: "판매관리비",
  nonop: "영업외비용",
  none: "비용 아님",
};
export const costTypeSchema = z.enum(COST_TYPES);

export const insertFixedCostItemSchema = z.object({
  name: z.string().min(1, "항목명을 입력해 주세요."),
  sortOrder: z.number().int().optional().default(0),
  active: z.number().int().min(0).max(1).optional().default(1),
  sector: sectorSchema.optional().default("common"),
  costType: costTypeSchema.optional().default("sga"),
  vatIncluded: z.number().int().min(0).max(1).optional().default(1),
});
export type InsertFixedCostItem = z.infer<typeof insertFixedCostItemSchema>;

export type Expense = typeof expenses.$inferSelect;
export const insertExpenseSchema = z.object({
  expenseDate: z.string().min(1, "지출일을 선택해 주세요."),
  category: z.string().min(1, "지출 항목을 선택해 주세요."),
  amount: z.number().int().min(0, "지출액을 입력해 주세요."),
  memo: z.string().optional().default(""),
  sector: sectorSchema.optional().default("common"),
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

// ===== POS 매출 =====
export type PosProductSale = typeof posProductSales.$inferSelect;
export type PosHourlySale = typeof posHourlySales.$inferSelect;

// 업로드(클라이언트 파싱 후 전송) 페이로드
export const posImportSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  products: z.array(z.object({
    date: z.string().min(1),
    category: z.string().optional().default(""),
    product: z.string().optional().default(""),
    qty: z.number(),
    amount: z.number(),
  })).default([]),
  hourly: z.array(z.object({
    date: z.string().min(1),
    hour: z.number().int().min(0).max(23),
    category: z.string().optional().default(""),
    qty: z.number(),
    amount: z.number(),
  })).default([]),
});
export type PosImport = z.infer<typeof posImportSchema>;

// 집계 요약 (분석 화면용)
export type PosSummary = {
  from: string;
  to: string;
  coverage: { from: string; to: string } | null; // 데이터가 실제 존재하는 날짜 범위
  categories: string[];
  totals: { qty: number; amount: number; days: number };
  byCategory: { category: string; qty: number; amount: number }[];
  byProduct: { category: string; product: string; qty: number; amount: number }[];
  byDate: { date: string; qty: number; amount: number }[];
  byMonth: { month: string; qty: number; amount: number }[];
  byHour: { hour: number; qty: number; amount: number }[];
  byWeekday: { weekday: number; qty: number; amount: number }[]; // 0=일 … 6=토
};

// 재무제표 월별 추이 (한 줄 = 한 달의 손익 요약)
export type FinancialMonth = {
  month: string; // YYYY-MM
  revenue: number;
  cogs: number;
  grossProfit: number;
  sga: number;
  operatingProfit: number;
  nonOperating: number;
  netProfit: number;
};

// 월별 비교
export type PosMonthStat = { month: string; qty: number; amount: number; days: number };
export type PosMonthDetail = {
  month: string;
  totals: { qty: number; amount: number; days: number };
  byCategory: { category: string; qty: number; amount: number }[];
  byProduct: { category: string; product: string; qty: number; amount: number }[];
};
export type PosCompare = {
  months: PosMonthStat[];      // 저장된 전체 월 목록(추이 표)
  categories: string[];        // 선택 가능한 카테고리
  a: PosMonthDetail | null;    // 비교 대상 A (이전 달)
  b: PosMonthDetail | null;    // 비교 대상 B (기준 달)
};

// ===== E: 개인 가계부 타입/스키마 =====
export type PersonalCategory = typeof personalCategories.$inferSelect;
export const insertPersonalCategorySchema = z.object({
  name: z.string().min(1, "카테고리명을 입력해 주세요."),
  type: z.enum(["income", "expense"]),
});
export type InsertPersonalCategory = z.infer<typeof insertPersonalCategorySchema>;

export type PersonalLedgerEntry = typeof personalLedger.$inferSelect;
export const insertPersonalLedgerSchema = z.object({
  date: z.string().min(1, "날짜를 선택해 주세요."),
  type: z.enum(["income", "expense"]),
  categoryId: z.number().int().min(1, "카테고리를 선택해 주세요."),
  amount: z.number().int().min(0, "금액을 입력해 주세요."),
  memo: z.string().optional().default(""),
});
export type InsertPersonalLedger = z.infer<typeof insertPersonalLedgerSchema>;

export type PersonalSummary = {
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  byCategory: { categoryId: number; name: string; type: string; amount: number }[];
};

// ===== F: 카카오 토큰 타입 =====
export type KakaoTokens = typeof kakaoTokens.$inferSelect;

// D: 부문별 손익 한 줄
export type SectorPnl = { sector: Sector; income: number; expense: number; net: number };

// 대시보드 기간 그루핑 단위
export type DashboardGranularity = "day" | "week" | "month" | "year";

// 기간별 손익 집계 결과
export type DashboardSummary = {
  from: string;
  to: string;
  granularity: DashboardGranularity;
  // D: 적용된 부문 필터 ("all" | Sector) 및 부문별 손익 비교
  sector: "all" | Sector;
  sectorBreakdown: SectorPnl[];
  // 수입
  wholesaleSales: number; // 도매매출 (취소 제외 주문 합)
  storeSales: number; // 매장매출 합
  totalIncome: number;
  // 지출 (발생주의: 공장 매입=발주액을 지출로 인식. 공장 지급/지불은 지출 아님)
  purchaseTotal: number; // 공장 매입(발주) 합
  otherExpense: number; // 기타지출(고정비 포함) 합
  totalExpense: number;
  // 손익
  netProfit: number; // 수입 - 지출
  // 지출 항목별 비중 (category → amount)
  expenseByCategory: { category: string; amount: number }[];
  // 기간 버킷 추이
  buckets: {
    key: string; // 버킷 라벨 (예: 2026-07-08, 2026-W28, 2026-07, 2026)
    income: number;
    expense: number;
    net: number;
  }[];
};

// ===== 재무제표 (내부 경영용: 손익계산서 + 채권·채무 요약) =====
// 업종/부문별 손익 라인. 매장=음식점업, 홀세일=원두도매업.
export type FinancialStatementLine = {
  sector: Sector;
  label: string; // 업종/부문 표시명
  revenue: number; // 매출액
  cogs: number; // 매출원가 (도매=공장 매입, 그 외 0)
  grossProfit: number; // 매출총이익 = 매출 - 원가
  sga: number; // 판매관리비 (수기 지출)
  operatingProfit: number; // 영업이익 = 매출총이익 - 판관비
  nonOperating: number; // 영업외비용 (이자비용 등)
  netProfit: number; // 순이익 = 영업이익 - 영업외비용
};
export type FinancialStatement = {
  from: string;
  to: string;
  lines: FinancialStatementLine[]; // 활동 있는 부문만
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    sga: number;
    operatingProfit: number;
    nonOperating: number;
    netProfit: number;
  };
  // 공통비 배분 여부 / 배분된 금액
  allocated: boolean;
  allocatedCommon: number;
  // 손익에서 제외된 '비용 아님' 지출 합계 (부가세 납부·자산취득·사업주 개인 등)
  excluded: number;
  // 채권·채무 (현재 시점 스냅샷)
  workingCapital: {
    receivables: number; // 거래처 미수금 합 (양수 잔액)
    payables: number; // 공장 미지급금 합 (양수 잔액)
    net: number; // 순운전자본(채권-채무)
  };
};

// 에스프레소 추출 로그 집계 (구글시트 게시 데이터 기반, 공개)
export type EspressoBinRow = {
  label: string; // 구간 (예: "70–79%")
  count: number; // 표본 수 (긍정 기록)
  avgDose: number;
  avgYield: number;
  avgTime: number;
  ratio: number;
};
export type EspressoStats = {
  totalLogs: number;
  from: string;
  to: string;
  byRating: { rating: string; count: number }[];
  byDate: { date: string; count: number }[];
  byBeanRecipe: {
    bean: string;
    count: number;
    avgDose: number;
    avgYield: number;
    avgTime: number;
    ratio: number;
    tags: { label: string; count: number }[]; // 맛 태그 (긍정 코멘트에서 자동 추출)
    notes: string[]; // 대표 코멘트 (직원 이름·세팅 메모 제외, 맛 위주)
  }[];
  byHumidity: EspressoBinRow[]; // 습도 구간별 성공 레시피
  byTemp: EspressoBinRow[]; // 실내온도 구간별 성공 레시피
  error?: string;
};

export type EspressoSetupItem = typeof espressoSetup.$inferSelect;
export const insertEspressoSetupSchema = z.object({
  icon: z.string().optional().default(""),
  label: z.string().min(1, "카테고리명을 입력해 주세요."),
  value: z.string().optional().default(""),
  sortOrder: z.number().int().optional().default(0),
});
export type InsertEspressoSetup = z.infer<typeof insertEspressoSetupSchema>;

// 품목별 기간 집계 (주문/발주 공용)
export type ItemSummaryRow = {
  name: string;
  category: string;
  qty: number;
  amount: number;
};

// 품목별 집계 → 특정 품목의 거래처별 발주 내역 (드릴다운)
export type ItemDetailRow = {
  customerName: string; // 거래처명 (미지정이면 "(미지정)")
  purchaseNo: string;
  purchaseDate: string;
  qty: number;
  amount: number;
};

export type EcountSettings = typeof ecountSettings.$inferSelect;
export const ecountSettingsInputSchema = z.object({
  comCode: z.string().min(1, "회사코드 필수"),
  userId: z.string().min(1, "사용자 ID 필수"),
  apiCertKey: z.string().optional(), // 입력 안 하면 기존 유지
  zone: z.string().optional().default(""),
  warehouseCode: z.string().min(1, "창고코드 필수"),
  deliverFieldCode: z.string().optional().default(""),
  discountProductCode: z.string().optional().default(""),
  // 아래 스위치들은 기본값을 주지 않는다.
  // 기본값이 있으면 화면이 값을 안 보냈을 때 조용히 그 값으로 덮어써진다.
  //  - useTestEndpoint 가 true 로 되돌아가면 이후 전표가 전부 이카운트 테스트 서버로 새고,
  //  - autoSendSales 가 false 로 되돌아가면 판매전표 자동 전송이 조용히 꺼진다.
  // 값이 안 오면 저장 시 '기존 값 유지'로 처리한다(routes.ts).
  useTestEndpoint: z.boolean().optional(),
  autoSendSales: z.boolean().optional(),
  autoSendPayments: z.boolean().optional(),
  autoSendCustomer: z.boolean().optional(),
  autoSendProduct: z.boolean().optional(),
});
export type EcountSettingsInput = z.infer<typeof ecountSettingsInputSchema>;

export type EcountLog = typeof ecountLogs.$inferSelect;

export type EcountVerifyResult = {
  ok: boolean;
  zone?: string;
  results: Array<{ menu: string; ok: boolean; message: string; sample?: any }>;
  finishedAt: number;
};

// 거래처 원장 행 (주문 또는 입금)
export type LedgerRow =
  | {
      kind: "order";
      id: number;
      orderNo: string;
      date: number; // createdAt epoch ms
      debit: number; // 청구액 (+)
      credit: 0;
      balance: number;
      memo: string;
      status: string;
    }
  | {
      kind: "payment";
      id: number;
      date: number; // paidAt parsed to ms
      debit: 0;
      credit: number; // 입금액 (-)
      balance: number;
      method: string;
      memo: string;
    };

export type CustomerBalance = {
  customerId: number;
  businessName: string;
  managerName: string;
  phone: string;
  totalOrdered: number;
  totalPaid: number;
  balance: number; // 미수금 = totalOrdered - totalPaid
  lastOrderAt: number | null;
  lastPaidAt: string | null;
};

// 파싱된 헬퍼 타입
export type OrderItem = {
  productId: number;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
  amount: number;
};

export type PublicCustomer = Omit<Customer, "password">;

// 활동 로그 타입 (#10)
export type ActivityLog = typeof activityLogs.$inferSelect;
export type LogActivityInput = {
  actorUserId: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: Record<string, any>;
};

// ============================================================
// 직원 내부 관리 시스템 (출퇴근 · 레시피 · 생산일지 · 스케줄 · 공지)
// ============================================================

/** 직원 계정 — 거래처(customers)와 완전히 분리된 테이블 */
export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loginId: text("login_id").notNull(), // 로그인 아이디 (유니크 인덱스)
  password: text("password").notNull(),
  name: text("name").notNull(), // 이름
  phone: text("phone").notNull().default(""),
  position: text("position").notNull().default("바리스타"), // 직책/포지션
  staffRole: text("staff_role").notNull().default("staff"), // "staff" | "lead"
  active: integer("active").notNull().default(1),
  memo: text("memo").notNull().default(""),
  hireDate: text("hire_date").notNull().default(""), // 입사일 YYYY-MM-DD (연차 계산 기준)
  leaveEnabled: integer("leave_enabled").notNull().default(0), // 연차 제도 적용 여부
  lastLoginAt: integer("last_login_at"),
  createdAt: integer("created_at").notNull(),
});

/** 출퇴근 기록 — 직원 1명 / 하루 1행 */
export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull(),
  workDate: text("work_date").notNull(), // YYYY-MM-DD (KST 기준)
  clockInAt: integer("clock_in_at"), // epoch ms
  clockOutAt: integer("clock_out_at"), // epoch ms
  breakMinutes: integer("break_minutes").notNull().default(0),
  memo: text("memo").notNull().default(""),
  editedByAdmin: integer("edited_by_admin").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

/** 에스프레소 추출 레시피 기록 */
export const espressoLogs = sqliteTable("espresso_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""), // 기록 시점 이름 스냅샷
  logDate: text("log_date").notNull(), // YYYY-MM-DD
  beanName: text("bean_name").notNull().default(""),
  machine: text("machine").notNull().default(""),
  grindSetting: text("grind_setting").notNull().default(""),
  doseG: real("dose_g").notNull().default(0),
  yieldG: real("yield_g").notNull().default(0),
  timeSec: real("time_sec").notNull().default(0),
  waterTemp: real("water_temp").notNull().default(0), // 추출 온도
  tds: text("tds").notNull().default(""),
  rating: integer("rating").notNull().default(0), // 1~5, 0이면 미평가
  flavorTags: text("flavor_tags").notNull().default("[]"), // JSON string[]
  memo: text("memo").notNull().default(""),
  // 구글폼으로 받던 항목들 — 거래처 공개 페이지의 환경별 집계에 쓰인다
  roomTemp: real("room_temp").notNull().default(0), // 실내 온도(℃)
  roomHumidity: real("room_humidity").notNull().default(0), // 실내 습도(%)
  grinderTemp: real("grinder_temp").notNull().default(0), // 그라인더 온도(℃)
  roastDays: real("roast_days").notNull().default(0), // 로스팅 경과일 D+
  source: text("source").notNull().default("staff"), // staff | import(구글폼 이관분)
  createdAt: integer("created_at").notNull(),
});

/** 추출 기록에서 고르는 원두 — 구글폼에서 쓰던 목록을 그대로 옮겨 왔다 */
export const ESPRESSO_BEAN_PRESETS = ["코튼 블렌드", "실크 블렌드", "싱글 오리진", "디카페인"] as const;

/** 종합 평가 — 구글폼과 같은 5단계. 값이 클수록 좋다. */
export const ESPRESSO_RATINGS: { value: number; label: string }[] = [
  { value: 5, label: "매우 긍정" },
  { value: 4, label: "긍정" },
  { value: 3, label: "보통" },
  { value: 2, label: "부정" },
  { value: 1, label: "매우 부정" },
];

export function espressoRatingLabel(n: number): string {
  return ESPRESSO_RATINGS.find((r) => r.value === n)?.label ?? "";
}

/** 디저트 품목 마스터 — 관리자가 관리하고, 직원은 여기에 수량만 입력한다 */
export const dessertItems = sqliteTable("dessert_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("개"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

/** 디저트 생산일지 — (생산일, 품목) 하나에 한 줄 */
export const dessertLogs = sqliteTable("dessert_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().default(0),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  prodDate: text("prod_date").notNull(), // YYYY-MM-DD 생산일
  itemName: text("item_name").notNull(),
  qty: integer("qty").notNull().default(0),
  unit: text("unit").notNull().default("개"),
  discardQty: integer("discard_qty").notNull().default(0), // 폐기 수량
  // 생산과 폐기는 담당자가 다르므로(Baker / Close) 각각 따로 기록한다
  producedByName: text("produced_by_name").notNull().default(""),
  producedAt: integer("produced_at"),
  discardedByName: text("discarded_by_name").notNull().default(""),
  discardedAt: integer("discarded_at"),
  expiryDate: text("expiry_date").notNull().default(""), // 소비기한
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

/** 근무 스케줄 */
export const shifts = sqliteTable("shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull(),
  workDate: text("work_date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull().default("09:00"), // HH:MM
  endTime: text("end_time").notNull().default("18:00"),
  position: text("position").notNull().default(""), // 바 / 홀 / 베이킹 등
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

/** 공지사항 (직원 대상) */
export const announcements = sqliteTable("announcements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  pinned: integer("pinned").notNull().default(0),
  important: integer("important").notNull().default(0),
  authorName: text("author_name").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** 공지 읽음 표시 */
export const announcementReads = sqliteTable("announcement_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  announcementId: integer("announcement_id").notNull(),
  staffId: integer("staff_id").notNull(),
  readAt: integer("read_at").notNull(),
});

// ===== 상수 =====
export const STAFF_ROLES = ["staff", "lead", "owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  staff: "직원",
  lead: "매니저",
  owner: "대표",
};
/** 근무표에 자동으로 들어가는 대표 계정 */
export const OWNER_STAFF_LOGIN_ID = "owner";
export const OWNER_STAFF_NAME = "이강민";

/** 근무표의 고정 슬롯. Close 는 두 명이 들어가므로 줄이 두 개다. */
export const SHIFT_SLOTS = ["Open", "Baker", "Close", "Close2", "Part"] as const;
export type ShiftSlot = (typeof SHIFT_SLOTS)[number];
/** 화면에 보이는 이름 (Close2 도 'Close' 로 표시) */
export const SHIFT_SLOT_LABEL: Record<string, string> = {
  Open: "Open",
  Baker: "Baker",
  Close: "Close",
  Close2: "Close",
  Part: "Part",
};
export function slotLabel(slot: string): string {
  return SHIFT_SLOT_LABEL[slot] ?? slot;
}
/** 주간 최소 근무일 — 이보다 적으면 스케줄 화면에서 경고 표시 */
export const WEEKLY_TARGET_DAYS = 5;

// ===== zod 스키마 =====
export const staffLoginSchema = z.object({
  loginId: z.string().trim().min(1, "아이디를 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export const insertStaffSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(2, "아이디는 2자 이상이어야 합니다.")
    .max(30, "아이디는 30자 이하여야 합니다.")
    // 한글 이름을 그대로 아이디로 쓸 수 있게 허용. 공백과 특수문자만 막는다.
    .regex(
      /^[a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ._-]+$/,
      "아이디는 한글·영문·숫자와 . _ - 만 사용할 수 있습니다. (띄어쓰기 불가)",
    ),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  name: z.string().min(1, "이름을 입력해 주세요."),
  phone: z.string().optional().default(""),
  position: z.string().optional().default("바리스타"),
  staffRole: z.enum(STAFF_ROLES).optional().default("staff"),
  memo: z.string().optional().default(""),
  hireDate: z.string().optional().default(""),
  leaveEnabled: z.number().int().min(0).max(1).optional().default(0),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  position: z.string().optional(),
  staffRole: z.enum(STAFF_ROLES).optional(),
  active: z.number().int().min(0).max(1).optional(),
  memo: z.string().optional(),
  hireDate: z.string().optional(),
  leaveEnabled: z.number().int().min(0).max(1).optional(),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다.").optional(),
});

export const upsertAttendanceSchema = z.object({
  staffId: z.number().int().positive(),
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  clockInAt: z.number().int().nullable().optional(),
  clockOutAt: z.number().int().nullable().optional(),
  breakMinutes: z.number().int().min(0).optional().default(0),
  memo: z.string().optional().default(""),
});

export const insertEspressoLogSchema = z.object({
  logDate: z.string().optional(),
  beanName: z.string().min(1, "원두를 입력해 주세요."),
  machine: z.string().optional().default(""),
  grindSetting: z.string().optional().default(""),
  doseG: z.number().min(0).optional().default(0),
  yieldG: z.number().min(0).optional().default(0),
  timeSec: z.number().min(0).optional().default(0),
  waterTemp: z.number().min(0).optional().default(0),
  tds: z.string().optional().default(""),
  rating: z.number().int().min(0).max(5).optional().default(0),
  flavorTags: z.array(z.string()).optional().default([]),
  memo: z.string().optional().default(""),
  roomTemp: z.number().min(0).optional().default(0),
  roomHumidity: z.number().min(0).optional().default(0),
  grinderTemp: z.number().min(0).optional().default(0),
  roastDays: z.number().min(0).optional().default(0),
});

export const insertDessertItemSchema = z.object({
  name: z.string().trim().min(1, "품목명을 입력해 주세요.").max(40, "품목명이 너무 깁니다."),
  unit: z.string().trim().optional().default("개"),
});

export const updateDessertItemSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  unit: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
  active: z.number().int().min(0).max(1).optional(),
});

export const DESSERT_ENTRY_KINDS = ["produce", "discard"] as const;
export type DessertEntryKind = (typeof DESSERT_ENTRY_KINDS)[number];

/** 하루치 생산일지 저장 — 생산(Baker)과 폐기(Close)를 따로 저장한다 */
export const saveDessertLogsSchema = z.object({
  prodDate: z.string().optional(),
  kind: z.enum(DESSERT_ENTRY_KINDS),
  rows: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        value: z.number().int().min(0).max(100000),
      }),
    )
    .max(200),
});

export const insertShiftSchema = z.object({
  staffId: z.number().int().positive(),
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  position: z.string().optional().default(""),
  memo: z.string().optional().default(""),
});

/** 근무표 칸 지정 — (날짜, 슬롯) 하나에 직원 한 명 */
export const assignShiftSchema = z.object({
  staffId: z.number().int().positive(),
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  slot: z.enum(SHIFT_SLOTS),
});

export const clearShiftSchema = z.object({
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  slot: z.enum(SHIFT_SLOTS),
});

export const insertAnnouncementSchema = z.object({
  title: z.string().min(1, "제목을 입력해 주세요."),
  body: z.string().optional().default(""),
  pinned: z.number().int().min(0).max(1).optional().default(0),
  important: z.number().int().min(0).max(1).optional().default(0),
});

// ===== 타입 =====
export type Staff = typeof staff.$inferSelect;
export type PublicStaff = Omit<Staff, "password">;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type EspressoLog = typeof espressoLogs.$inferSelect;
export type InsertEspressoLog = z.infer<typeof insertEspressoLogSchema>;
export type DessertItem = typeof dessertItems.$inferSelect;
export type InsertDessertItem = z.infer<typeof insertDessertItemSchema>;
export type DessertLog = typeof dessertLogs.$inferSelect;
export type SaveDessertLogs = z.infer<typeof saveDessertLogsSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;

/** 직원 홈 화면 요약 */
export type StaffHome = {
  staff: PublicStaff;
  today: string; // YYYY-MM-DD
  attendance: Attendance | null;
  shift: Shift | null;
  tomorrow: string; // YYYY-MM-DD
  tomorrowShift: Shift | null;
  weekFrom: string; // 이번 주 월요일
  weekShifts: Shift[]; // 이번 주 내 근무 (월~일)
  leaveEnabled: boolean;
  leaveRemaining: number;
  leavePending: number;
  unreadAnnouncements: number;
  latestAnnouncement: Announcement | null;
  weekMinutes: number; // 이번 주 근무 분
  monthMinutes: number; // 이번 달 근무 분
  handoverCount: number; // 오늘 인수인계 건수
  handoverUnread: number; // 그중 내가 아직 확인하지 않은 건수
  /** 아직 확인하지 않은 인수인계 — 홈 맨 위에 그대로 보여준다 */
  handoverNew: { id: number; staffName: string; body: string; important: number; createdAt: number }[];
  prepTodo: number; // 오늘 남은 준비 작업
  prepTotal: number; // 오늘 준비 작업 전체
};

/** 근태 집계 (관리자) */
export type AttendanceSummaryRow = {
  staffId: number;
  name: string;
  position: string;
  days: number;
  minutes: number;
};

// ============================================================
// 연차(유급휴가)
// ============================================================

/** 연차 제도 시행일 — 이 날짜 이전 발생분은 부여하지 않는다 */
export const LEAVE_START_DATE = "2026-07-01";
/** 근속 n년차에 발생하는 연차 일수 (법 기준: 15일 + 최초 1년 초과 매 2년 1일 가산, 최대 25일) */
export function annualLeaveDays(years: number): number {
  if (years < 1) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

/** 연차 부여 이력 */
export const leaveGrants = sqliteTable("leave_grants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull(),
  kind: text("kind").notNull().default("manual"), // monthly | annual | manual
  days: real("days").notNull().default(0),
  grantDate: text("grant_date").notNull(), // 발생일 YYYY-MM-DD
  expiresAt: text("expires_at").notNull(), // 소멸일 YYYY-MM-DD (발생일 + 1년)
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

/** 연차 신청 */
export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull().default(0), // 0.5 단위
  halfDay: integer("half_day").notNull().default(0), // 1이면 반차
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  decidedByName: text("decided_by_name").notNull().default(""),
  decidedAt: integer("decided_at"),
  adminMemo: text("admin_memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "대기",
  approved: "승인",
  rejected: "반려",
};

export const LEAVE_GRANT_KIND_LABEL: Record<string, string> = {
  monthly: "월 발생",
  annual: "연차 발생",
  manual: "수동 부여",
};

// ===== zod =====
export const createLeaveRequestSchema = z
  .object({
    startDate: z.string().min(1, "시작일을 선택해 주세요."),
    endDate: z.string().min(1, "종료일을 선택해 주세요."),
    halfDay: z.boolean().optional().default(false),
    reason: z.string().max(200).optional().default(""),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "종료일이 시작일보다 빠릅니다." })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, {
    message: "반차는 하루만 선택할 수 있습니다.",
  });

export const decideLeaveRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminMemo: z.string().max(200).optional().default(""),
});

export const createLeaveGrantSchema = z.object({
  staffId: z.number().int().positive(),
  days: z.number().min(-100).max(100),
  grantDate: z.string().min(1, "발생일을 선택해 주세요."),
  memo: z.string().max(100).optional().default(""),
});

// ===== 타입 =====
export type LeaveGrant = typeof leaveGrants.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type CreateLeaveRequest = z.infer<typeof createLeaveRequestSchema>;

/** 직원 한 명의 연차 현황 */
export type LeaveBalance = {
  staffId: number;
  name: string;
  hireDate: string;
  granted: number; // 살아있는 부여 합계
  used: number; // 승인된 사용 합계
  pending: number; // 대기 중 신청 일수
  remaining: number; // 잔여
  expiringSoon: number; // 60일 내 소멸 예정 잔여
  expiringDate: string; // 가장 가까운 소멸일
};

// ============================================================
// 인수인계 · 준비 작업 (2026-08)
// ============================================================

/** 날짜별 인수인계. 근무 교대와 맞물리도록 workDate 에 묶는다. */
export const handovers = sqliteTable("handovers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workDate: text("work_date").notNull(),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull(),
  body: text("body").notNull(),
  important: integer("important").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** 인수인계 확인 기록 — 누가 읽었는지 이름으로 보여준다. */
export const handoverReads = sqliteTable("handover_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handoverId: integer("handover_id").notNull(),
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull(),
  readAt: integer("read_at").notNull(),
});

/**
 * 간헐적으로 하는 베이킹 준비 작업.
 * 휘낭시에 반죽, 에그타르트 필링, 카라멜소스 제작처럼 매일은 아니지만
 * 특정 날짜에 반드시 해야 하는 일들을 날짜에 걸어 두고 체크한다.
 */
export const prepTasks = sqliteTable("prep_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workDate: text("work_date").notNull(),
  title: text("title").notNull(),
  memo: text("memo").notNull().default(""),
  createdByStaffId: integer("created_by_staff_id").notNull().default(0),
  createdByName: text("created_by_name").notNull().default(""),
  done: integer("done").notNull().default(0),
  doneByStaffId: integer("done_by_staff_id").notNull().default(0),
  doneByName: text("done_by_name").notNull().default(""),
  doneAt: integer("done_at"),
  createdAt: integer("created_at").notNull(),
});

// ===== zod =====
export const createHandoverSchema = z.object({
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  body: z.string().trim().min(1, "내용을 입력해 주세요.").max(2000),
  important: z.boolean().optional().default(false),
});

export const createPrepTaskSchema = z.object({
  workDate: z.string().min(1, "날짜를 선택해 주세요."),
  title: z.string().trim().min(1, "할 일을 입력해 주세요.").max(100),
  memo: z.string().max(300).optional().default(""),
});

// ===== 타입 =====
export type Handover = typeof handovers.$inferSelect;
export type HandoverRead = typeof handoverReads.$inferSelect;
export type PrepTask = typeof prepTasks.$inferSelect;
export type CreateHandover = z.infer<typeof createHandoverSchema>;
export type CreatePrepTask = z.infer<typeof createPrepTaskSchema>;

/** 확인자 목록과 내 확인 여부를 붙인 인수인계 한 건 */
export type HandoverRow = Handover & {
  readers: { staffId: number; staffName: string; readAt: number }[];
  readByMe: boolean;
  mine: boolean;
};

/** 인수인계 하루치 */
export type HandoverDay = {
  date: string;
  rows: HandoverRow[];
  staffCount: number; // 전체 재직 인원 (확인 진행도 표시에 쓴다)
};

/** 준비 작업 하루치 */
export type PrepTaskDay = {
  date: string;
  rows: PrepTask[];
};

/**
 * 자주 하는 준비 작업 목록.
 * 매번 이름을 타이핑하지 않고 골라서 그날 할 일로 넣을 수 있게 미리 저장해 둔다.
 */
export const prepTaskPresets = sqliteTable("prep_task_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  memo: text("memo").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const insertPrepPresetSchema = z.object({
  title: z.string().trim().min(1, "이름을 입력해 주세요.").max(100),
  memo: z.string().max(300).optional().default(""),
});

export const updatePrepPresetSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  memo: z.string().max(300).optional(),
  active: z.number().int().min(0).max(1).optional(),
  sortOrder: z.number().int().optional(),
});

export type PrepTaskPreset = typeof prepTaskPresets.$inferSelect;
export type InsertPrepPreset = z.infer<typeof insertPrepPresetSchema>;

// ============================================================
// 거래처 팝업 공지 (2026-08)
// ============================================================

/**
 * 거래처가 로그인했을 때 화면 가운데 띄우는 안내.
 * 택배사 휴무처럼 '언제까지 주문하면 되는지'가 핵심이라, 본문과 별개로
 * 주문 마감·재개·배송 안내를 따로 두어 크게 보여준다.
 */
export const popupNotices = sqliteTable("popup_notices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  orderUntil: text("order_until").notNull().default(""), // 예: 8월 13일 (목)까지
  orderResume: text("order_resume").notNull().default(""), // 예: 8월 18일 (화)부터
  deliveryNote: text("delivery_note").notNull().default(""), // 예: 13일 주문분은 17~18일 도착 예정
  startDate: text("start_date").notNull().default(""), // 노출 시작 YYYY-MM-DD (비우면 즉시)
  endDate: text("end_date").notNull().default(""), // 노출 종료 YYYY-MM-DD (비우면 계속)
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertPopupNoticeSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80),
  body: z.string().max(1000).optional().default(""),
  orderUntil: z.string().max(60).optional().default(""),
  orderResume: z.string().max(60).optional().default(""),
  deliveryNote: z.string().max(200).optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  active: z.number().int().min(0).max(1).optional().default(1),
});

export const updatePopupNoticeSchema = insertPopupNoticeSchema.partial();

export type PopupNotice = typeof popupNotices.$inferSelect;
export type InsertPopupNotice = z.infer<typeof insertPopupNoticeSchema>;

// ============================================================
// 직원 발주 기록 (2026-08)
// 결제·주문은 지금처럼 각자 하고, 기록만 앱에 남긴다.
// 카카오톡에 적던 속도를 그대로 두기 위해 내용은 자유 글로 받는다.
// ============================================================

/** 자주 가는 구입처 — 탭 한 번으로 고르게 하기 위한 목록 */
export const supplyVendors = sqliteTable("supply_vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  memo: text("memo").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const supplyOrders = sqliteTable("supply_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderDate: text("order_date").notNull(), // YYYY-MM-DD
  vendor: text("vendor").notNull().default(""), // 구입처 (자유 문자열)
  body: text("body").notNull(), // 품목 등 내용 — 카톡에 쓰던 그대로
  amount: integer("amount").notNull().default(0), // 원, 0이면 미입력
  staffId: integer("staff_id").notNull(),
  staffName: text("staff_name").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ===== zod =====
export const insertSupplyOrderSchema = z.object({
  orderDate: z.string().min(1, "날짜를 선택해 주세요."),
  vendor: z.string().max(40).optional().default(""),
  body: z.string().trim().min(1, "내용을 입력해 주세요.").max(2000),
  amount: z.number().int().min(0).max(100_000_000).optional().default(0),
});

export const updateSupplyOrderSchema = insertSupplyOrderSchema.partial();

export const insertSupplyVendorSchema = z.object({
  name: z.string().trim().min(1, "구입처 이름을 입력해 주세요.").max(40),
  memo: z.string().max(200).optional().default(""),
});

export const updateSupplyVendorSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  memo: z.string().max(200).optional(),
  active: z.number().int().min(0).max(1).optional(),
  sortOrder: z.number().int().optional(),
});

// ===== 타입 =====
export type SupplyVendor = typeof supplyVendors.$inferSelect;
export type SupplyOrder = typeof supplyOrders.$inferSelect;
export type InsertSupplyOrder = z.infer<typeof insertSupplyOrderSchema>;
export type InsertSupplyVendor = z.infer<typeof insertSupplyVendorSchema>;

/** 관리자 집계 */
export type SupplyOrderSummary = {
  total: number; // 금액 합계
  count: number; // 건수
  byVendor: { vendor: string; count: number; amount: number }[];
  byStaff: { staffName: string; count: number; amount: number }[];
  byMonth: { month: string; count: number; amount: number }[];
};

// ============================================================
// 직원 일정 (2026-08)
// 디저트 단체 주문처럼 날짜에 걸어두고 다 같이 보는 일정.
// ============================================================

export const STAFF_EVENT_KINDS = ["order", "event", "etc"] as const;
export type StaffEventKind = (typeof STAFF_EVENT_KINDS)[number];
export const STAFF_EVENT_KIND_LABEL: Record<string, string> = {
  order: "단체 주문",
  event: "행사",
  etc: "기타",
};

export const staffEvents = sqliteTable("staff_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("order"), // order | event | etc
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(), // 하루짜리면 startDate 와 같다
  memo: text("memo").notNull().default(""),
  createdByStaffId: integer("created_by_staff_id").notNull().default(0),
  createdByName: text("created_by_name").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertStaffEventSchema = z
  .object({
    title: z.string().trim().min(1, "일정 이름을 입력해 주세요.").max(60),
    kind: z.enum(STAFF_EVENT_KINDS).optional().default("order"),
    startDate: z.string().min(1, "시작일을 선택해 주세요."),
    endDate: z.string().optional().default(""),
    memo: z.string().max(500).optional().default(""),
  })
  .transform((v) => ({ ...v, endDate: v.endDate || v.startDate }))
  .refine((v) => v.endDate >= v.startDate, { message: "종료일이 시작일보다 빠릅니다." });

export const updateStaffEventSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(STAFF_EVENT_KINDS).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  memo: z.string().max(500).optional(),
});

export type StaffEvent = typeof staffEvents.$inferSelect;
export type InsertStaffEvent = z.infer<typeof insertStaffEventSchema>;

/** 직원 홈의 2주 달력에 필요한 것들 */
export type StaffCalendar = {
  from: string; // 이번 주 월요일
  to: string; // 그로부터 13일 뒤
  today: string;
  events: StaffEvent[];
  prepTasks: PrepTask[];
  shifts: Shift[]; // 내 근무
};
