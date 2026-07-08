# Writing Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a login-gated web workspace ("Writing Desk") for creative and research writing projects, with planning sections, a rich text writing view organized by section, and session-based word count goals with a streak calendar.

**Architecture:** Next.js (App Router, TypeScript) full-stack app, single Postgres database via Neon accessed through Prisma, deployed to Vercel. Single hardcoded user; auth is a signed httpOnly session cookie, no third-party auth library. Rich text via TipTap. No client-side state library — server components + fetch calls from client components.

**Tech Stack:** Next.js 14+ (App Router, src dir), TypeScript, Tailwind CSS, Prisma ORM, Postgres (Neon), bcryptjs, jose (JWT signing, edge-compatible for middleware), TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-character-count`), Vitest for logic/API tests, tsx for running the seed script, deployed on Vercel.

## Global Constraints

- Single user only — no signup flow, no per-request user scoping needed (all data belongs to the one user).
- Session word-count targets (small/medium/big) are global settings, not per-project.
- Session progress is a **soft nudge only** — never block ending a session early.
- Sections are defined once in planning and reused in the writing view via a switch-between overlay, not duplicated.
- Research sources are a plain running list (name + notes/link) — no status/workflow tags.
- Out of scope for this plan: multi-user support, export/publishing, per-project targets, source status tags.
- App must be reachable from multiple devices (not localhost-only) — final task deploys to Vercel with a Neon production database.

---

### Task 1: Project scaffolding, Prisma schema, and database connectivity

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs` (via `create-next-app`)
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `prisma` (PrismaClient singleton) exported from `src/lib/db.ts`, used by every later API route task.
- Produces: Prisma models `User`, `Project` (enum `ProjectType`: `CREATIVE` | `RESEARCH`), `Section`, `CreativeDetails`, `ResearchDetails`, `Source`, `WritingSession`, `Settings` — exact shapes below, used by every later task.

- [ ] **Step 1: Scaffold the Next.js app**

Run in `~/Projects/writing-desk` (already git-initialized with the design spec committed):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

When prompted about the existing `docs/` directory and git repo, choose to continue in the existing directory.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install @prisma/client bcryptjs jose @tiptap/core @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-character-count date-fns
npm install -D prisma vitest dotenv tsx @types/bcryptjs
```

- [ ] **Step 3: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and a `.env` with a `DATABASE_URL` placeholder.

- [ ] **Step 4: Get a Neon database and set DATABASE_URL**

Go to https://neon.tech, create a free project (any region), and copy the pooled connection string it gives you (starts with `postgresql://` and includes `?sslmode=require`). Put it in `.env`:

```
DATABASE_URL="postgresql://<your-neon-connection-string>?sslmode=require"
SESSION_SECRET="<32+ random characters, e.g. output of `openssl rand -base64 32`>"
APP_USERNAME="jake"
APP_PASSWORD="<a password you'll actually use to log in>"
```

Create `.env.example` with the same keys but placeholder values (no real secrets), and confirm `.env` is listed in `.gitignore` (it is by default from `create-next-app`).

- [ ] **Step 5: Write the full schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

enum ProjectType {
  CREATIVE
  RESEARCH
}

model Project {
  id              String           @id @default(cuid())
  type            ProjectType
  title           String
  createdAt       DateTime         @default(now())
  sections        Section[]
  creativeDetails CreativeDetails?
  researchDetails ResearchDetails?
  sources         Source[]
  sessions        WritingSession[]
}

model Section {
  id           String           @id @default(cuid())
  projectId    String
  project      Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title        String
  outlineNotes String           @default("")
  content      Json             @default("{}")
  status       String           @default("not_started")
  order        Int
  sessions     WritingSession[]
}

model CreativeDetails {
  id         String  @id @default(cuid())
  projectId  String  @unique
  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  overview   String  @default("")
  logline    String  @default("")
  characters String  @default("")
}

model ResearchDetails {
  id        String  @id @default(cuid())
  projectId String  @unique
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  topic     String  @default("")
  thesis    String  @default("")
}

model Source {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  notes     String   @default("")
  createdAt DateTime @default(now())
}

model WritingSession {
  id           String    @id @default(cuid())
  projectId    String
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sectionId    String
  section      Section   @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  sessionSize  String
  targetWords  Int
  wordsWritten Int       @default(0)
  startedAt    DateTime  @default(now())
  endedAt      DateTime?
}

model Settings {
  id           String @id @default("global")
  smallTarget  Int    @default(250)
  mediumTarget Int    @default(750)
  bigTarget    Int    @default(1500)
}
```

- [ ] **Step 6: Run the migration**

```bash
npx prisma migrate dev --name init
```

Expected: creates `prisma/migrations/`, prints `Your database is now in sync with your schema.`

- [ ] **Step 7: Create the Prisma client singleton**

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 8: Set up Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `tests/setup.ts`:

```ts
import "dotenv/config";
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Write the DB smoke test**

