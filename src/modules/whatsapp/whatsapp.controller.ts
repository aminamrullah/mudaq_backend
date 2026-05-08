import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { UpdateWhatsappSettingsDto } from './dto/whatsapp.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';


@ApiTags('whatsapp')
@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get WhatsApp settings' })
  async getSettings(@CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.whatsappService.getSettings(tenantUuid);
  }

  @Post('settings')
  @ApiOperation({ summary: 'Update WhatsApp settings' })
  async updateSettings(
    @CurrentUser('tenant_uuid') tenantUuid: string,
    @Body() dto: UpdateWhatsappSettingsDto
  ) {
    return this.whatsappService.updateSettings(dto, tenantUuid);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status and QR' })
  async getStatus(@CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.whatsappService.getStatus(tenantUuid);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and reset WhatsApp session' })
  async logout(@CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.whatsappService.logoutBaileys(tenantUuid);
  }

}
