import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { sign, verify } from "hono/jwt";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const adminRouter = new Hono();

// JWT secret - in production, use a proper secret from env
const JWT_SECRET = process.env.JWT_SECRET || "admin-secret-key-change-in-production";

// Hardcoded admin credentials
const ADMIN_USERNAME = "parthajy";
const ADMIN_EMAIL = "parthajy@gmail.com";

// Helper to hash password (simple for demo - use bcrypt in production)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "salt-collaborate-admin");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

// Initialize admin user on first request if not exists
async function ensureAdminExists() {
  const existingAdmin = await prisma.admin.findUnique({
    where: { username: ADMIN_USERNAME },
  });

  if (!existingAdmin) {
    // Create admin with default password "admin123" - user should change via forgot password
    const defaultPasswordHash = await hashPassword("admin123");
    await prisma.admin.create({
      data: {
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        passwordHash: defaultPasswordHash,
      },
    });
    console.log("Admin user created with default password: admin123");
  }
}

// Auth middleware
async function authMiddleware(c: any, next: () => Promise<void>) {
  const token = getCookie(c, "admin_token");

  if (!token) {
    return c.json({ error: { message: "Unauthorized" } }, 401);
  }

  try {
    const payload = await verify(token, JWT_SECRET);
    c.set("admin", payload);
    await next();
  } catch {
    return c.json({ error: { message: "Invalid token" } }, 401);
  }
}

// Login schema
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Login endpoint
adminRouter.post("/login", async (c) => {
  await ensureAdminExists();

  const body = await c.req.json();
  const result = loginSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: { message: "Invalid credentials" } }, 400);
  }

  const { username, password } = result.data;

  const admin = await prisma.admin.findUnique({
    where: { username },
  });

  if (!admin) {
    return c.json({ error: { message: "Invalid credentials" } }, 401);
  }

  const isValid = await verifyPassword(password, admin.passwordHash);

  if (!isValid) {
    return c.json({ error: { message: "Invalid credentials" } }, 401);
  }

  // Create JWT token
  const token = await sign(
    {
      id: admin.id,
      username: admin.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    },
    JWT_SECRET
  );

  // Set cookie - use secure when on HTTPS (vibecode always uses HTTPS proxy)
  const isSecure = !!process.env.BASE_URL?.startsWith("https://");
  setCookie(c, "admin_token", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "None" : "Lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return c.json({ data: { success: true, username: admin.username } });
});

// Logout endpoint
adminRouter.post("/logout", async (c) => {
  deleteCookie(c, "admin_token", { path: "/" });
  return c.json({ data: { success: true } });
});

// Check auth status
adminRouter.get("/me", async (c) => {
  const token = getCookie(c, "admin_token");

  if (!token) {
    return c.json({ data: { authenticated: false } });
  }

  try {
    const payload = await verify(token, JWT_SECRET);
    return c.json({ data: { authenticated: true, username: payload.username } });
  } catch {
    return c.json({ data: { authenticated: false } });
  }
});

// Forgot password - send reset token (simulated - in production, send email)
adminRouter.post("/forgot-password", async (c) => {
  await ensureAdminExists();

  const body = await c.req.json();
  const { email } = body;

  if (email !== ADMIN_EMAIL) {
    // Don't reveal if email exists
    return c.json({ data: { message: "If the email exists, a reset link has been sent." } });
  }

  // Generate reset token
  const resetToken = crypto.randomUUID();
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.admin.update({
    where: { email: ADMIN_EMAIL },
    data: { resetToken, resetTokenExpiry },
  });

  // In a real app, send email here. For now, log and return token in response
  console.log(`Password reset token for ${ADMIN_EMAIL}: ${resetToken}`);

  return c.json({
    data: {
      message: "If the email exists, a reset link has been sent.",
      // For demo purposes, include the token. Remove in production!
      resetToken,
      resetUrl: `/partha?reset=${resetToken}`,
    },
  });
});

// Reset password with token
adminRouter.post("/reset-password", async (c) => {
  const body = await c.req.json();
  const { token, newPassword } = body;

  if (!token || !newPassword || newPassword.length < 6) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  const admin = await prisma.admin.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!admin) {
    return c.json({ error: { message: "Invalid or expired reset token" } }, 400);
  }

  const newPasswordHash = await hashPassword(newPassword);

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passwordHash: newPasswordHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return c.json({ data: { message: "Password reset successfully" } });
});

// Protected routes below
adminRouter.use("/stats/*", authMiddleware);
adminRouter.use("/spaces/*", authMiddleware);
adminRouter.use("/features/*", authMiddleware);

