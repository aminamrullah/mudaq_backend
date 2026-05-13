import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import * as express from 'express';

const cookieExtractor = (req: express.Request) => {
  let token = null;
  if (req && req.headers && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((res: any, c: string) => {
      const [key, val] = c.trim().split('=').map(decodeURIComponent);
      return { ...res, [key]: val };
    }, {} as any);
    token = cookies['access_token'];
  }
  return token;
};

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenant_uuid: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        tenant_uuid: true,
        is_active: true,
        pesantren: {
          select: {
            id: true,
            name: true,
            subscription_status: true,
            expired_at: true,
          },
        },
      },
    });

    if (!user) {
      console.log('[JwtStrategy] User not found for sub:', payload.sub);
      return null;
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Akun Anda tidak aktif');
    }

    // Check tenant subscription
    if (user.pesantren) {
      if (user.pesantren.subscription_status === 'suspended') {
        throw new UnauthorizedException('Pesantren Anda telah dinonaktifkan');
      }
      // We no longer block expired accounts at the strategy level
      // so they can still access Dashboard and Invoices.
      // The restriction will be handled in the frontend and possibly specific guards.
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      tenant_uuid: user.tenant_uuid,
      pesantren_name: user.pesantren?.name,
      subscription_status: user.pesantren?.subscription_status || 'trial',
      expired_at: user.pesantren?.expired_at,
    };
  }
}
