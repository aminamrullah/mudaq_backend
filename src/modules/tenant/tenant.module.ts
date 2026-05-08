import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { WebhookController } from './webhook.controller';

import { XenditService } from './xendit.service';

@Module({
  controllers: [TenantController, WebhookController],
  providers: [TenantService, XenditService],
  exports: [TenantService],
})
export class TenantModule {}
