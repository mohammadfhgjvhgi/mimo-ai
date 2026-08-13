// ===================================================================
// Knowledge Base Importer
// ===================================================================
// Imports research-export/ files into KnowledgeEntry table.
// Extracts entities and stores them in KnowledgeEntity.
// Categorizes: architecture, research, skill, code, spec, other
// ===================================================================

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";

const RESEARCH_ROOT = "/home/z/my-project/research-export";

interface ImportResult {
  totalFiles: number;
  imported: number;
  skipped: number;
  errors: number;
  categories: Record<string, number>;
}

function categorize(filePath: string, content: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes("architecture") || lower.includes("adr") || lower.includes("design")) return "architecture";
  if (lower.includes("academic") || lower.includes("theory") || lower.includes("hci")) return "research";
  if (lower.includes("skill") || lower.includes("evidence")) return "skill";
  if (lower.includes("code") || lower.includes("source") || lower.includes("src")) return "code";
  if (lower.includes("spec") || lower.includes("product") || lower.includes("engineering")) return "spec";
  if (lower.includes("pattern") || lower.includes("ux")) return "research";
  if (lower.includes("mimo") || lower.includes("agent") || lower.includes("memory")) return "architecture";
  if (content.includes("```typescript") || content.includes("```python")) return "code";
  return "other";
}

function extractTitle(filePath: string, content: string): string {
  // Try first H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Try first H2
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) return h2Match[1].trim();

  // Use filename
  return path.basename(filePath, path.extname(filePath)).replace(/_/g, " ");
}

function extractSummary(content: string): string | null {
  // Take first paragraph after title
  const lines = content.split("\n");
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith("#")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim().length > 20) {
      return line.trim().slice(0, 300);
    }
  }
  // Fallback: first non-empty line
  for (const line of lines) {
    if (line.trim().length > 20 && !line.startsWith("#") && !line.startsWith("---")) {
      return line.trim().slice(0, 300);
    }
  }
  return null;
}

function extractTags(filePath: string, content: string): string[] {
  const tags = new Set<string>();
  const lower = content.toLowerCase();

  // Technology tags
  const techKeywords = [
    "react", "nextjs", "next.js", "typescript", "python", "prisma",
    "arduino", "esp8266", "esp32", "firebase", "iot", "ai", "llm",
    "mcp", "rag", "agent", "memory", "knowledge", "tool", "security",
    "validation", "autonomous", "workspace", "skill", "claude", "cursor",
    "devin", "manus", "chatgpt", "gemini", "openai", "vercel",
  ];

  for (const tech of techKeywords) {
    if (lower.includes(tech)) tags.add(tech);
  }

  // Path-based tags
  const parts = filePath.split("/");
  for (const part of parts) {
    if (part.length > 2 && !part.includes(".")) {
      tags.add(part.toLowerCase());
    }
  }

  return Array.from(tags).slice(0, 15);
}

async function importFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    if (stat.size > 500_000) return false; // Skip files > 500KB
    if (stat.size < 100) return false; // Skip tiny files

    const ext = path.extname(filePath).toLowerCase();
    if (![".md", ".txt", ".json", ".ts", ".tsx", ".py", ".sql", ".yaml", ".yml"].includes(ext)) {
      return false;
    }

    const content = await fs.readFile(filePath, "utf8");
    if (content.length < 50) return false;

    const relPath = path.relative(RESEARCH_ROOT, filePath);
    const title = extractTitle(filePath, content);
    const category = categorize(filePath, content);
    const summary = extractSummary(content);
    const tags = extractTags(filePath, content);

    // Check if already imported
    const existing = await db.knowledgeEntry.findFirst({
      where: { sourcePath: relPath },
      select: { id: true },
    });
    if (existing) return false;

    await db.knowledgeEntry.create({
      data: {
        source: "file",
        sourcePath: relPath,
        title: title.slice(0, 200),
        content: content.slice(0, 50_000), // Cap at 50KB per entry
        summary: summary?.slice(0, 500) ?? null,
        category,
        tags: JSON.stringify(tags),
        chunkCount: 1,
      },
    });

    return true;
  } catch (err) {
    console.error(`[import] Error importing ${filePath}:`, err);
    return false;
  }
}

async function walkDir(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip raw directories (too many HTML files)
      if (entry.name.includes("raw") || entry.name.includes("evidence-raw")) continue;
      await walkDir(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log("=== Knowledge Base Importer ===");
  console.log(`Source: ${RESEARCH_ROOT}`);

  const result: ImportResult = {
    totalFiles: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    categories: {},
  };

  // Walk the research-export directory
  const files = await walkDir(RESEARCH_ROOT);
  result.totalFiles = files.length;
  console.log(`Found ${files.length} files`);

  // Import in batches
  let batchCount = 0;
  for (const file of files) {
    const imported = await importFile(file);
    if (imported) {
      result.imported++;
      const cat = categorize(file, "");
      result.categories[cat] = (result.categories[cat] ?? 0) + 1;
    } else {
      result.skipped++;
    }

    batchCount++;
    if (batchCount % 50 === 0) {
      console.log(`  Progress: ${batchCount}/${files.length} (imported: ${result.imported})`);
    }
  }

  console.log("\n=== Import Complete ===");
  console.log(`Total files: ${result.totalFiles}`);
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Categories:`, result.categories);

  // Verify
  const count = await db.knowledgeEntry.count();
  console.log(`\nKnowledgeEntry count in DB: ${count}`);

  await db.$disconnect();
}

main().catch(console.error);
