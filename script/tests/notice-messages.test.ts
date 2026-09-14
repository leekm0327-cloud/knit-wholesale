import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import express from "express";
import { normalizeNoticePhone } from "../../shared/notice-message";

const reopen = process.argv[2] === "--reopen";
const dir = reopen ? process.argv[3] : mkdtempSync(path.join(tmpdir(), "knit-notice-message-test-"));
assert.ok(path.basename(dir).startsWith("knit-notice-message-test-"));
process.env.DATA_DIR = dir;
process.env.SOLAPI_API_KEY = "test-key-never-real";
process.env.SOLAPI_API_SECRET = "test-secret-never-real";
let mode = "success", rate: number | undefined = 25, available = 100000, requestCount = 0;
let fakeNow = Date.parse("2026-09-14T10:00:00+09:00");
const payloads: any[] = [], uploads: any[] = [];
const messages = new Map<string, any>();
const mock = express();
mock.use(express.json({ limit: "8mb" }));
mock.get("/kakao/v2/channels/:id", (req, res) => res.json({ channelId: req.params.id, channelName: "테스트 카카오 채널" }));
mock.get("/pricing/v1/messaging/countries", (_req, res) => res.json([{ countryId: "82", serviceMethod: "MT", bms_free: rate }]));
mock.get("/cash/v1/balance", (_req, res) => res.json({ balance: available, point: 0 }));
mock.post("/storage/v1/files", (req, res) => {
  uploads.push(req.body);
  if (mode === "bad-image") return res.status(400).json({ errorMessage: "이미지 오류" });
  res.json({ fileId: "image-id" });
});
mock.post("/messages/v4/send-many/detail", (req, res) => {
  requestCount++; payloads.push(req.body);
  if (mode === "reject") return res.status(400).json({ errorMessage: "채널 이용 설정 필요" });
  if (mode === "timeout") return; // No response: send may have reached the provider.
  if (mode === "server-error") return res.status(503).json({ errorMessage: "unavailable" });
  if (mode === "malformed") return res.json({});
  const groupId = `group-${requestCount}`;
  const list: any[] = [], failed: any[] = [];
  req.body.messages.forEach((m: any, index: number) => {
    const row = { ...m, messageId: `msg-${requestCount}-${index}`, groupId, statusCode: mode === "partial" && index === 1 ? "3021" : "2000", statusMessage: "테스트 응답" };
    messages.set(row.messageId, row);
    if (mode === "partial" && index === 1) failed.push(row); else list.push(row);
  });
  res.json({ groupInfo: { groupId }, messageList: Object.fromEntries(list.map(r => [r.messageId, r])), failedMessageList: failed });
});
mock.get("/messages/v4/list", (req, res) => {
  const ids = req.query.messageIds ? JSON.parse(String(req.query.messageIds)) : [];
  const list = Array.from(messages.values()).filter(m => req.query.groupId ? m.groupId === req.query.groupId : ids.includes(m.messageId));
  res.json({ messageList: Object.fromEntries(list.map(m => [m.messageId, m])), nextKey: null });
});
const upstream = mock.listen(0, "127.0.0.1");
await new Promise<void>(resolve => upstream.once("listening", resolve));
process.env.SOLAPI_API_HOST = `http://127.0.0.1:${(upstream.address() as any).port}`;
const { sqlite } = await import("../../server/storage");
const { registerPopupNoticeRoutes } = await import("../../server/popup-notice");
const { registerNoticeMessageRoutes, validateNoticeMessageImage, isNoticeSendTime } = await import("../../server/notice-message");
if (reopen) {
  const claim = sqlite.prepare("SELECT COUNT(*) AS n FROM notice_message_claims").get() as any;
  assert.ok(claim.n > 0, "unknown/accepted claims survive restart");
  sqlite.close(); upstream.close();
  console.log("PASS restart: persisted batches and duplicate reservations preserved.");
  process.exit(0);
}
sqlite.prepare("UPDATE alimtalk_settings SET enabled=1, pf_id='test-channel', test_phone='01099990000' WHERE id=1").run();
const insert = sqlite.prepare("INSERT INTO customers(id, email, password, role, business_name, manager_name, phone, is_store, created_at) VALUES(?, ?, 'unused', ?, ?, '담당자', ?, ?, 0)");
for (const [id, name, phone, role, store] of [
  [11, "가 커피", "01011110001", "customer", 0], [12, "나 커피", "01011110002", "customer", 0],
  [13, "중복 번호", "010-1111-0001", "customer", 0], [14, "수신거부", "01011110004", "customer", 0],
  [15, "일반 전화", "0212345678", "customer", 0], [16, "대표", "01011110006", "admin", 0],
  [17, "내부 매장", "01011110007", "customer", 1], [18, "동일 번호 거부", "01011110004", "customer", 0],
  [19, "다 커피", "01011110009", "customer", 0],
] as const) insert.run(id, `${id}@test.invalid`, role, name, phone, store);
sqlite.prepare("INSERT INTO alimtalk_optout(customer_id, off, updated_at) VALUES(14,1,0)").run();
sqlite.prepare(`INSERT INTO orders(order_no,customer_id,customer_snapshot,items,supply_amount,vat,total_amount,created_at,status,is_sample,is_store_order)
  VALUES('test-order',11,'{}','[]',1,0,1,?,'done',0,0)`).run(fakeNow);
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=";
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req: any, _res, next) => {
  const role = req.headers["x-test-role"] || "owner";
  req.session = role === "anonymous" ? {} : { userId: req.headers["x-test-owner"] === "other" ? 2 : 1, role: role === "customer" ? "customer" : "admin", adminRole: role };
  next();
});
registerPopupNoticeRoutes(app);
registerNoticeMessageRoutes(app, { now: () => fakeNow, timeoutMs: 150 });
app.use((e: any, _req: any, res: any, _next: any) => { console.error(e); res.status(500).json({ message: e.message }); });
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const root = `http://127.0.0.1:${(server.address() as any).port}`;
const base = "/api/admin/notice-messages";
const call = (url: string, method = "GET", body?: any, role = "owner", otherOwner = false) => fetch(root + url, {
  method, headers: { "Content-Type": "application/json", "x-test-role": role, "x-test-owner": otherOwner ? "other" : "self" }, body: body ? JSON.stringify(body) : undefined,
});
const ok = async (response: Promise<Response>) => {
  const r = await response, body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body;
};
const notice = () => ok(call("/api/admin/popup-notices", "POST", { title: "배송 일정", body: "테스트 공지", imageUrl: image }));
const prepare = (n: any, ids = [11], extra: any = {}) => ok(call(`${base}/prepare`, "POST", { noticeId: n.id, text: "니트커피 배송 안내", includeImage: false, customerIds: ids, mode: "live", ...extra }));
const send = (b: any) => ok(call(`${base}/${b.id}/send`, "POST", { confirmed: true }));
try {
  const n = await notice();
  for (const role of ["anonymous", "customer", "manager"]) {
    for (const [url, method, body] of [[`${base}?noticeId=${n.id}`, "GET"], [`${base}/prepare`, "POST", {}], [`${base}/bad/send`, "POST", { confirmed: true }], [`${base}/bad/refresh`, "POST", {}], [`${base}/bad`, "GET"]] as const)
      assert.equal((await call(url, method, body, role)).status, 403);
  }
  let ctx = await ok(call(`${base}?noticeId=${n.id}`));
  assert.equal(ctx.recipients.length, 7);
  assert.equal(ctx.recipients.find((c: any) => c.id === 11).recent, true);
  assert.equal(ctx.recipients.find((c: any) => c.id === 18).reason, "수신거부");
  assert.ok(ctx.recipients.find((c: any) => c.id === 15).reason);
  const b = await prepare(n, [11, 12, 13, 14, 15, 18]);
  assert.equal(b.recipients.length, 2); assert.equal(b.exclusions.length, 4); assert.equal(b.total, 50);
  assert.equal(requestCount, 0, "save/prepare never send"); assert.equal(uploads.length, 0);
  assert.equal((await call(`${base}/${b.id}/send`, "POST", { confirmed: false })).status, 400);
  assert.equal((await call(`${base}/${b.id}/send`, "POST", { confirmed: true }, "owner", true)).status, 403);
  const [a, replay] = await Promise.all([send(b), send(b)]);
  assert.equal(requestCount, 1, "simultaneous duplicate clicks send once");
  assert.equal(a.id, replay.id);
  assert.equal((await ok(call(`${base}/${b.id}`))).recipients[0].status, "accepted");
  assert.equal(payloads[0].messages[0].kakaoOptions.bms.targeting, "I");
  assert.equal(payloads[0].messages[0].type, "BMS_FREE");
  assert.equal(payloads[0].messages[0].kakaoOptions.disableSms, true);
  assert.equal(payloads[0].messages[0].from, undefined);
  assert.equal(payloads[0].allowDuplicates, false);
  assert.equal(payloads[0].messages[0].kakaoOptions.bms.buttons[0].linkMobile, "https://wholesale.knitcoffee.co.kr/#/catalog");
  await send(b); assert.equal(requestCount, 1);
  assert.equal((await call(`${base}/prepare`, "POST", { noticeId: n.id, text: "변경된 문구", includeImage: false, customerIds: [11,13], mode: "live" })).status, 400);
  for (const m of messages.values()) m.statusCode = m.to.endsWith("2") ? "3021" : "4000";
  const delivery = await ok(call(`${base}/${b.id}/refresh`, "POST", {}));
  assert.equal(delivery.recipients.find((r: any) => r.customerId === 11).status, "delivered");
  assert.equal(delivery.recipients.find((r: any) => r.customerId === 12).status, "failed");
  assert.equal(delivery.status, "complete");
  const retry = await prepare(n, [12]); assert.equal(retry.recipients.length, 1);
  console.log("PASS owner guards, audience filters, phone dedup/optouts, prepare-only, confirmation, concurrent/idempotent send, accurate delivery states, failed recipient retry.");

  // Same customer/notice in two independently prepared batches must never send twice.
  const concurrentNotice = await notice();
  const [b1, b2] = await Promise.all([prepare(concurrentNotice), prepare(concurrentNotice)]);
  const countBefore = requestCount;
  const rr = await Promise.all([call(`${base}/${b1.id}/send`, "POST", { confirmed: true }), call(`${base}/${b2.id}/send`, "POST", { confirmed: true })]);
  assert.deepEqual(rr.map(r => r.status).sort(), [200,409]); assert.equal(requestCount, countBefore + 1);

  // Stale quotes are rejected before a send call; recipient changes are revalidated.
  for (const change of ["phone", "optout", "notice", "channel", "price", "expiry", "balance", "disabled", "hours"]) {
    const target = await notice(), q = await prepare(target, [19]);
    const originalTime = fakeNow, before = requestCount;
    if (change === "phone") sqlite.prepare("UPDATE customers SET phone='01011119999' WHERE id=19").run();
    if (change === "optout") sqlite.prepare("INSERT INTO alimtalk_optout(customer_id,off,updated_at) VALUES(19,1,0)").run();
    if (change === "notice") sqlite.prepare("UPDATE popup_notices SET updated_at=updated_at+1 WHERE id=?").run(target.id);
    if (change === "channel") sqlite.prepare("UPDATE alimtalk_settings SET pf_id='different'").run();
    if (change === "price") rate = 26;
    if (change === "expiry") fakeNow += 11 * 60000;
    if (change === "balance") available = 0;
    if (change === "disabled") sqlite.prepare("UPDATE alimtalk_settings SET enabled=0").run();
    if (change === "hours") fakeNow = Date.parse("2026-09-14T20:50:00+09:00");
    const result = await call(`${base}/${q.id}/send`, "POST", { confirmed: true });
    assert.ok([400,409].includes(result.status), `${change}: ${await result.text()}`);
    assert.equal(requestCount, before, `${change} must not send`);
    fakeNow = originalTime; rate = 25; available = 100000;
    sqlite.prepare("UPDATE alimtalk_settings SET enabled=1,pf_id='test-channel'").run();
    sqlite.prepare("UPDATE customers SET phone='01011110009' WHERE id=19").run();
    sqlite.prepare("DELETE FROM alimtalk_optout WHERE customer_id=19").run();
  }
  rate = undefined;
  assert.equal((await call(`${base}/prepare`, "POST", { noticeId: n.id, text: "내용", includeImage: false, customerIds: [19], mode: "live" })).status, 400);
  rate = 25;
  console.log("PASS independently prepared duplicates, stale recipients/optouts/notice/channel/price, expiry, insufficient balance, disabled sending, daytime guard and unknown-price failure.");

  const imageNotice = await notice();
  const imageBatch = await prepare(imageNotice, [], { mode: "test", includeImage: true });
  assert.equal(imageBatch.recipients[0].phone, "01099990000");
  await send(imageBatch);
  assert.equal(uploads.at(-1).type, "BMS"); assert.ok(!uploads.at(-1).file.startsWith("data:"));
  assert.equal(payloads.at(-1).messages[0].kakaoOptions.bms.imageId, "image-id");
  assert.equal((await prepare(imageNotice, [11])).recipients.length, 1, "test does not claim live recipients");
  assert.equal((await call(`${base}/prepare`, "POST", { noticeId: n.id, text: "a".repeat(401), includeImage: true, customerIds: [19], mode: "live" })).status, 400);
  assert.equal((await call(`${base}/prepare`, "POST", { noticeId: n.id, text: "내용", includeImage: false, customerIds: [19], mode: "live", targeting: "M" })).status, 400);
  assert.equal((await call(`${base}/prepare`, "POST", { noticeId: n.id, text: "내용", includeImage: false, customerIds: [19], mode: "test" })).status, 400);
  for (const bad of ["https://example.com/image.png", "data:image/png;base64,YWJjZA==", "data:image/gif;base64,R0lGODlh"]) assert.throws(() => validateNoticeMessageImage(bad));
  const longPng = Buffer.from(image.split(",")[1], "base64"); longPng.writeUInt32BE(10, 16);
  assert.throws(() => validateNoticeMessageImage(`data:image/png;base64,${longPng.toString("base64")}`));
  assert.equal(normalizeNoticePhone("+82 10-1111-0001"), "01011110001");
  assert.equal(normalizeNoticePhone("01011110001,01011110002"), "");
  assert.equal(isNoticeSendTime(Date.parse("2026-09-14T08:00:00+09:00")), true);
  assert.equal(isNoticeSendTime(Date.parse("2026-09-14T07:59:59+09:00")), false);
  console.log("PASS image upload contract, local validation, fixed test number, no test/live mixing, message limits and fixed targeting.");

  for (const scenario of ["partial", "reject", "timeout", "server-error", "malformed", "bad-image"]) {
    mode = scenario;
    const target = await notice(), q = await prepare(target, [11,12], { includeImage: scenario === "bad-image" });
    const before = requestCount;
    const result = await send(q);
    if (scenario === "partial") assert.deepEqual(result.recipients.map((r: any) => r.status).sort(), ["accepted","failed"]);
    else if (scenario === "reject" || scenario === "bad-image") assert.ok(result.recipients.every((r: any) => r.status === "failed"));
    else {
      assert.equal(result.status, "unknown");
      assert.ok(result.recipients.every((r: any) => r.status === "unknown"));
      assert.equal((await call(`${base}/prepare`, "POST", { noticeId: target.id, text: "수정", includeImage: false, customerIds: [11], mode: "live" })).status, 400);
    }
    await send(q);
    assert.equal(requestCount, before + (scenario === "bad-image" ? 0 : 1), `${scenario} replay must not resend`);
  }
  mode = "success";
  const interrupted = await prepare(await notice(), [19]);
  sqlite.prepare("UPDATE notice_message_batches SET status='sending',updated_at=? WHERE id=?").run(fakeNow - 180000, interrupted.id);
  sqlite.prepare("INSERT INTO notice_message_claims(notice_id,phone,batch_id) VALUES(?,?,?)").run(interrupted.noticeId, interrupted.recipients[0].phone, interrupted.id);
  const recovered = await ok(call(`${base}/${interrupted.id}`));
  assert.equal(recovered.status, "unknown");
  assert.equal(recovered.recipients[0].status, "unknown");
  const beforeRecovery = requestCount;
  await send(recovered); assert.equal(requestCount, beforeRecovery, "stalled jobs must not replay");
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], "--reopen", dir], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  console.log(child.stdout.trim());
  console.log("PASS partial rejection, pre-dispatch failure, ambiguous/network/5xx/malformed responses reserve recipients without auto retry.");
  console.log("ALL NOTICE MESSAGE TESTS PASSED. No real SOLAPI or customer sends.");
} finally {
  server.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => upstream.close(() => r()))]);
  sqlite.close(); rmSync(dir, { recursive: true, force: true });
}
