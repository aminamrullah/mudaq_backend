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
      // Walisantri might not have a tenant linked yet (before claiming a student)
      if (user.role === 'WALI_SANTRI') return true;
      
      throw new ForbiddenException(
        'Tenant tidak ditemukan. Hubungi administrator.',
      );
    }

    return true;
  }
}
