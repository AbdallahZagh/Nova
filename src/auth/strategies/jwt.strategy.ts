import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthUser {
  id: string;
  email: string;
}

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, isArchived: true },
    });

    if (!user || !user.isActive || user.isArchived) {
      throw new UnauthorizedException('User is not active');
    }

    return { id: user.id, email: user.email };
  }
}
