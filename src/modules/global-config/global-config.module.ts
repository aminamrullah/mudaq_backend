import { Module, Global } from '@nestjs/common';
import { GlobalConfigService } from './global-config.service';
import { GlobalConfigController } from './global-config.controller';

@Global()
@Module({
  providers: [GlobalConfigService],
  controllers: [GlobalConfigController],
  exports: [GlobalConfigService],
})
export class GlobalConfigModule {}