Create `tests/db.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("database connectivity", () => {
  it("can upsert and read the global Settings row", async () => {
    await prisma.settings.upsert({
      where: { id: "global" },
      create: { id: "global" },
      update: {},
    });

    const settings = await prisma.settings.findUnique({ where: { id: "global" } });

    expect(settings).not.toBeNull();
    expect(settings?.smallTarget).toBe(250);
    expect(settings?.mediumTarget).toBe(750);
    expect(settings?.bigTarget).toBe(1500);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 10: Run the test**

```bash
npm test -- tests/db.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app, Prisma schema, and DB connectivity"
```

---

### Task 2: Password hashing utility

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `tests/lib/auth/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>` from `src/lib/auth/password.ts`, used by Task 4 (seed) and Task 5 (login route).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auth/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/auth/password.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/auth/password'".

- [ ] **Step 3: Implement**

Create `src/lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/auth/password.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password.ts tests/lib/auth/password.test.ts
git commit -m "Add password hashing utility"
```

---

### Task 3: Session token utility

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `tests/lib/auth/session.test.ts`

**Interfaces:**
- Produces: `SESSION_COOKIE_NAME: string`, `createSessionToken(userId: string): Promise<string>`, `verifySessionToken(token: string): Promise<{ userId: string } | null>` from `src/lib/auth/session.ts`, used by Task 5 (login route, logout route) and `src/middleware.ts`.
- Consumes: `process.env.SESSION_SECRET` (set in Task 1, Step 4).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auth/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session token", () => {
  it("round-trips a userId through a signed token", async () => {
    const token = await createSessionToken("user-123");
    const result = await verifySessionToken(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken("user-123");
    const tampered = token.slice(0, -2) + "xx";
    const result = await verifySessionToken(tampered);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/auth/session.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/auth/session'".

- [ ] **Step 3: Implement**

Create `src/lib/auth/session.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET);

export const SESSION_COOKIE_NAME = "session";

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/auth/session.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts tests/lib/auth/session.test.ts
git commit -m "Add session token signing/verification utility"
```

---

### Task 4: Seed script for the single user account

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `db:seed` script)

**Interfaces:**
- Consumes: `hashPassword` from `src/lib/auth/password.ts` (Task 2), `prisma` from `src/lib/db.ts` (Task 1).
- Consumes: `process.env.APP_USERNAME`, `process.env.APP_PASSWORD` (set in Task 1, Step 4).

- [ ] **Step 1: Write the seed script**

Create `prisma/seed.ts`:

```ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  if (!username || !password) {
    throw new Error("APP_USERNAME and APP_PASSWORD must be set in .env");
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { username },
    create: { username, passwordHash },
    update: { passwordHash },
  });

  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });

  console.log(`Seeded user "${username}" and default settings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` scripts:

```json
"db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 3: Run the seed script**

```bash
npm run db:seed
```

Expected: prints `Seeded user "jake" and default settings.` (or whatever `APP_USERNAME` is set to).

- [ ] **Step 4: Verify manually**

```bash
npx prisma studio
```

Open the `User` table in the browser tab that opens, confirm one row exists with your username and a bcrypt hash (starts with `$2`). Close Prisma Studio.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "Add seed script for the single user account"
```

---

### Task 5: Auth flow — login/logout routes, middleware, login page

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Test: `tests/api/auth-login.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `verifyPassword` (Task 2), `createSessionToken`, `verifySessionToken`, `SESSION_COOKIE_NAME` (Task 3).
- Produces: `/api/auth/login` (POST), `/api/auth/logout` (POST), route protection for all other routes via `src/middleware.ts`.

- [ ] **Step 1: Write the failing test for the login route**

Create `tests/api/auth-login.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { username: "test-login-user" },
      create: { username: "test-login-user", passwordHash: await hashPassword("right-password") },
      update: { passwordHash: await hashPassword("right-password") },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { username: "test-login-user" } });
    await prisma.$disconnect();
  });

  it("sets a session cookie on correct credentials", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "test-login-user", password: "right-password" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=");
  });

  it("returns 401 on incorrect password", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "test-login-user", password: "wrong-password" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/api/auth-login.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/auth/login/route'".

- [ ] **Step 3: Implement the login route**

Create `src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/api/auth-login.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Implement the logout route**

Create `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
```

- [ ] **Step 6: Implement middleware**

Create `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: Build the login page**

Create `src/app/login/page.tsx`:

```tsx
"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid username or password");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Writing Desk</h1>
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-black py-2 text-white" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Manual verification**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` — confirm you're redirected to `/login`. Log in with your `APP_USERNAME`/`APP_PASSWORD` — confirm you land on `/dashboard` (it will 404 until Task 7; a blank/404 page after a successful redirect is fine for now, the point is confirming no redirect loop and a `session` cookie is set — check via browser dev tools Application > Cookies). Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/auth src/middleware.ts src/app/login tests/api/auth-login.test.ts
git commit -m "Add login/logout routes, middleware, and login page"
```

---

### Task 6: Projects API

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`
- Test: `tests/api/projects.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `GET /api/projects` (list), `POST /api/projects` (create, body `{ type: "CREATIVE" | "RESEARCH", title: string }`), `GET /api/projects/:id` (single project with `sections`, `creativeDetails`, `researchDetails`, `sources` included) — used by Task 7 (dashboard), Task 10 (planning page), Task 13 (writing page).

- [ ] **Step 1: Write the failing tests**

Create `tests/api/projects.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST, GET as GET_LIST } from "@/app/api/projects/route";
import { GET as GET_ONE } from "@/app/api/projects/[id]/route";

describe("Projects API", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("creates a creative project with empty CreativeDetails", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ type: "CREATIVE", title: "My Novel" }),
    });

    const response = await POST(request as never);
    const body = await response.json();
    createdIds.push(body.id);

    expect(response.status).toBe(201);
    expect(body.title).toBe("My Novel");

    const found = await prisma.project.findUnique({
      where: { id: body.id },
      include: { creativeDetails: true },
    });
    expect(found?.creativeDetails).not.toBeNull();
  });

  it("creates a research project with empty ResearchDetails", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ type: "RESEARCH", title: "My Investigation" }),
    });

    const response = await POST(request as never);
    const body = await response.json();
    createdIds.push(body.id);

    const found = await prisma.project.findUnique({
      where: { id: body.id },
      include: { researchDetails: true },
    });
    expect(found?.researchDetails).not.toBeNull();
  });

  it("lists projects", async () => {
    const response = await GET_LIST();
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("gets a single project by id", async () => {
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Solo" } });
    createdIds.push(project.id);

    const response = await GET_ONE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: project.id }),
    });
    const body = await response.json();

    expect(body.title).toBe("Solo");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/api/projects.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/projects/route'".

