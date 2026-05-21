import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../utils/phone.util';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Akses ditolak');

    // SUPER_ADMIN doesn't need tenant_uuid
    if (user.role === 'SUPER_ADMIN') return true;

    if (!user.tenant_uuid) {
      // Walisantri might not have a tenant linked yet (before claiming a student)
      if (user.role === 'WALI_SANTRI') {
        if (user.phone) {
          const cleanPhone = user.phone.replace(/[^0-9]/g, '');
          const normalizedPhone = normalizePhone(cleanPhone);
          const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;
          const phoneVariants = [normalizedPhone, legacyPhone, cleanPhone, user.phone].filter(Boolean) as string[];

          const student = await this.prisma.student.findFirst({
            where: {
              parent_phone: { in: phoneVariants },
              deleted_at: null,
            },
            select: { tenant_uuid: true },
          });

          if (student) {
            user.tenant_uuid = student.tenant_uuid;
          }
        }
        return true;
      }
      
      throw new ForbiddenException(
        'Tenant tidak ditemukan. Hubungi administrator.',
      );
    }

    // Pengecekan Addon Koperasi
    if (request.url.includes('/koperasi')) {
      const tenantUuid = user.tenant_uuid;
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { addon_koperasi: true },
      });
      if (!pesantren?.addon_koperasi) {
        throw new ForbiddenException(
          'Fitur Koperasi & Kantin belum diaktifkan untuk pesantren Anda. Hubungi Superadmin.',
        );
      }
    }

    return true;
  }
}
