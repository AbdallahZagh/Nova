import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthUser {
  id: string;
  email: string;
}

/** Shape of a Supabase-issued JWT payload. */
interface SupabaseJwtPayload {
  sub: string;            // Supabase auth.users UUID
  email?: string;
  aud?: string;
  role?: string;
  iat?: number;
  exp?: number;
  user_metadata?: {
    full_name?: string;
    name?: string;
    [key: string]: unknown;
  };
  app_metadata?: Record<string, unknown>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.SUPABASE_JWT_SECRET!,
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * Syncs the Supabase identity into our Prisma User table on first login,
   * then attaches { id, email } to request.user for all protected routes.
   */
  async validate(payload: SupabaseJwtPayload): Promise<AuthUser> {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

    const id       = payload.sub;
    const email    = payload.email ?? '';
    const meta = payload.user_metadata ?? {};
    const fullName =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      '';
    const avatarUrl =
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null;

    // Auto-provision user on first Supabase login
    let user = await (this.prisma as any).user.findUnique({ where: { id } });

    if (!user) {
      const username = await this.generateUsername(email);
      user = await (this.prisma as any).user.create({
        data: {
          id,
          email,
          username,
          fullName,
          avatarUrl,
          // passwordHash is a legacy field — not used for Supabase-auth users
          passwordHash: '',
          isActive: true,
          isArchived: false,
        },
      });
    }

    return { id: user.id, email: user.email };
  }

  /** Derives a unique @username from the email prefix. */
  private async generateUsername(email: string): Promise<string> {
    const base = '@' + email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    let candidate = base;
    let suffix = 1;

    while (await (this.prisma as any).user.findUnique({ where: { username: candidate } })) {
      candidate = `${base}_${suffix++}`;
    }

    return candidate;
  }
}
