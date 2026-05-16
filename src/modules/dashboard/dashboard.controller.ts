import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard stats' })
  getStats(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
  ) {
    if (role === 'USTAD') {
      return this.svc.getTeacherStats(t, userId);
    }
    return this.svc.getStats(t);
  }

  @Get('super-admin/stats')
  @ApiOperation({ summary: 'Get super admin global stats' })
  getSuperAdminStats() {
    return this.svc.getSuperAdminStats();
  }

  @Get('super-admin/finance')
  @ApiOperation({ summary: 'Get super admin financial stats' })
  getSuperAdminFinanceStats() {
    return this.svc.getSuperAdminFinanceStats();
  }
}