- [ ] **Step 3: Implement the collection route**

Create `src/app/api/projects/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const { type, title } = await request.json();

  const project = await prisma.project.create({
    data: {
      type,
      title,
      ...(type === "CREATIVE" ? { creativeDetails: { create: {} } } : {}),
      ...(type === "RESEARCH" ? { researchDetails: { create: {} } } : {}),
    },
  });

  return NextResponse.json(project, { status: 201 });
}
```

- [ ] **Step 4: Implement the single-project route**

Create `src/app/api/projects/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      creativeDetails: true,
      researchDetails: true,
      sources: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/api/projects.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects tests/api/projects.test.ts
git commit -m "Add projects API"
```

---

### Task 7: Dashboard page

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/NewProjectForm.tsx`
- Create: `src/components/ProjectCard.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 1) directly (server component), `POST /api/projects` (Task 6, from the client form).
- Produces: `/dashboard` route, `<ProjectCard>` component reused nowhere else yet but kept separate for clarity.

- [ ] **Step 1: Build the project card component**

Create `src/components/ProjectCard.tsx`:

```tsx
import Link from "next/link";

interface ProjectCardProps {
  id: string;
  title: string;
  type: "CREATIVE" | "RESEARCH";
}

export default function ProjectCard({ id, title, type }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${id}/planning`}
      className="block rounded-lg border p-4 hover:border-black"
    >
      <p className="font-medium">{title}</p>
      <p className="text-sm text-gray-500">{type === "CREATIVE" ? "Creative" : "Research"}</p>
    </Link>
  );
}
```

- [ ] **Step 2: Build the new-project form**

Create `src/components/NewProjectForm.tsx`:

```tsx
"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"CREATIVE" | "RESEARCH">("CREATIVE");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title }),
    });

    if (res.ok) {
      const project = await res.json();
      router.push(`/projects/${project.id}/planning`);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-black px-4 py-2 text-white">
        New Project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <input
        className="w-full rounded border px-3 py-2"
        placeholder="Project title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="flex gap-3">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={type === "CREATIVE"}
            onChange={() => setType("CREATIVE")}
          />
          Creative
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={type === "RESEARCH"}
            onChange={() => setType("RESEARCH")}
          />
          Research
        </label>
      </div>
      <button className="rounded bg-black px-4 py-2 text-white" type="submit">
        Create
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Build the dashboard page**

Create `src/app/dashboard/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import ProjectCard from "@/components/ProjectCard";
import NewProjectForm from "@/components/NewProjectForm";

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  const creative = projects.filter((p) => p.type === "CREATIVE");
  const research = projects.filter((p) => p.type === "RESEARCH");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Writing Desk</h1>
        <NewProjectForm />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Creative</h2>
        <div className="grid grid-cols-2 gap-3">
          {creative.map((p) => (
            <ProjectCard key={p.id} id={p.id} title={p.title} type={p.type} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Research</h2>
        <div className="grid grid-cols-2 gap-3">
          {research.map((p) => (
            <ProjectCard key={p.id} id={p.id} title={p.title} type={p.type} />
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Log in, visit `/dashboard`. Click "New Project", create one Creative and one Research project, confirm both appear in their respective sections and clicking a card navigates to `/projects/:id/planning` (expect a 404 there until Task 10 — that's fine, confirms routing works). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard src/components/ProjectCard.tsx src/components/NewProjectForm.tsx
git commit -m "Add dashboard page with project creation"
```

---

### Task 8: Sections API

**Files:**
- Create: `src/app/api/projects/[id]/sections/route.ts`
- Create: `src/app/api/sections/[id]/route.ts`
- Test: `tests/api/sections.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `GET /api/projects/:id/sections` (list, ordered), `POST /api/projects/:id/sections` (create, body `{ title: string }`, auto-assigns `order` as max+1 and default TipTap-empty-doc `content`), `PATCH /api/sections/:id` (body may include any of `title`, `outlineNotes`, `content`, `status`, `order`), `DELETE /api/sections/:id` — used by Task 10 (planning page), Task 12/13 (editor, writing page).

- [ ] **Step 1: Write the failing tests**

Create `tests/api/sections.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET as GET_LIST, POST } from "@/app/api/projects/[id]/sections/route";
import { PATCH, DELETE } from "@/app/api/sections/[id]/route";

describe("Sections API", () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Section Test" } });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("creates a section with default order and content", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "Chapter 1" }),
    });

    const response = await POST(request as never, { params: Promise.resolve({ id: projectId }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.order).toBe(1);
    expect(body.content).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("assigns increasing order to subsequent sections", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "Chapter 2" }),
    });

    const response = await POST(request as never, { params: Promise.resolve({ id: projectId }) });
    const body = await response.json();

    expect(body.order).toBe(2);
  });

  it("lists sections in order", async () => {
    const response = await GET_LIST(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(body.map((s: { title: string }) => s.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("updates a section's content and status", async () => {
    const sections = await prisma.section.findMany({ where: { projectId } });
    const target = sections[0];

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ status: "drafting", content: { type: "doc", content: [] } }),
    });

    const response = await PATCH(request as never, { params: Promise.resolve({ id: target.id }) });
    const body = await response.json();

    expect(body.status).toBe("drafting");
  });

  it("deletes a section", async () => {
    const sections = await prisma.section.findMany({ where: { projectId } });
    const target = sections[sections.length - 1];

    const response = await DELETE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: target.id }),
    });

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/api/sections.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/projects/[id]/sections/route'".

