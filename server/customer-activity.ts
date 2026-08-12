// 거래처 주문 활동 리포트 —
//  ① 정한 기간 동안 주문이 없는 거래처
//  ② 평소 주문 주기를 넘긴 거래처
// 읽기 전용 집계라 별도 테이블 없이 orders / customers 를 그대로 계산합니다.
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./storage";
import { customers, orders, productCategories } from "@shared/schema";

const KST = 9 * 60 * 60 * 1000;

function kstToday(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이의 일수 (to - from) */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** 주문이 실제로 일어난 날 — 관리자가 지정한 일자가 있으면 그것을 우선한다 */
function orderDate(o: { ecountDate: string; createdAt: number }): string {
  if (o.ecountDate && o.ecountDate.length >= 10) return o.ecountDate.slice(0, 10);
  return new Date(o.createdAt + KST).toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export type CustomerActivityRow = {
  customerId: number;
  businessName: string;
  managerName: string;
  phone: string;
  lastOrderDate: string; // 없으면 ""
  daysSince: number; // 마지막 주문 이후 경과일. 주문 이력이 없으면 -1
  orderCount: number; // 집계에 쓴 전체 주문 건수
  cycleDays: number; // 평소 주문 주기(중앙값). 계산 불가면 0
  overdue: boolean; // 주기를 넘겼는지
  overdueRatio: number; // 경과일 / 주기 (주기 없으면 0)
  recentDates: string[]; // 최근 주문일 최대 5개
};

export type CustomerActivityResult = {
  today: string;
  since: string; // 기준일 — 이 날 이후 주문이 없으면 '미주문'
  days: number;
  beanOnly: boolean;
  totalCustomers: number;
  rows: CustomerActivityRow[];
};

/**
 * @param days     이 일수 동안 주문이 없으면 목록에 넣는다
 * @param beanOnly 원두 카테고리가 포함된 주문만 '주문'으로 볼지 여부
 */
export function buildCustomerActivity(days: number, beanOnly: boolean): CustomerActivityResult {
  const today = kstToday();
  const since = addDays(today, -Math.max(1, days) + 1);

  // 원두 카테고리 키 모으기
  const beanKeys = new Set(
    db
      .select()
      .from(productCategories)
      .all()
      .filter((c) => c.isBean === 1)
      .map((c) => c.key),
  );

  const allCustomers = db
    .select()
    .from(customers)
    .all()
    .filter((c) => c.role !== "admin" && c.isStore !== 1);

  const allOrders = db.select().from(orders).all();

  // 거래처별 주문일 모으기
  const datesByCustomer = new Map<number, string[]>();
  for (const o of allOrders) {
    if (o.status === "cancelled") continue;
    if (o.isSample === 1) continue; // 무료 샘플은 주문으로 보지 않는다
    if (o.isStoreOrder === 1) continue; // 매장 내부 발주 제외

    if (beanOnly) {
      let hasBean = false;
      try {
        const items = JSON.parse(o.items) as { category?: string }[];
        // 카테고리가 비어 있는 옛 주문은 원두로 본다 — 주문한 곳을 안 했다고 잘못 띄우지 않기 위해
        hasBean = items.some((it) => !it.category || beanKeys.has(it.category));
      } catch {
        hasBean = true;
      }
      if (!hasBean) continue;
    }

    const arr = datesByCustomer.get(o.customerId) ?? [];
    arr.push(orderDate(o));
    datesByCustomer.set(o.customerId, arr);
  }

  const rows: CustomerActivityRow[] = [];
  for (const c of allCustomers) {
    const dates = (datesByCustomer.get(c.id) ?? []).slice().sort(); // 오름차순
    const uniq = Array.from(new Set(dates)); // 같은 날 여러 건은 한 번으로
    const last = uniq[uniq.length - 1] ?? "";
    const daysSince = last ? daysBetween(last, today) : -1;

    // 평소 주기 — 최근 8건까지의 간격 중앙값. 간격이 2개 이상이어야 신뢰한다.
    const recent = uniq.slice(-8);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) gaps.push(daysBetween(recent[i - 1], recent[i]));
    const cycleDays = gaps.length >= 2 ? median(gaps) : 0;

    // 주기 초과 판정 — 주기의 1.5배를 넘고, 최소 3일 이상 더 지난 경우만
    const overdue =
      cycleDays > 0 && daysSince > 0 && daysSince > cycleDays * 1.5 && daysSince >= cycleDays + 3;

    rows.push({
      customerId: c.id,
      businessName: c.businessName,
      managerName: c.managerName,
      phone: c.phone,
      lastOrderDate: last,
      daysSince,
      orderCount: uniq.length,
      cycleDays,
      overdue,
      overdueRatio: cycleDays > 0 && daysSince > 0 ? Math.round((daysSince / cycleDays) * 10) / 10 : 0,
      recentDates: uniq.slice(-5).reverse(),
    });
  }

  // 기간 안에 주문이 없는 곳만 남긴다 (주문 이력이 아예 없는 곳도 포함)
  const inactive = rows.filter((r) => !r.lastOrderDate || r.lastOrderDate < since);

  // 오래 비어 있는 곳부터. 이력이 없는 곳은 맨 뒤로.
  inactive.sort((a, b) => {
    if (a.daysSince < 0 && b.daysSince < 0) return a.businessName.localeCompare(b.businessName);
    if (a.daysSince < 0) return 1;
    if (b.daysSince < 0) return -1;
    return b.daysSince - a.daysSince;
  });

  return {
    today,
    since,
    days,
    beanOnly,
    totalCustomers: allCustomers.length,
    rows: inactive,
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  next();
}

export function registerCustomerActivityRoutes(app: Express) {
  app.get("/api/admin/customer-activity", requireAdmin, (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
    const beanOnly = req.query.beanOnly !== "0";
    try {
      res.json(buildCustomerActivity(days, beanOnly));
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "집계에 실패했습니다." });
    }
  });
}
