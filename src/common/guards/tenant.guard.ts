import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Akses ditolak');

    // SUPER_ADMIN doesn't need tenant_uuid
    if (user.role === 'SUPER_ADMIN') return true;

    if (!user.tenant_uuid) {
      throw new ForbiddenException(
        'Tenant tidak ditemukan. Hubungi administrator.',
      );
    }

    return true;
  }
}
