import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 exports PrismaClient as a const (class factory), not a plain class
 * declaration. We cast it to a typed constructor so TypeScript accepts `extends`
 * and gives us full model / lifecycle method types on `this`.
 */
const PrismaBase = PrismaClient as unknown as {
  new (options: { adapter: InstanceType<typeof PrismaPg> }): PrismaClient;
  prototype: PrismaClient;
};

function createPgAdapter() {
  const connectionString = process.env.DATABASE_URL!;
  const isLocalDb = /localhost|127\.0\.0\.1/i.test(connectionString);
  const needsSsl =
    !isLocalDb &&
    (connectionString.includes('supabase.com') ||
      /sslmode=(require|verify-ca|verify-full)/i.test(connectionString) ||
      !/sslmode=disable/i.test(connectionString));

  if (needsSsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  return new PrismaPg({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

@Injectable()
export class PrismaService extends PrismaBase implements OnModuleInit {
  constructor() {
    super({ adapter: createPgAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
