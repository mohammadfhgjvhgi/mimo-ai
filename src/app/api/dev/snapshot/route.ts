import { NextRequest, NextResponse } from 'next/server'
import { mkdir, readdir, writeFile, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SNAPSHOTS_DIR = '/home/z/my-project/workspace/snapshots'

interface Snapshot {
  id: string
  name: string
  timestamp: string
  url: string
  deviceMode: string
  size: string
  thumbnail?: string
  content?: string
}

async function ensureDir() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    await mkdir(SNAPSHOTS_DIR, { recursive: true })
  }
}

async function listSnapshots(): Promise<Snapshot[]> {
  await ensureDir()
  try {
    const files = await readdir(SNAPSHOTS_DIR)
    const snapshots: Snapshot[] = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await readFile(path.join(SNAPSHOTS_DIR, file), 'utf-8')
        const data = JSON.parse(content)
        snapshots.push(data)
      } catch {}
    }

    return snapshots.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  } catch {
    return []
  }
}

/**
 * GET /api/dev/snapshot
 * List all snapshots
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const download = searchParams.get('download') === 'true'

  if (id) {
    // Return specific snapshot
    try {
      const filePath = path.join(SNAPSHOTS_DIR, `${id}.json`)
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content)

      if (download && data.content) {
        // Return as PNG file
        const buffer = Buffer.from(data.content, 'base64')
        return new NextResponse(buffer as any, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="${data.name}.png"`,
          },
        })
      }

      return NextResponse.json({ snapshot: data })
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const snapshots = await listSnapshots()
  return NextResponse.json({ snapshots })
}

/**
 * POST /api/dev/snapshot
 * Body: { name, url, deviceMode, content? }
 * Saves a new snapshot
 */
export async function POST(req: NextRequest) {
  await ensureDir()
  const body = await req.json()

  const id = `snap-${Date.now()}`
  const snapshot: Snapshot = {
    id,
    name: body.name ?? `snapshot-${new Date().toISOString()}`,
    timestamp: new Date().toISOString(),
    url: body.url ?? '/',
    deviceMode: body.deviceMode ?? 'desktop',
    size: '0 KB',
    content: body.content,
    thumbnail: body.content ? `data:image/png;base64,${body.content.slice(0, 1000)}` : undefined,
  }

  // Calculate size
  if (body.content) {
    const bytes = Math.floor(body.content.length * 0.75) // base64 → bytes approx
    snapshot.size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
  }

  try {
    await writeFile(
      path.join(SNAPSHOTS_DIR, `${id}.json`),
      JSON.stringify(snapshot, null, 2),
      'utf-8'
    )
    // Don't return full content in list view
    const { content, ...meta } = snapshot
    return NextResponse.json({ snapshot: meta })
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to save snapshot: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dev/snapshot?id=xxx
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    await unlink(path.join(SNAPSHOTS_DIR, `${id}.json`))
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
