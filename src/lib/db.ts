// Prisma 7 client — uses adapter-based connection
// See: https://pris.ly/d/prisma7-client-config
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'node:path'

// P-fix: Prisma 7 generates client to .prisma/client — ensure it's resolvable

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, '') ?? path.join(process.cwd(), 'db', 'custom.db')

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  } as ConstructorParameters<typeof PrismaClient>[0])
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
