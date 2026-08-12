import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * نمونهٔ یکتای Prisma.
 *
 * در محیط توسعه، Hot Reload باعث ساخت مکرر Client و باز شدن
 * اتصال‌های اضافی می‌شود؛ نگه داشتن نمونه روی globalThis از این
 * مسئله جلوگیری می‌کند.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