// Get dashboard stats
adminRouter.get("/stats", authMiddleware, async (c) => {
  const [totalSpaces, activeSpaces, blockedSpaces, totalItems, featureRequests] = await Promise.all([
    prisma.space.count(),
    prisma.space.count({ where: { blocked: false } }),
    prisma.space.count({ where: { blocked: true } }),
    prisma.canvasItem.count(),
    prisma.featureRequest.count(),
  ]);

  // Get spaces with most activity (most items)
  const topSpaces = await prisma.space.findMany({
    take: 10,
    orderBy: { items: { _count: "desc" } },
    include: { _count: { select: { items: true } } },
  });

  // Get recent activity
  const recentItems = await prisma.canvasItem.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: { space: { select: { slug: true } } },
  });

  // Get feature request stats
  const featureStats = await prisma.featureRequest.groupBy({
    by: ["status"],
    _count: true,
  });

  return c.json({
    data: {
      totalSpaces,
      activeSpaces,
      blockedSpaces,
      totalItems,
      totalFeatureRequests: featureRequests,
      topSpaces: topSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        itemCount: s._count.items,
        blocked: s.blocked,
        createdAt: s.createdAt,
      })),
      recentActivity: recentItems.map((item) => ({
        id: item.id,
        type: item.type,
        spaceSlug: item.space.slug,
        createdAt: item.createdAt,
      })),
      featureStats: featureStats.reduce(
        (acc, curr) => ({ ...acc, [curr.status]: curr._count }),
        {} as Record<string, number>
      ),
    },
  });
});

// Get all spaces with pagination
adminRouter.get("/spaces", authMiddleware, async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const search = c.req.query("search") || "";
  const filter = c.req.query("filter") || "all"; // all, active, blocked

  const where: any = {};

  if (search) {
    where.slug = { contains: search };
  }

  if (filter === "active") {
    where.blocked = false;
  } else if (filter === "blocked") {
    where.blocked = true;
  }

  const [spaces, total] = await Promise.all([
    prisma.space.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.space.count({ where }),
  ]);

  return c.json({
    data: {
      spaces: spaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        itemCount: s._count.items,
        blocked: s.blocked,
        blockedAt: s.blockedAt,
        blockedReason: s.blockedReason,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// Get single space details
adminRouter.get("/spaces/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");

  const space = await prisma.space.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { items: true } },
    },
  });

  if (!space) {
    return c.json({ error: { message: "Space not found" } }, 404);
  }

  return c.json({
    data: {
      id: space.id,
      slug: space.slug,
      itemCount: space._count.items,
      blocked: space.blocked,
      blockedAt: space.blockedAt,
      blockedReason: space.blockedReason,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      items: space.items,
    },
  });
});

// Block/unblock space
adminRouter.post("/spaces/:slug/block", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { blocked, reason } = body;

  const space = await prisma.space.findUnique({ where: { slug } });

  if (!space) {
    return c.json({ error: { message: "Space not found" } }, 404);
  }

  const updatedSpace = await prisma.space.update({
    where: { slug },
    data: {
      blocked: blocked ?? true,
      blockedAt: blocked ? new Date() : null,
      blockedReason: blocked ? reason || "Blocked by admin" : null,
    },
  });

  return c.json({
    data: {
      slug: updatedSpace.slug,
      blocked: updatedSpace.blocked,
      blockedAt: updatedSpace.blockedAt,
      blockedReason: updatedSpace.blockedReason,
    },
  });
});

// Delete space
adminRouter.delete("/spaces/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");

  const space = await prisma.space.findUnique({ where: { slug } });

  if (!space) {
    return c.json({ error: { message: "Space not found" } }, 404);
  }

  await prisma.space.delete({ where: { slug } });

  return c.json({ data: { message: "Space deleted successfully" } });
});

// Get all feature requests
adminRouter.get("/features", authMiddleware, async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status") || "";

  const where: any = {};
  if (status) {
    where.status = status;
  }

  const [features, total] = await Promise.all([
    prisma.featureRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.featureRequest.count({ where }),
  ]);

  return c.json({
    data: {
      features,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// Update feature request status
adminRouter.patch("/features/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { status } = body;

  const validStatuses = ["pending", "reviewed", "planned", "completed", "rejected"];
  if (!validStatuses.includes(status)) {
    return c.json({ error: { message: "Invalid status" } }, 400);
  }

  const feature = await prisma.featureRequest.update({
    where: { id },
    data: { status },
  });

  return c.json({ data: feature });
});

// Delete feature request
adminRouter.delete("/features/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");

  await prisma.featureRequest.delete({ where: { id } });

  return c.json({ data: { message: "Feature request deleted" } });
});

// Public endpoint: Submit feature request (no auth required)
adminRouter.post("/feature-request", async (c) => {
  const body = await c.req.json();
  const { title, description, email, spaceSlug } = body;

  if (!title || !description) {
    return c.json({ error: { message: "Title and description are required" } }, 400);
  }

  const feature = await prisma.featureRequest.create({
    data: {
      title,
      description,
      email: email || null,
      spaceSlug: spaceSlug || null,
    },
  });

  return c.json({ data: feature });
});

export { adminRouter };
