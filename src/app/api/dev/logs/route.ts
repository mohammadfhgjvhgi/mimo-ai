import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEV_LOG_PATH = '/home/z/my-project/dev.log'

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  source?: string
}

async function parseDevLog(): Promise<LogEntry[]> {
  try {
    if (!existsSync(DEV_LOG_PATH)) return []
    const content = await readFile(DEV_LOG_PATH, 'utf-8')
    const lines = content.split('\n').slice(-200)
    const logs: LogEntry[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      const requestMatch = line.match(/^(GET|POST|PATCH|DELETE|PUT)\s+(\S+)\s+(\d+)\s+in\s+([\d.]+)/)
      if (requestMatch) {
        logs.push({
          level: parseInt(requestMatch[3]) >= 400 ? 'error' : 'info',
          message: `${requestMatch[1]} ${requestMatch[2]} → ${requestMatch[3]} (${requestMatch[4]}ms)`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'HTTP',
        })
        continue
      }

      if (line.includes('✓ Compiled') || line.includes('✓ Ready')) {
        logs.push({
          level: 'info',
          message: line.trim(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
        })
        continue
      }

      if (line.startsWith('⚠')) {
        logs.push({
          level: 'warn',
          message: line.trim(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
        })
        continue
      }

      if (line.includes('Error') || line.includes('error')) {
        logs.push({
          level: 'error',
          message: line.trim().slice(0, 500),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
        })
      }
    }

    return logs.reverse()
  } catch {
    return []
  }
}

export async function GET() {
  const logs = await parseDevLog()
  return NextResponse.json({ logs })
}
