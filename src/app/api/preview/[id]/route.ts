// /api/preview/[id] — Serve artifact content for browser preview
// Returns HTML content with proper Content-Type for iframe embedding

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artifact = await db.artifact.findUnique({
    where: { id },
    select: {
      content: true,
      format: true,
      type: true,
      name: true,
    },
  });

  if (!artifact) {
    return new Response("Artifact not found", { status: 404 });
  }

  const format = artifact.format.toLowerCase();
  const name = artifact.name.toLowerCase();

  // Determine content type
  let contentType = "text/plain";
  let body = artifact.content;

  if (format === "html" || name.endsWith(".html") || name.endsWith(".htm")) {
    contentType = "text/html; charset=utf-8";
    // If it's a partial HTML (no <html> tag), wrap it
    if (!body.includes("<html") && !body.includes("<!DOCTYPE")) {
      body = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${artifact.name}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; background: #0a0a0a; color: #e5e5e5; }
  * { box-sizing: border-box; }
</style>
</head>
<body>
${body}
</body>
</html>`;
    }
  } else if (format === "svg" || name.endsWith(".svg")) {
    contentType = "image/svg+xml";
  } else if (format === "css" || name.endsWith(".css")) {
    contentType = "text/css; charset=utf-8";
  } else if (format === "javascript" || format === "js" || name.endsWith(".js")) {
    contentType = "application/javascript; charset=utf-8";
  } else if (format === "json" || name.endsWith(".json")) {
    contentType = "application/json; charset=utf-8";
    // Pretty-print JSON
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // leave as-is
    }
  } else if (format === "markdown" || format === "md" || name.endsWith(".md")) {
    // Serve markdown as plain text (the UI will render it)
    contentType = "text/plain; charset=utf-8";
  }

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
