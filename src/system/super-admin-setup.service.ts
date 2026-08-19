import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../generated/prisma/enums.js';
import { normalizeUsername } from '../common/utils/username.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuperAdminSetupService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    email: string;
    password: string;
    fullName: string;
    username: string;
  }) {
    if (!process.env.SUPER_ADMIN_SETUP_KEY?.trim()) {
      throw new NotFoundException();
    }

    const email = input.email.trim().toLowerCase();
    const username = normalizeUsername(input.username);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing?.email === email) {
      throw new ConflictException('Email is already registered');
    }
    if (existing?.username === username) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        fullName: input.fullName.trim(),
        roleTitle: '',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        isArchived: false,
        isDemo: false,
      },
    });

    return { ok: true };
  }
}
