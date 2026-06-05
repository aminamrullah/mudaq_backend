import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
import { UserWalletService } from './user-wallet.service';
import { UserTopupDto, UserWithdrawDto } from './dto/user-wallet.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('user-wallet')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
export class UserWalletController {
  constructor(private readonly userWalletService: UserWalletService) {}

  @Get('my-wallet')
  getMyWallet(@CurrentUser() user: any) {
    return this.userWalletService.getMyWallet(user.tenant_uuid, user.id);
  }

  @Get('transactions/:walletId')
  getTransactions(
    @CurrentUser() user: any,
    @Param('walletId') walletId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userWalletService.getTransactions(
      user.tenant_uuid,
      walletId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post('manual-topup')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.SUPER_ADMIN)
  createManualTopup(@CurrentUser() user: any, @Body() dto: UserTopupDto) {
    return this.userWalletService.createManualTopup(user.tenant_uuid, dto);
  }

  @Post('withdraw')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.SUPER_ADMIN)
  withdraw(@CurrentUser() user: any, @Body() dto: UserWithdrawDto) {
    return this.userWalletService.withdraw(user.tenant_uuid, dto);
  }
}
