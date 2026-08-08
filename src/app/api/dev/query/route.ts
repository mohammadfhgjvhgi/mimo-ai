import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORBIDDEN_KEYWORDS = [
  'DROP', 'DELETE FROM', 'TRUNCATE', 'ALTER TABLE',
  'CREATE TABLE', 'DROP TABLE', 'ATTACH', 'DETACH',
  'PRAGMA write', 'UPDATE User SET email',
]

const ALLOWED_TABLES = [
  'User', 'Preference', 'ApiKey', 'Conversation', 'Message',
  'Memory', 'Entity', 'Relation', 'Task', 'Schedule',
  'Skill', 'ToolCall', 'Trace', 'Approval',
]

/**
 * POST /api/dev/query
 * Body: { sql: string }
 * Returns: { columns, rows, durationMs } or { error }
 *
 * Read-only SQL query runner using Prisma's queryRaw
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const sql = String(body.sql ?? '').trim()

  if (!sql) {
    return NextResponse.json({ error: 'SQL is required' }, { status: 400 })
  }

  // Security: block forbidden keywords (case-insensitive)
  const sqlUpper = sql.toUpperCase()
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (sqlUpper.includes(kw.toUpperCase())) {
      return NextResponse.json({
        error: `🔒 الكلمة المفتاحية "${kw}" ممنوعة. هذا الـ runner للقراءة فقط.`,
      })
    }
  }

  // Only allow SELECT queries (and COUNT, etc.)
  if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('PRAGMA')) {
    return NextResponse.json({
      error: '🔒 مسموح فقط بـ SELECT أو PRAGMA queries',
    })
  }

  const start = Date.now()
  try {
    // Use Prisma's queryRaw for raw SQL
    const rows = await db.$queryRawUnsafe(sql)

    // Convert BigInt values to strings (SQLite returns BigInt for COUNT)
    const serializedRows = Array.isArray(rows)
      ? rows.map((row: any) => {
          const newRow: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row)) {
            newRow[key] = typeof value === 'bigint' ? Number(value) : value
          }
          return Object.values(newRow)
        })
      : []

    // Extract column names from first row
    const columns = Array.isArray(rows) && rows.length > 0
      ? Object.keys(rows[0] as Record<string, unknown>)
      : []

    return NextResponse.json({
      columns,
      rows: serializedRows,
      durationMs: Date.now() - start,
    })
  } catch (e) {
    return NextResponse.json({
      error: `SQL Error: ${(e as Error).message}`,
      durationMs: Date.now() - start,
    })
  }
}
