import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { createPublicKey } from 'crypto';
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
    avatar_url?: string;
    picture?: string;
    [key: string]: unknown;
  };
  app_metadata?: Record<string, unknown>;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JsonWebKey {
  kid?: string;
  [key: string]: unknown;
}

let cachedJwks: { keys: JsonWebKey[]; expiresAt: number } | null = null;

function decodeBase64UrlJson<T>(value: string): T {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

async function getSupabaseJwks(): Promise<JsonWebKey[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new UnauthorizedException('SUPABASE_URL is required for JWKS tokens');
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!response.ok) {
    throw new UnauthorizedException('Unable to load Supabase signing keys');
  }

  const body = (await response.json()) as { keys?: JsonWebKey[] };
  cachedJwks = {
    keys: body.keys ?? [],
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  return cachedJwks.keys;
}

async function resolveSupabaseSigningKey(token: string): Promise<string | Buffer> {
  const [encodedHeader] = token.split('.');
  if (!encodedHeader) throw new UnauthorizedException('Invalid token header');

  const header = decodeBase64UrlJson<JwtHeader>(encodedHeader);

  if (header.alg?.startsWith('HS')) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('SUPABASE_JWT_SECRET is required');
    }
    return secret;
  }

  if (!header.kid) throw new UnauthorizedException('Missing token key id');

  const keys = await getSupabaseJwks();
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new UnauthorizedException('Unknown Supabase signing key');

  return createPublicKey({ key, format: 'jwk' }).export({
    type: 'spki',
    format: 'pem',
  });
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (_request, rawJwtToken, done) => {
        try {
          done(null, await resolveSupabaseSigningKey(rawJwtToken));
        } catch (error) {
          done(error as Error);
        }
      },
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * Syncs the Supabase identity into our Prisma User table on first login,
   * then attaches { id, email } to request.user for all protected routes.
   */
  async validate(payload: SupabaseJwtPayload): Promise<AuthUser> {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

    const id = payload.sub;
    const email = payload.email?.toLowerCase();
    if (!email) throw new UnauthorizedException('Token email is required');

    const meta = payload.user_metadata ?? {};
    const fullName =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      email.split('@')[0];
    const avatarUrl =
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null;

    // Auto-provision user on first Supabase login
    let user = await (this.prisma as any).user.findUnique({ where: { id } });

    if (!user) {
      const existingByEmail = await (this.prisma as any).user.findUnique({
        where: { email },
      });

      if (existingByEmail) {
        user = await (this.prisma as any).user.update({
          where: { email },
          data: {
            id,
            fullName: existingByEmail.fullName || fullName,
            avatarUrl: existingByEmail.avatarUrl ?? avatarUrl,
            isActive: true,
            isArchived: false,
          },
        });

        return { id: user.id, email: user.email };
      }

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
