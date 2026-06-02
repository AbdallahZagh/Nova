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

@Injectable()
export class PrismaService extends PrismaBase implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
