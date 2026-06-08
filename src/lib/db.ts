import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Use /tmp for the database which is always writable
const databaseUrl = 'file:/tmp/jobtracker.db'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    datasourceUrl: databaseUrl,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