- [ ] **Step 3: Implement the collection route**

Create `src/app/api/projects/[id]/sections/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sections = await prisma.section.findMany({
    where: { projectId: id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(sections);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = await request.json();

  const last = await prisma.section.findFirst({
    where: { projectId: id },
    orderBy: { order: "desc" },
  });

  const section = await prisma.section.create({
    data: {
      projectId: id,
      title,
      order: (last?.order ?? 0) + 1,
      content: EMPTY_DOC,
    },
  });

  return NextResponse.json(section, { status: 201 });
}
```

- [ ] **Step 4: Implement the single-section route**

Create `src/app/api/sections/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();

  const section = await prisma.section.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(section);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.section.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/api/sections.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/[id]/sections src/app/api/sections tests/api/sections.test.ts
git commit -m "Add sections API"
```

---

### Task 9: Planning APIs — creative/research details and sources

**Files:**
- Create: `src/app/api/projects/[id]/creative-details/route.ts`
- Create: `src/app/api/projects/[id]/research-details/route.ts`
- Create: `src/app/api/projects/[id]/sources/route.ts`
- Create: `src/app/api/sources/[id]/route.ts`
- Test: `tests/api/planning-details.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `PATCH /api/projects/:id/creative-details` (body: any of `overview`, `logline`, `characters`), `PATCH /api/projects/:id/research-details` (body: any of `topic`, `thesis`), `GET/POST /api/projects/:id/sources`, `PATCH/DELETE /api/sources/:id` — used by Task 10 (planning page).

- [ ] **Step 1: Write the failing tests**

Create `tests/api/planning-details.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH as PATCH_CREATIVE } from "@/app/api/projects/[id]/creative-details/route";
import { PATCH as PATCH_RESEARCH } from "@/app/api/projects/[id]/research-details/route";
import { GET as GET_SOURCES, POST as POST_SOURCE } from "@/app/api/projects/[id]/sources/route";
import { PATCH as PATCH_SOURCE, DELETE as DELETE_SOURCE } from "@/app/api/sources/[id]/route";

