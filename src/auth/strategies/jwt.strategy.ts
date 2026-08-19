import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service';
import { jwtSecret } from '../jwt-secret';

export interface AuthUser {
  id: string;
  email: string;
  isDemo: boolean;
  role: UserRole;
}

interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        isArchived: true,
        isDemo: true,
        role: true,
        tokensValidAfter: true,
      },
    });

    if (!user || !user.isActive || user.isArchived) {
      throw new UnauthorizedException('User is not active');
    }

    if (
      user.tokensValidAfter &&
      typeof payload.iat === 'number' &&
      payload.iat < Math.floor(user.tokensValidAfter.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      id: user.id,
      email: user.email,
      isDemo: Boolean(user.isDemo),
      role: user.role,
    };
  }
}
