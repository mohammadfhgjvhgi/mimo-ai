// Next.js middleware: applies auth + CSRF checks to all /api/* routes.
// Auth: if MIMO_API_TOKEN env var is set, requires `Authorization: Bearer <token>`.
//       If unset (local dev), auth is disabled.
// CSRF: for state-changing requests (POST/PUT/PATCH/DELETE) from browsers
//       (with Origin header), the Origin must match the request Host.

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/api", "/api/", "/api/health"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /api/*
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public routes: health check + root
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // ─── Auth check ─────────────────────────────────────────────
  const expectedToken = process.env.MIMO_API_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    const providedToken = match?.[1]?.trim();
    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized: missing or invalid bearer token" },
        { status: 401 }
      );
    }
  }

  // ─── CSRF check (state-changing methods only) ──────────────
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    // Only enforce CSRF for browser-originated requests (those with an Origin header).
    // Non-browser clients (curl, SDKs) have no Origin and rely on auth above.
    if (origin) {
      const host = req.headers.get("host");
      if (host) {
        try {
          const originUrl = new URL(origin);
          const isSameOrigin = originUrl.host === host;
          const isLocalDev =
            process.env.NODE_ENV !== "production" &&
            ["localhost", "127.0.0.1", "0.0.0.0"].includes(originUrl.hostname) &&
            ["localhost", "127.0.0.1", "0.0.0.0"].includes(host.split(":")[0]);
          if (!isSameOrigin && !isLocalDev) {
            return NextResponse.json(
              { error: "CSRF check failed: cross-origin request rejected" },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "CSRF check failed: invalid Origin header" },
            { status: 403 }
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
