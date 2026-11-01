import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import ts from "typescript";
import { transformSync } from "esbuild";
import * as schema from "../../../shared/schema";

// Actual dessert route handlers and permission middleware, isolated from all
// notifications, schedulers and other route registration side effects.
export async function dessertFixture(roleFor: (req: express.Request) => string) {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "knit-dessert-manager-"));
  const { storage, db, sqlite } = await import("../../../server/storage");
  const { staffStorage, kstToday, kstMonthStart } = await import("../../../server/staff-storage");
  const { initStaffAlerts } = await import("../../../server/staff-alerts");
  initStaffAlerts(sqlite); // local daily-submission table; no scheduler or sender
  const member = await staffStorage.createStaff(schema.insertStaffSchema.parse({ loginId: "fixture", password: "fixture-only", name: "가상 직원" }));
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const role = roleFor(req);
    (req as any).session = role === "owner" || role === "manager" ? { userId: 1, role: "admin", adminRole: role }
      : role === "staff" ? { staffId: member.id } : {};
    next();
  });
  const source = readFileSync(new URL("../../../server/staff-routes.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("staff-routes.ts", source, ts.ScriptTarget.Latest, true);
  const helperNames = ["requireAdmin", "requireOwner", "requireStaff", "safe", "badRequest", "rangeOf"];
  const helpers: string[] = [], routes: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && helperNames.includes(node.name?.text ?? "")) helpers.push(node.getText(ast));
    if (ts.isCallExpression(node) && /^app\.(get|post|patch|delete)$/.test(node.expression.getText(ast))
      && ts.isStringLiteral(node.arguments[0]) && /^\/api\/(admin\/)?staff\/dessert-/.test(node.arguments[0].text)) routes.push(node.getText(ast) + ";");
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(helpers.length, helperNames.length); assert(routes.length >= 9);
  const deps = { app, staffStorage, kstToday, kstMonthStart,
    insertDessertItemSchema: schema.insertDessertItemSchema, updateDessertItemSchema: schema.updateDessertItemSchema, saveDessertLogsSchema: schema.saveDessertLogsSchema };
  new Function(...Object.keys(deps), transformSync([...helpers, ...routes].join("\n"), { loader: "ts" }).code)(...Object.values(deps));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status || 500).json({ message: error.message }));
  return { app, storage, staffStorage, db, sqlite, member };
}
