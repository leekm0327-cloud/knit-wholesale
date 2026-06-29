import type { Express, Request, Response, NextFunction } from "express";
import type { IStorage } from "./storage";
import {
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  POST_CATEGORIES,
  type PostCategory,
} from "@shared/schema";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }
  next();
}

function isAdminSession(req: Request): boolean {
  return req.session.role === "admin";
}

// 이미지 검증: 최대 10장, data:image/ 시작, 장당 7.5MB 이하
function validateImages(images: unknown): string | null {
  if (images === undefined) return null;
  if (!Array.isArray(images)) return "이미지는 배열이어야 합니다.";
  if (images.length > 10) return "이미지는 최대 10장까지 첨부할 수 있습니다.";
  for (const img of images) {
    if (typeof img !== "string") return "이미지는 문자열(base64)이어야 합니다.";
    if (!img.startsWith("data:image/")) return "이미지는 data:image/ 형식이어야 합니다.";
    if (img.length > 7_500_000) return "각 이미지 크기는 5MB 이하여야 합니다.";
  }
  return null;
}

async function getActor(req: Request, storage: IStorage) {
  const user = req.session.userId ? await storage.getCustomer(req.session.userId) : null;
  return {
    actorUserId: req.session.userId ?? 0,
    actorEmail: user?.email ?? "",
    actorRole: req.session.adminRole ?? "owner",
  };
}

export function registerBoardRoutes(app: Express, storage: IStorage) {
  app.get("/api/posts", requireAuth, async (req, res) => {
    const category = req.query.category as string | undefined;
    if (category && !POST_CATEGORIES.includes(category as PostCategory)) {
      return res.status(400).json({ message: "잘못된 카테고리" });
    }
    const posts = await storage.listPosts(category as PostCategory | undefined);
    res.json(posts);
  });

  app.get("/api/posts/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    await storage.incrementPostView(id);
    const comments = await storage.listComments(id);
    res.json({ ...post, comments });
  });

  app.post("/api/posts", requireAuth, async (req, res) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const imgErr = validateImages(parsed.data.images);
    if (imgErr) return res.status(400).json({ message: imgErr });

    const isAdmin = isAdminSession(req);
    // 공지는 관리자만 작성 가능
    if (parsed.data.category === "notice" && !isAdmin) {
      return res.status(403).json({ message: "공지는 관리자만 작성할 수 있습니다." });
    }
    // pinned는 관리자만 설정
    const pinned = isAdmin ? !!parsed.data.pinned : false;

    let authorId: number | null = null;
    let authorBusinessName = "관리자";
    let authorManagerName = "관리자";
    if (!isAdmin && req.session.userId) {
      authorId = req.session.userId;
      const customer = await storage.getCustomer(req.session.userId);
      if (customer) {
        authorBusinessName = customer.businessName;
        authorManagerName = customer.managerName;
      }
    } else if (isAdmin && req.session.userId) {
      // 관리자: 본인 이름 표시
      const adminUser = await storage.getCustomer(req.session.userId);
      if (adminUser) {
        authorManagerName = adminUser.managerName;
        authorBusinessName = adminUser.businessName;
      }
    }

    const created = await storage.createPost({
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      images: JSON.stringify(parsed.data.images ?? []),
      authorId,
      authorBusinessName,
      authorManagerName,
      isAdmin: isAdmin ? 1 : 0,
      pinned: pinned ? 1 : 0,
    });

    if (isAdmin) {
      const actor = await getActor(req, storage);
      await storage.logActivity({
        ...actor,
        action: "board_post.create",
        targetType: "board_post",
        targetId: String(created.id),
        summary: `게시글 '${created.title}' 작성 (${parsed.data.category})`,
      });
    }

    res.json(created);
  });

  app.patch("/api/posts/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });

    const isAdmin = isAdminSession(req);
    const isAuthor = !isAdmin && post.authorId === req.session.userId;
    // 관리자는 자기 글만 수정 가능 (관리자 게시판에서)
    const isAdminAuthor = isAdmin && (post.authorId === req.session.userId || post.authorId === null);
    if (!isAdminAuthor && !isAuthor) return res.status(403).json({ message: "수정 권한이 없습니다." });

    const parsed = updatePostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const imgErr = validateImages(parsed.data.images);
    if (imgErr) return res.status(400).json({ message: imgErr });

    const patch: any = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.body !== undefined) patch.body = parsed.data.body;
    if (parsed.data.images !== undefined) patch.images = JSON.stringify(parsed.data.images);
    // pinned는 관리자만 변경 가능
    if (parsed.data.pinned !== undefined && isAdmin) patch.pinned = parsed.data.pinned ? 1 : 0;
    patch.updatedAt = Date.now();

    const updated = await storage.updatePost(id, patch);
    res.json(updated);
  });

  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    const isAdmin = isAdminSession(req);
    const isAuthor = !isAdmin && post.authorId === req.session.userId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: "삭제 권한이 없습니다." });

    if (isAdmin) {
      const actor = await getActor(req, storage);
      await storage.logActivity({
        ...actor,
        action: "board_post.delete",
        targetType: "board_post",
        targetId: String(id),
        summary: `게시글 '${post.title}' 삭제`,
      });
    }

    await storage.deletePost(id);
    res.json({ ok: true });
  });

  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId)) return res.status(400).json({ message: "잘못된 ID" });
    const post = await storage.getPost(postId);
    if (!post) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });

    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });

    const isAdmin = isAdminSession(req);
    let authorId: number | null = null;
    let authorBusinessName = "관리자";
    let authorManagerName = "관리자";
    if (!isAdmin && req.session.userId) {
      authorId = req.session.userId;
      const customer = await storage.getCustomer(req.session.userId);
      if (customer) {
        authorBusinessName = customer.businessName;
        authorManagerName = customer.managerName;
      }
    } else if (isAdmin && req.session.userId) {
      const adminUser = await storage.getCustomer(req.session.userId);
      if (adminUser) {
        authorManagerName = adminUser.managerName;
        authorBusinessName = adminUser.businessName;
      }
    }

    const created = await storage.createComment({
      postId,
      body: parsed.data.body,
      authorId,
      authorBusinessName,
      authorManagerName,
      isAdmin: isAdmin ? 1 : 0,
    });
    res.json(created);
  });

  app.delete("/api/comments/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    // 관리자만 삭제 가능 (간단화)
    if (!isAdminSession(req)) {
      return res.status(403).json({ message: "관리자만 삭제할 수 있습니다." });
    }
    await storage.deleteComment(id);
    res.json({ ok: true });
  });
}
