import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemoWorkspace } from '../src/demo/seed-demo';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the demo account');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  }) as never;
  const user = await seedDemoWorkspace(prisma);
  // eslint-disable-next-line no-console
  console.log(`Demo account ready: demo@nova.app (${user.id})`);
}

void main();
