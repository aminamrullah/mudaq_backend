import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Ensure default settings exist
    const defaults = [
      { key: 'default_trial_duration_days', value: '14' },
      { key: 'default_platform_fee', value: '2500' },
      { key: 'topup_bank_name', value: 'Bank BSI' },
      { key: 'topup_bank_account', value: '7123456789' },
      { key: 'topup_bank_owner', value: 'A.N. PT MUDAQ TEKNOLOGI' },
    ];

    for (const item of defaults) {
      await this.prisma.globalConfig.upsert({
        where: { key: item.key },
        update: {},
        create: item,
      });
    }
  }

  async getAll() {
    const configs = await this.prisma.globalConfig.findMany();
    return configs.reduce((acc: Record<string, string>, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  }

  async update(key: string, value: string) {
    return this.prisma.globalConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async updateBulk(configs: Record<string, string>) {
    const promises = Object.entries(configs).map(([key, value]) =>
      this.update(key, String(value)),
    );
    return Promise.all(promises);
  }

  async getValue(key: string, defaultValue: string = ''): Promise<string> {
    const config = await this.prisma.globalConfig.findUnique({
      where: { key },
    });
    return config ? config.value : defaultValue;
  }
}
