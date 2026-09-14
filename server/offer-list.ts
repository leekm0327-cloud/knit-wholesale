import type { Express, RequestHandler } from "express";
import type { Product, ProductCategory } from "@shared/schema";
import { buildOfferList } from "@shared/offer-list";

type OfferSource = { listProducts(): Promise<Product[]>; listProductCategories(): Promise<ProductCategory[]> };

export function registerOfferListRoutes(app: Express, requireAdmin: RequestHandler, source: OfferSource) {
  app.get("/api/admin/offer-list", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const [products, categories] = await Promise.all([source.listProducts(), source.listProductCategories()]);
      res.json(buildOfferList(products, categories));
    } catch {
      res.status(503).json({ message: "현재 상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  });
}
