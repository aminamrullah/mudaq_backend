import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Logger } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      this.logger.warn('No user found in request');
      throw new ForbiddenException('Akses ditolak');
    }

    // SUPER_ADMIN has access to everything
    if (user.role === Role.SUPER_ADMIN) return true;

    if (!requiredRoles.includes(user.role)) {
      this.logger.warn(`Forbidden: User role "${user.role}" not in required roles [${requiredRoles.join(', ')}] for path: ${context.switchToHttp().getRequest().url}`);
      throw new ForbiddenException('Anda tidak memiliki akses ke resource ini');
    }

    return true;
  }
}