describe("Planning details API", () => {
  let creativeProjectId: string;
  let researchProjectId: string;

  beforeAll(async () => {
    const creative = await prisma.project.create({
      data: { type: "CREATIVE", title: "Details Test Creative", creativeDetails: { create: {} } },
    });
    creativeProjectId = creative.id;

    const research = await prisma.project.create({
      data: { type: "RESEARCH", title: "Details Test Research", researchDetails: { create: {} } },
    });
    researchProjectId = research.id;
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: creativeProjectId } });
    await prisma.project.delete({ where: { id: researchProjectId } });
    await prisma.$disconnect();
  });

  it("updates creative details", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ logline: "A story about a thing." }),
    });
    const response = await PATCH_CREATIVE(request as never, {
      params: Promise.resolve({ id: creativeProjectId }),
    });
    const body = await response.json();
    expect(body.logline).toBe("A story about a thing.");
  });

  it("updates research details", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ thesis: "Something is amiss." }),
    });
    const response = await PATCH_RESEARCH(request as never, {
      params: Promise.resolve({ id: researchProjectId }),
    });
    const body = await response.json();
    expect(body.thesis).toBe("Something is amiss.");
  });

  it("creates and lists sources", async () => {
    const createRequest = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "Public records request", notes: "Filed 2026-07-01" }),
    });
    await POST_SOURCE(createRequest as never, { params: Promise.resolve({ id: researchProjectId }) });

    const listResponse = await GET_SOURCES(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: researchProjectId }),
    });
    const sources = await listResponse.json();

    expect(sources.length).toBe(1);
    expect(sources[0].name).toBe("Public records request");
  });

  it("updates and deletes a source", async () => {
    const sources = await prisma.source.findMany({ where: { projectId: researchProjectId } });
    const target = sources[0];

    const patchRequest = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ notes: "Response received" }),
    });
    const patchResponse = await PATCH_SOURCE(patchRequest as never, {
      params: Promise.resolve({ id: target.id }),
    });
    expect((await patchResponse.json()).notes).toBe("Response received");

    const deleteResponse = await DELETE_SOURCE(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: target.id }),
    });
    expect(deleteResponse.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/api/planning-details.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/projects/[id]/creative-details/route'".

- [ ] **Step 3: Implement creative-details route**

Create `src/app/api/projects/[id]/creative-details/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();

  const details = await prisma.creativeDetails.update({
    where: { projectId: id },
    data: updates,
  });

  return NextResponse.json(details);
}
```

- [ ] **Step 4: Implement research-details route**

Create `src/app/api/projects/[id]/research-details/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();

  const details = await prisma.researchDetails.update({
    where: { projectId: id },
    data: updates,
  });

  return NextResponse.json(details);
}
```

- [ ] **Step 5: Implement sources routes**

Create `src/app/api/projects/[id]/sources/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sources = await prisma.source.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(sources);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, notes } = await request.json();

  const source = await prisma.source.create({
    data: { projectId: id, name, notes: notes ?? "" },
  });

  return NextResponse.json(source, { status: 201 });
}
```

Create `src/app/api/sources/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();

  const source = await prisma.source.update({ where: { id }, data: updates });
  return NextResponse.json(source);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.source.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- tests/api/planning-details.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/projects/[id]/creative-details src/app/api/projects/[id]/research-details src/app/api/projects/[id]/sources src/app/api/sources tests/api/planning-details.test.ts
git commit -m "Add creative/research details and sources APIs"
```

---

### Task 10: Planning page UI

**Files:**
- Create: `src/app/projects/[id]/planning/page.tsx`
- Create: `src/components/SectionList.tsx`

**Interfaces:**
- Consumes: `GET /api/projects/:id` (Task 6), `PATCH /api/projects/:id/creative-details`, `PATCH /api/projects/:id/research-details`, sources routes (Task 9), sections routes (Task 8).

- [ ] **Step 1: Build the section list component**

Create `src/components/SectionList.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Section {
  id: string;
  title: string;
  order: number;
  status: string;
}

interface SectionListProps {
  projectId: string;
  initialSections: Section[];
}

export default function SectionList({ projectId, initialSections }: SectionListProps) {
  const [sections, setSections] = useState(initialSections);
  const [newTitle, setNewTitle] = useState("");
  const router = useRouter();

  async function addSection() {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    const section = await res.json();
    setSections([...sections, section]);
    setNewTitle("");
  }

  async function removeSection(id: string) {
    await fetch(`/api/sections/${id}`, { method: "DELETE" });
    setSections(sections.filter((s) => s.id !== id));
  }

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const a = sections[index];
    const b = sections[targetIndex];

    await fetch(`/api/sections/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: b.order }),
    });
    await fetch(`/api/sections/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: a.order }),
    });

    const reordered = [...sections];
    reordered[index] = { ...b, order: a.order };
    reordered[targetIndex] = { ...a, order: b.order };
    setSections(reordered);
  }

  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div key={s.id} className="flex items-center justify-between rounded border p-2">
          <button
            className="text-left hover:underline"
            onClick={() => router.push(`/projects/${projectId}/write?section=${s.id}`)}
          >
            {s.title} <span className="text-xs text-gray-500">({s.status})</span>
          </button>
          <div className="flex gap-1">
            <button onClick={() => move(i, -1)} className="px-2">↑</button>
            <button onClick={() => move(i, 1)} className="px-2">↓</button>
            <button onClick={() => removeSection(s.id)} className="px-2 text-red-600">✕</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="New section title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button onClick={addSection} className="rounded bg-black px-4 py-2 text-white">
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the planning page**

Create `src/app/projects/[id]/planning/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import SectionList from "@/components/SectionList";
import PlanningFields from "@/components/PlanningFields";

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      creativeDetails: true,
      researchDetails: true,
      sources: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{project.title}</h1>

      <PlanningFields project={project} />

      <section>
        <h2 className="mb-2 text-lg font-medium">Sections</h2>
        <SectionList projectId={project.id} initialSections={project.sections} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Build the type-specific planning fields component**

Create `src/components/PlanningFields.tsx`:

```tsx
"use client";
import { useState } from "react";

interface Source {
  id: string;
  name: string;
  notes: string;
}

interface PlanningFieldsProps {
  project: {
    id: string;
    type: "CREATIVE" | "RESEARCH";
    creativeDetails: { overview: string; logline: string; characters: string } | null;
    researchDetails: { topic: string; thesis: string } | null;
    sources: Source[];
  };
}

export default function PlanningFields({ project }: PlanningFieldsProps) {
  if (project.type === "CREATIVE") {
    return <CreativeFields projectId={project.id} details={project.creativeDetails!} />;
  }
  return <ResearchFields projectId={project.id} details={project.researchDetails!} sources={project.sources} />;
}

function CreativeFields({
  projectId,
  details,
}: {
  projectId: string;
  details: { overview: string; logline: string; characters: string };
}) {
  const [overview, setOverview] = useState(details.overview);
  const [logline, setLogline] = useState(details.logline);
  const [characters, setCharacters] = useState(details.characters);

  function save(field: string, value: string) {
    fetch(`/api/projects/${projectId}/creative-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Logline</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          onBlur={() => save("logline", logline)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Overview</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={4}
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          onBlur={() => save("overview", overview)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Characters</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={4}
          value={characters}
          onChange={(e) => setCharacters(e.target.value)}
          onBlur={() => save("characters", characters)}
        />
      </div>
    </div>
  );
}

function ResearchFields({
  projectId,
  details,
  sources,
}: {
  projectId: string;
  details: { topic: string; thesis: string };
  sources: Source[];
}) {
  const [topic, setTopic] = useState(details.topic);
  const [thesis, setThesis] = useState(details.thesis);
  const [sourceList, setSourceList] = useState(sources);
  const [newSourceName, setNewSourceName] = useState("");

  function save(field: string, value: string) {
    fetch(`/api/projects/${projectId}/research-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function addSource() {
    if (!newSourceName.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSourceName, notes: "" }),
    });
    const source = await res.json();
    setSourceList([...sourceList, source]);
    setNewSourceName("");
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Topic & Angle</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => save("topic", topic)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Thesis</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={3}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          onBlur={() => save("thesis", thesis)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Sources</label>
        <ul className="mb-2 space-y-1">
          {sourceList.map((s) => (
            <li key={s.id} className="text-sm">{s.name}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="New source"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
          />
          <button onClick={addSource} className="rounded bg-black px-4 py-2 text-white">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Log in, open a creative project's planning page — fill in logline/overview/characters, blur each field, refresh the page, confirm the values persisted. Add two sections, reorder them with ↑/↓, delete one, confirm order and deletion persist across refresh. Repeat for a research project (topic/thesis/sources). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[id]/planning src/components/SectionList.tsx src/components/PlanningFields.tsx
git commit -m "Add planning page UI for creative and research projects"
```

---

### Task 11: Settings API and page

**Files:**
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/settings/page.tsx`
- Test: `tests/api/settings.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `GET /api/settings`, `PATCH /api/settings` (body: any of `smallTarget`, `mediumTarget`, `bigTarget`) — used by Task 15 (SessionBar).

- [ ] **Step 1: Write the failing test**

Create `tests/api/settings.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET, PATCH } from "@/app/api/settings/route";

describe("Settings API", () => {
  afterAll(async () => {
    await prisma.settings.update({
      where: { id: "global" },
      data: { smallTarget: 250, mediumTarget: 750, bigTarget: 1500 },
    });
    await prisma.$disconnect();
  });

  it("gets the global settings, creating defaults if missing", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.smallTarget).toBe(250);
  });

  it("updates a target", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ bigTarget: 2000 }),
    });
    const response = await PATCH(request as never);
    const body = await response.json();
    expect(body.bigTarget).toBe(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/api/settings.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/settings/route'".

- [ ] **Step 3: Implement the route**

Create `src/app/api/settings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const updates = await request.json();
  const settings = await prisma.settings.update({
    where: { id: "global" },
    data: updates,
  });
  return NextResponse.json(settings);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/api/settings.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Build the settings page**

Create `src/app/settings/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [targets, setTargets] = useState({ smallTarget: 250, mediumTarget: 750, bigTarget: 1500 });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setTargets);
  }, []);

  function update(field: keyof typeof targets, value: number) {
    const next = { ...targets, [field]: value };
    setTargets(next);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Session Word Targets</h1>
      {(["smallTarget", "mediumTarget", "bigTarget"] as const).map((field) => (
        <div key={field}>
          <label className="block text-sm font-medium capitalize">
            {field.replace("Target", "")}
          </label>
          <input
            type="number"
            className="w-full rounded border px-3 py-2"
            value={targets[field]}
            onChange={(e) => update(field, Number(e.target.value))}
          />
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```

Visit `/settings`, change each target, refresh, confirm values persisted.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/settings src/app/settings tests/api/settings.test.ts
git commit -m "Add settings API and page for session word targets"
```

---

### Task 12: Rich text editor component with autosave

**Files:**
- Create: `src/components/Editor.tsx`

**Interfaces:**
- Consumes: `PATCH /api/sections/:id` (Task 8).
- Produces: `<Editor sectionId initialContent onEditorReady />` — `onEditorReady(editor: TiptapEditor)` fires once the TipTap editor instance exists, used by Task 13 (writing page) to pass the same instance to `<SessionBar>` (Task 15).

- [ ] **Step 1: Build the component**

Create `src/components/Editor.tsx`:

```tsx
"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect, useRef } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface EditorProps {
  sectionId: string;
  initialContent: object;
  onEditorReady: (editor: TiptapEditor) => void;
}

export default function Editor({ sectionId, initialContent, onEditorReady }: EditorProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, CharacterCount],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        fetch(`/api/sections/${sectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editor.getJSON() }),
        });
      }, 1000);
    },
  });

  useEffect(() => {
    if (editor) onEditorReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return <EditorContent editor={editor} className="prose max-w-none min-h-[60vh] focus:outline-none" />;
}
```

- [ ] **Step 2: Manual verification (deferred)**

This component has no route of its own yet — it's exercised end-to-end in Task 13's manual verification. No standalone check needed here beyond confirming it compiles:

```bash
npx tsc --noEmit
```

Expected: no errors referencing `Editor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "Add rich text editor component with autosave"
```

---

### Task 13: Writing page with section-switch overlay

**Files:**
- Create: `src/app/projects/[id]/write/page.tsx`
- Create: `src/components/SectionOverlay.tsx`

**Interfaces:**
- Consumes: `GET /api/projects/:id` (Task 6), `<Editor>` (Task 12).
- Produces: `/projects/:id/write?section=:sectionId` route. Holds the `editor` instance in state so it can later be threaded to `<SessionBar>` in Task 15.

- [ ] **Step 1: Build the section overlay**

Create `src/components/SectionOverlay.tsx`:

```tsx
"use client";
import { useState } from "react";

interface Section {
  id: string;
  title: string;
  status: string;
}

interface SectionOverlayProps {
  sections: Section[];
  activeSectionId: string;
  onSelect: (id: string) => void;
}

export default function SectionOverlay({ sections, activeSectionId, onSelect }: SectionOverlayProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded border px-3 py-1 text-sm">
        Sections
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded border bg-white shadow-lg">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s.id);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                s.id === activeSectionId ? "font-semibold" : ""
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the writing page**

Create `src/app/projects/[id]/write/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Editor from "@/components/Editor";
import SectionOverlay from "@/components/SectionOverlay";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface Section {
  id: string;
  title: string;
  status: string;
  content: object;
}

export default function WritePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sections, setSections] = useState<Section[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("section"));
  const [editor, setEditor] = useState<TiptapEditor | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((project) => {
        setSections(project.sections);
        if (!activeId && project.sections.length > 0) {
          setActiveId(project.sections[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function selectSection(id: string) {
    setActiveId(id);
    setEditor(null);
    router.replace(`/projects/${params.id}/write?section=${id}`);
  }

  const activeSection = sections.find((s) => s.id === activeId);

  if (!activeSection) {
    return <p className="p-6">Loading...</p>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{activeSection.title}</h1>
        <SectionOverlay sections={sections} activeSectionId={activeSection.id} onSelect={selectSection} />
      </div>

      <Editor
        key={activeSection.id}
        sectionId={activeSection.id}
        initialContent={activeSection.content}
        onEditorReady={setEditor}
      />
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

From a project's planning page, click a section title to land on `/write?section=...`. Type in the editor, wait 1 second, refresh the page, confirm your text persisted. Use the "Sections" overlay to switch to a different section, confirm its own content loads. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/[id]/write src/components/SectionOverlay.tsx
git commit -m "Add writing page with section-switch overlay"
```

---

### Task 14: Sessions API

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Create: `src/app/api/sessions/[id]/route.ts`
- Test: `tests/api/sessions.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `POST /api/sessions` (body `{ projectId, sectionId, sessionSize: "small"|"medium"|"big" }`, looks up target from `Settings`, returns created session with `targetWords`), `PATCH /api/sessions/:id` (body `{ wordsWritten: number }`, sets `endedAt`) — used by Task 15 (`SessionBar`) and Task 16 (streak endpoint reads `endedAt`).

- [ ] **Step 1: Write the failing tests**

Create `tests/api/sessions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/route";
import { PATCH } from "@/app/api/sessions/[id]/route";

describe("Sessions API", () => {
  let projectId: string;
  let sectionId: string;

  beforeAll(async () => {
    await prisma.settings.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Session Test" } });
    projectId = project.id;
    const section = await prisma.section.create({
      data: { projectId, title: "Ch1", order: 1, content: {} },
    });
    sectionId = section.id;
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("creates a session with the target from Settings", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ projectId, sectionId, sessionSize: "small" }),
    });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.targetWords).toBe(250);
    expect(body.endedAt).toBeNull();
  });

  it("ends a session with the final word count", async () => {
    const createRequest = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ projectId, sectionId, sessionSize: "medium" }),
    });
    const created = await (await POST(createRequest as never)).json();

    const patchRequest = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ wordsWritten: 340 }),
    });
    const response = await PATCH(patchRequest as never, { params: Promise.resolve({ id: created.id }) });
    const body = await response.json();

    expect(body.wordsWritten).toBe(340);
    expect(body.endedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/api/sessions.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/sessions/route'".

- [ ] **Step 3: Implement the collection route**

Create `src/app/api/sessions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TARGET_FIELD = {
  small: "smallTarget",
  medium: "mediumTarget",
  big: "bigTarget",
} as const;

export async function POST(request: NextRequest) {
  const { projectId, sectionId, sessionSize } = await request.json();

  const settings = await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });

  const targetWords = settings[TARGET_FIELD[sessionSize as keyof typeof TARGET_FIELD]];

  const session = await prisma.writingSession.create({
    data: { projectId, sectionId, sessionSize, targetWords },
  });

  return NextResponse.json(session, { status: 201 });
}
```

- [ ] **Step 4: Implement the single-session route**

Create `src/app/api/sessions/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { wordsWritten } = await request.json();

  const session = await prisma.writingSession.update({
    where: { id },
    data: { wordsWritten, endedAt: new Date() },
  });

  return NextResponse.json(session);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/api/sessions.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions tests/api/sessions.test.ts
git commit -m "Add sessions API"
```

---

### Task 15: Session bar — pick size, live progress, end session

**Files:**
- Create: `src/components/SessionBar.tsx`
- Modify: `src/app/projects/[id]/write/page.tsx:1` (render `<SessionBar>` alongside the editor)

**Interfaces:**
- Consumes: `GET /api/settings` (Task 11), `POST /api/sessions`, `PATCH /api/sessions/:id` (Task 14), the `editor` instance produced by `<Editor onEditorReady>` (Task 12) via `editor.storage.characterCount.words()`.

- [ ] **Step 1: Build the session bar**

Create `src/components/SessionBar.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface SessionBarProps {
  editor: TiptapEditor | null;
  projectId: string;
  sectionId: string;
}

type SessionSize = "small" | "medium" | "big";

export default function SessionBar({ editor, projectId, sectionId }: SessionBarProps) {
  const [targets, setTargets] = useState({ small: 250, medium: 750, big: 1500 });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [target, setTarget] = useState(0);
  const [startingWords, setStartingWords] = useState(0);
  const [currentWords, setCurrentWords] = useState(0);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setTargets({ small: s.smallTarget, medium: s.mediumTarget, big: s.bigTarget }));
  }, []);

  useEffect(() => {
    if (!editor || !sessionId) return;
    const interval = setInterval(() => {
      setCurrentWords(editor.storage.characterCount.words());
    }, 1000);
    return () => clearInterval(interval);
  }, [editor, sessionId]);

  async function start(size: SessionSize) {
    if (!editor) return;
    const words = editor.storage.characterCount.words();
    setStartingWords(words);
    setCurrentWords(words);

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sectionId, sessionSize: size }),
    });
    const session = await res.json();
    setSessionId(session.id);
    setTarget(session.targetWords);
  }

  async function end() {
    if (!sessionId) return;
    const wordsWritten = Math.max(0, currentWords - startingWords);
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordsWritten }),
    });
    setSessionId(null);
  }

  if (!sessionId) {
    return (
      <div className="flex items-center gap-2 rounded border p-3">
        <span className="text-sm text-gray-600">Start a session:</span>
        <button onClick={() => start("small")} className="rounded border px-3 py-1 text-sm">
          Small ({targets.small})
        </button>
        <button onClick={() => start("medium")} className="rounded border px-3 py-1 text-sm">
          Medium ({targets.medium})
        </button>
        <button onClick={() => start("big")} className="rounded border px-3 py-1 text-sm">
          Big ({targets.big})
        </button>
      </div>
    );
  }

  const progress = Math.max(0, currentWords - startingWords);
  const percent = Math.min(100, Math.round((progress / target) * 100));

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>{progress} / {target} words this session</span>
        <button onClick={end} className="rounded bg-black px-3 py-1 text-white">
          End Session
        </button>
      </div>
      <div className="h-2 w-full rounded bg-gray-200">
        <div className="h-2 rounded bg-black" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the writing page**

