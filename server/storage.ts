import { customers, products, orders } from "@shared/schema";
import type {
  Customer,
  InsertCustomer,
  Product,
  InsertProduct,
  Order,
  OrderItem,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, gt, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// 테이블 자동 생성 (마이그레이션 대용 — 데모/프리뷰 환경용)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  business_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  biz_reg_no TEXT NOT NULL DEFAULT '',
  tax_email TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT '',
  prices TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  customer_snapshot TEXT NOT NULL,
  items TEXT NOT NULL,
  supply_amount INTEGER NOT NULL,
  vat INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  desired_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  tracking_no TEXT NOT NULL DEFAULT '',
  admin_memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // customers
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  createCustomer(c: InsertCustomer & { password: string; role?: string }): Promise<Customer>;
  updateCustomer(id: number, patch: Partial<Customer>): Promise<Customer | undefined>;
  listCustomers(): Promise<Customer[]>;
  // products
  listProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(p: InsertProduct): Promise<Product>;
  updateProduct(id: number, patch: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  // orders
  createOrder(o: Omit<Order, "id">): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByNo(orderNo: string): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;
  listOrdersByCustomer(customerId: number): Promise<Order[]>;
  listOrdersSince(ts: number): Promise<Order[]>;
  updateOrder(id: number, patch: Partial<Order>): Promise<Order | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getCustomer(id: number) {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }
  async getCustomerByEmail(email: string) {
    return db.select().from(customers).where(eq(customers.email, email)).get();
  }
  async createCustomer(c: InsertCustomer & { password: string; role?: string }) {
    return db
      .insert(customers)
      .values({
        email: c.email,
        password: c.password,
        role: c.role ?? "customer",
        businessName: c.businessName,
        managerName: c.managerName,
        phone: c.phone,
        bizRegNo: c.bizRegNo ?? "",
        taxEmail: c.taxEmail ?? "",
        defaultAddress: c.defaultAddress ?? "",
        paymentMethod: c.paymentMethod ?? "transfer",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateCustomer(id: number, patch: Partial<Customer>) {
    return db.update(customers).set(patch).where(eq(customers.id, id)).returning().get();
  }
  async listCustomers() {
    return db
      .select()
      .from(customers)
      .where(eq(customers.role, "customer"))
      .orderBy(desc(customers.createdAt))
      .all();
  }

  async listProducts() {
    return db.select().from(products).orderBy(products.sortOrder).all();
  }
  async getProduct(id: number) {
    return db.select().from(products).where(eq(products.id, id)).get();
  }
  async createProduct(p: InsertProduct) {
    return db.insert(products).values(p).returning().get();
  }
  async updateProduct(id: number, patch: Partial<Product>) {
    return db.update(products).set(patch).where(eq(products.id, id)).returning().get();
  }
  async deleteProduct(id: number) {
    db.delete(products).where(eq(products.id, id)).run();
  }

  async createOrder(o: Omit<Order, "id">) {
    return db.insert(orders).values(o).returning().get();
  }
  async getOrder(id: number) {
    return db.select().from(orders).where(eq(orders.id, id)).get();
  }
  async getOrderByNo(orderNo: string) {
    return db.select().from(orders).where(eq(orders.orderNo, orderNo)).get();
  }
  async listOrders() {
    return db.select().from(orders).orderBy(desc(orders.createdAt)).all();
  }
  async listOrdersByCustomer(customerId: number) {
    return db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt))
      .all();
  }
  async listOrdersSince(ts: number) {
    return db
      .select()
      .from(orders)
      .where(gt(orders.createdAt, ts))
      .orderBy(desc(orders.createdAt))
      .all();
  }
  async updateOrder(id: number, patch: Partial<Order>) {
    return db.update(orders).set(patch).where(eq(orders.id, id)).returning().get();
  }
}

export const storage = new DatabaseStorage();

// ===== 시드 데이터 =====
export async function seed() {
  const existing = db.select().from(products).all();
  if (existing.length > 0) return; // 이미 시드됨

  const now = Date.now();
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // --- 관리자 ---
  const admin = await storage.createCustomer({
    email: "leekm0327@gmail.com",
    password: hash("knit2026"),
    role: "admin",
    businessName: "니트커피",
    managerName: "이강민",
    phone: "010-0000-0000",
    bizRegNo: "000-00-00000",
    taxEmail: "leekm0327@gmail.com",
    defaultAddress: "서울 중구 남산트라팰리스 1층 니트커피",
    paymentMethod: "transfer",
  });

  // --- 샘플 거래처 ---
  const c1 = await storage.createCustomer({
    email: "dowon@example.com",
    password: hash("sample123"),
    role: "customer",
    businessName: "도원 베이커리",
    managerName: "김도원",
    phone: "010-2345-6789",
    bizRegNo: "214-88-12345",
    taxEmail: "dowon.tax@example.com",
    defaultAddress: "서울 용산구 한강대로 99 도원베이커리",
    paymentMethod: "transfer",
  });
  const c2 = await storage.createCustomer({
    email: "huam@example.com",
    password: hash("sample123"),
    role: "customer",
    businessName: "후암 다이닝",
    managerName: "박후암",
    phone: "010-9876-5432",
    bizRegNo: "120-81-67890",
    taxEmail: "huam.tax@example.com",
    defaultAddress: "서울 용산구 후암로 45 후암다이닝",
    paymentMethod: "deferred",
  });

  // --- 상품 ---
  const productSeed: InsertProduct[] = [
    {
      name: "실크 블렌드",
      category: "blend",
      origin: "브라질 · 콜롬비아 · 에티오피아 / 부드러운 밀크초콜릿과 견과류 여운",
      prices: JSON.stringify({ "200": 12000, "500": 28000, "1000": 52000 }),
      available: 1,
      sortOrder: 1,
    },
    {
      name: "니트 블렌드",
      category: "blend",
      origin: "과테말라 · 콜롬비아 / 시그니처 블렌드, 캐러멜과 잘 익은 자두",
      prices: JSON.stringify({ "200": 12000, "500": 28000, "1000": 52000 }),
      available: 1,
      sortOrder: 2,
    },
    {
      name: "오피스 블렌드",
      category: "blend",
      origin: "브라질 · 베트남 / 가성비 데일리, 묵직한 바디와 다크초콜릿",
      prices: JSON.stringify({ "200": 10000, "500": 23000, "1000": 42000 }),
      available: 1,
      sortOrder: 3,
    },
    {
      name: "스위스워터 디카페인",
      category: "decaf",
      origin: "콜롬비아 / 스위스워터 공법, 깔끔한 단맛과 부드러운 산미",
      prices: JSON.stringify({ "200": 15000, "500": 35000, "1000": 65000 }),
      available: 1,
      sortOrder: 4,
    },
    {
      name: "에티오피아 부루사 내추럴",
      category: "single",
      origin: "에티오피아 예가체프 / 블루베리, 와인, 화사한 플로럴",
      prices: JSON.stringify({ "200": 18000, "500": 42000, "1000": 78000 }),
      available: 1,
      sortOrder: 5,
    },
    {
      name: "과테말라 아구아 티비아",
      category: "single",
      origin: "과테말라 안티구아 / 밀크초콜릿, 오렌지, 부드러운 바디",
      prices: JSON.stringify({ "200": 16000, "500": 38000, "1000": 70000 }),
      available: 1,
      sortOrder: 6,
    },
    {
      name: "콜롬비아 라 팔마 게이샤",
      category: "single",
      origin: "콜롬비아 우일라 / 게이샤, 자스민, 베르가못, 복숭아",
      prices: JSON.stringify({ "200": 22000, "500": 52000, "1000": 95000 }),
      available: 0,
      sortOrder: 7,
    },
    {
      name: "케냐 키리냐가 AA",
      category: "single",
      origin: "케냐 키리냐가 / 블랙커런트, 자몽, 토마토 같은 산미",
      prices: JSON.stringify({ "200": 19000, "500": 45000, "1000": 84000 }),
      available: 1,
      sortOrder: 8,
    },
    {
      name: "코스타리카 라 칸델리야",
      category: "single",
      origin: "코스타리카 타라주 / 허니 프로세스, 흑설탕, 살구, 깔끔한 단맛",
      prices: JSON.stringify({ "200": 17000, "500": 40000, "1000": 74000 }),
      available: 1,
      sortOrder: 9,
    },
  ];
  const createdProducts: Product[] = [];
  for (const p of productSeed) {
    createdProducts.push(await storage.createProduct(p));
  }

  // --- 샘플 과거 주문 ---
  const byName = (n: string) => createdProducts.find((p) => p.name === n)!;
  const priceOf = (p: Product, w: number) => (JSON.parse(p.prices) as Record<string, number>)[String(w)];

  function buildOrder(opts: {
    no: string;
    cust: Customer;
    lines: { p: Product; weight: number; qty: number }[];
    desiredDate: string;
    note: string;
    status: "pending" | "done";
    tracking?: string;
    daysAgo: number;
  }): Omit<Order, "id"> {
    const items: OrderItem[] = opts.lines.map((l) => {
      const unitPrice = priceOf(l.p, l.weight);
      return {
        productId: l.p.id,
        name: l.p.name,
        category: l.p.category,
        weight: l.weight,
        unitPrice,
        qty: l.qty,
        amount: unitPrice * l.qty,
      };
    });
    const supplyAmount = items.reduce((s, i) => s + i.amount, 0);
    const vat = Math.round(supplyAmount * 0.1);
    return {
      orderNo: opts.no,
      customerId: opts.cust.id,
      customerSnapshot: JSON.stringify({
        businessName: opts.cust.businessName,
        managerName: opts.cust.managerName,
        phone: opts.cust.phone,
        bizRegNo: opts.cust.bizRegNo,
        taxEmail: opts.cust.taxEmail,
        defaultAddress: opts.cust.defaultAddress,
        paymentMethod: opts.cust.paymentMethod,
      }),
      items: JSON.stringify(items),
      supplyAmount,
      vat,
      totalAmount: supplyAmount + vat,
      desiredDate: opts.desiredDate,
      note: opts.note,
      status: opts.status,
      trackingNo: opts.tracking ?? "",
      adminMemo: "",
      createdAt: now - opts.daysAgo * 86400000,
    };
  }

  await storage.createOrder(
    buildOrder({
      no: "KC-260605-1001",
      cust: c1,
      lines: [
        { p: byName("실크 블렌드"), weight: 1000, qty: 3 },
        { p: byName("니트 블렌드"), weight: 500, qty: 2 },
      ],
      desiredDate: "2026-06-09",
      note: "오전 중 배송 부탁드립니다.",
      status: "done",
      tracking: "1234-5678-9012",
      daysAgo: 19,
    }),
  );
  await storage.createOrder(
    buildOrder({
      no: "KC-260616-1002",
      cust: c2,
      lines: [
        { p: byName("스위스워터 디카페인"), weight: 1000, qty: 2 },
        { p: byName("에티오피아 부루사 내추럴"), weight: 500, qty: 3 },
        { p: byName("오피스 블렌드"), weight: 1000, qty: 5 },
      ],
      desiredDate: "2026-06-20",
      note: "디카페인은 분쇄 없이 홀빈으로 주세요.",
      status: "done",
      tracking: "9876-5432-1000",
      daysAgo: 8,
    }),
  );
  await storage.createOrder(
    buildOrder({
      no: "KC-260622-1003",
      cust: c1,
      lines: [
        { p: byName("케냐 키리냐가 AA"), weight: 500, qty: 4 },
        { p: byName("니트 블렌드"), weight: 1000, qty: 2 },
      ],
      desiredDate: "2026-06-26",
      note: "",
      status: "pending",
      daysAgo: 2,
    }),
  );

  console.log("[seed] 초기 데이터 생성 완료 (관리자/거래처2/상품9/주문3)");
}
