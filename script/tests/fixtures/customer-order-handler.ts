import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { transformSync } from "esbuild";
import { updateOrderItemsSchema } from "../../../shared/schema";

// Exercise the production customer PATCH handler and price calculation against
// disposable storage without importing routes.ts (which starts integrations).
export function customerOrderHandler(storage: any) {
  const source = readFileSync(new URL("../../../server/routes.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
  const snippets: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "recomputeOrderItems") {
      snippets.recompute = node.getText(ast);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "app.patch"
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/api/orders/:id") {
      snippets.patch = node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(snippets.recompute && snippets.patch, "Production customer order handler must exist");
  let handler: any;
  const app = { patch: (_path: string, _auth: unknown, fn: any) => { handler = fn; } };
  const code = transformSync(`${snippets.recompute}\n${snippets.patch};`, { loader: "ts" }).code;
  new Function("app", "requireAuth", "storage", "updateOrderItemsSchema", "getActor", code)(
    app, () => {}, storage, updateOrderItemsSchema,
    async () => ({ actorUserId: 0, actorName: "fixture", actorEmail: "fixture@example.invalid", actorRole: "customer" }),
  );
  return handler;
}