In `src/app/projects/[id]/write/page.tsx`, import `SessionBar` and render it below the `<Editor>`:

```tsx
import SessionBar from "@/components/SessionBar";
```

Add after the `<Editor ... />` element, still inside the `<main>`:

```tsx
      <SessionBar editor={editor} projectId={params.id} sectionId={activeSection.id} />
```

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

Open a section's writing view. Click "Small". Type words until the progress bar approaches 100%, confirm it doesn't block you from continuing past 100%. Click "End Session" before reaching the target — confirm it ends without error (soft nudge, not a hard lock). Check `npx prisma studio` → `WritingSession` table → confirm a row exists with `endedAt` set and a reasonable `wordsWritten` count. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionBar.tsx src/app/projects/[id]/write/page.tsx
git commit -m "Add session bar with word target progress and end-session logging"
```

---

### Task 16: Streak calendar

**Files:**
- Create: `src/app/api/sessions/streak/route.ts`
- Create: `src/components/StreakCalendar.tsx`
- Modify: `src/app/dashboard/page.tsx:1` (render `<StreakCalendar>`)
- Test: `tests/api/streak.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces: `GET /api/sessions/streak` → `{ dates: string[] }` (each `YYYY-MM-DD` with at least one completed session in the last 90 days) — used by `<StreakCalendar>`, rendered on the dashboard.

