import { NextResponse } from 'next/server'
import { readdir, readFile, stat, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WORKSPACE_DIR = '/home/z/my-project/workspace'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  language?: string
  content?: string
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'py': return 'python'
    case 'js': return 'javascript'
    case 'ts': return 'typescript'
    case 'jsx':
    case 'tsx': return 'javascript'
    case 'html': return 'html'
    case 'css': return 'css'
    case 'json': return 'json'
    case 'md': return 'markdown'
    case 'txt': return 'text'
    case 'sh': return 'bash'
    case 'sql': return 'sql'
    case 'yml':
    case 'yaml': return 'yaml'
    case 'xml': return 'xml'
    default: return 'text'
  }
}

async function scanDir(dirPath: string, basePath = ''): Promise<FileNode[]> {
  const nodes: FileNode[] = []
  if (!existsSync(dirPath)) return nodes

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        // Skip hidden dirs and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const subNodes = await scanDir(fullPath, relativePath)
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          size: 0,
        })
        nodes.push(...subNodes)
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.')) continue
        try {
          const stats = await stat(fullPath)
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: stats.size,
            language: detectLanguage(entry.name),
          })
        } catch {}
      }
    }
  } catch {}

  return nodes
}

/**
 * GET /api/dev/files
 * Returns file tree of workspace/
 * Query: ?content=path — get content of specific file
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contentPath = searchParams.get('content')

  if (!existsSync(WORKSPACE_DIR)) {
    await mkdir(WORKSPACE_DIR, { recursive: true })
  }

  if (contentPath) {
    // Block path traversal
    if (contentPath.includes('..') || contentPath.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    const fullPath = path.join(WORKSPACE_DIR, contentPath)
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    try {
      const content = await readFile(fullPath, 'utf-8')
      return NextResponse.json({
        path: contentPath,
        content,
        size: content.length,
        language: detectLanguage(contentPath),
      })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  const files = await scanDir(WORKSPACE_DIR)

  // For each file, also include content (small files only)
  const filesWithContent: FileNode[] = []
  for (const file of files) {
    if (file.type === 'file' && file.size < 50_000) {
      try {
        const fullPath = path.join(WORKSPACE_DIR, file.path)
        const content = await readFile(fullPath, 'utf-8')
        filesWithContent.push({ ...file, content })
      } catch {
        filesWithContent.push(file)
      }
    } else {
      filesWithContent.push(file)
    }
  }

  return NextResponse.json({
    files: filesWithContent,
    count: filesWithContent.filter(f => f.type === 'file').length,
    workspace: WORKSPACE_DIR,
  })
}

/**
 * POST /api/dev/files
 * Body: { path, content }
 * Creates or updates a file in workspace/
 */
export async function POST(req: Request) {
  const body = await req.json()
  const filePath = String(body.path ?? '')
  const content = String(body.content ?? '')

  if (!filePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  if (filePath.includes('..') || filePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const fullPath = path.join(WORKSPACE_DIR, filePath)

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath)
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true })
    }
    await writeFile(fullPath, content, 'utf-8')
    return NextResponse.json({
      saved: true,
      path: filePath,
      size: content.length,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