- [ ] **Step 1: Write the failing test**

Create `tests/api/streak.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/sessions/streak/route";

describe("GET /api/sessions/streak", () => {
  let projectId: string;
  let sectionId: string;

  beforeAll(async () => {
    const project = await prisma.project.create({ data: { type: "CREATIVE", title: "Streak Test" } });
    projectId = project.id;
    const section = await prisma.section.create({
      data: { projectId, title: "Ch1", order: 1, content: {} },
    });
    sectionId = section.id;

    await prisma.writingSession.create({
      data: {
        projectId,
        sectionId,
        sessionSize: "small",
        targetWords: 250,
        wordsWritten: 300,
        endedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("returns today's date since a session was completed today", async () => {
    const response = await GET();
    const body = await response.json();
    const today = new Date().toISOString().slice(0, 10);

    expect(body.dates).toContain(today);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/api/streak.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/sessions/streak/route'".

- [ ] **Step 3: Implement the route**

Create `src/app/api/sessions/streak/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subDays } from "date-fns";

export async function GET() {
  const since = subDays(new Date(), 90);

  const sessions = await prisma.writingSession.findMany({
    where: { endedAt: { not: null, gte: since } },
    select: { endedAt: true },
  });

  const dates = Array.from(
    new Set(sessions.map((s) => s.endedAt!.toISOString().slice(0, 10)))
  ).sort();

  return NextResponse.json({ dates });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/api/streak.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Build the streak calendar component**

Create `src/components/StreakCalendar.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { subDays, format } from "date-fns";

export default function StreakCalendar() {
  const [dates, setDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sessions/streak")
      .then((r) => r.json())
      .then((body) => setDates(new Set(body.dates)));
  }, []);

  const days = Array.from({ length: 90 }, (_, i) => subDays(new Date(), 89 - i));

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const active = dates.has(key);
        return (
          <div
            key={key}
            title={key}
            className={`h-3 w-3 rounded-sm ${active ? "bg-green-600" : "bg-gray-200"}`}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Add it to the dashboard**

In `src/app/dashboard/page.tsx`, import and render it near the top:

```tsx
import StreakCalendar from "@/components/StreakCalendar";
```

Add just below the `<h1>`/`<NewProjectForm>` row:

```tsx
      <StreakCalendar />
```

- [ ] **Step 7: Manual verification**

```bash
npm run dev
```

Complete a writing session (start small, type a few words, end session). Visit `/dashboard`, confirm today's square in the streak calendar is highlighted green. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/sessions/streak src/components/StreakCalendar.tsx src/app/dashboard/page.tsx tests/api/streak.test.ts
git commit -m "Add streak calendar to dashboard"
```

---

### Task 17: Deploy to Vercel with a production database

**Files:**
- Create: `.env.example` (already exists from Task 1 — verify it's current)
- No new source files; this task is deployment configuration.

**Interfaces:**
- Consumes: all prior tasks' code, deployed as-is.

- [ ] **Step 1: Push the final code to GitHub**

```bash
cd ~/Projects/writing-desk
git push origin main
```

- [ ] **Step 2: Create a production Neon database**

Go to https://neon.tech, either create a second project for production or create a new branch of the existing project named `production`. Copy its connection string.

- [ ] **Step 3: Create the Vercel project**

Go to https://vercel.com/new, import the `jakep1300/writing-desk` GitHub repo. Framework preset should auto-detect "Next.js" — accept defaults.

- [ ] **Step 4: Set environment variables in Vercel**

In the Vercel project's Settings → Environment Variables, add for "Production":

```
DATABASE_URL=<production Neon connection string>
SESSION_SECRET=<a different 32+ char random string than local dev>
APP_USERNAME=jake
APP_PASSWORD=<your real password>
```

- [ ] **Step 5: Deploy**

Trigger the deploy from the Vercel dashboard (or it auto-deploys on push). Wait for the build to finish.

- [ ] **Step 6: Run the production migration and seed**

From your local machine, temporarily point at the production database to run the one-time setup:

```bash
DATABASE_URL="<production Neon connection string>" npx prisma migrate deploy
DATABASE_URL="<production Neon connection string>" APP_USERNAME=jake APP_PASSWORD="<your real password>" npm run db:seed
```

- [ ] **Step 7: Verify the deployed app**

Visit the `*.vercel.app` URL Vercel gives you. Confirm you're redirected to `/login`, log in with your real credentials, confirm the dashboard loads. Create a test project, add a section, write a sentence, confirm it autosaves (refresh and check). Delete the test project via `npx prisma studio` (pointed at production `DATABASE_URL`) if you don't want it cluttering your real workspace.

- [ ] **Step 8: Commit and push any final config changes**

```bash
git add -A
git commit -m "Document production deployment steps" --allow-empty
git push origin main
```
