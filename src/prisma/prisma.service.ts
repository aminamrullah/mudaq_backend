import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'production'
        ? [
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ],
    });

    // Global Soft Delete Middleware
    this.$use(async (params, next) => {
      const modelsWithSoftDelete = ['Pesantren', 'User', 'Student', 'Teacher'];
      
      if (params.model && modelsWithSoftDelete.includes(params.model)) {
        if (!params.args) {
          params.args = {};
        }
        if (!params.args.where) {
          params.args.where = {};
        }

        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.action = 'findFirst';
          if (params.args.where.deleted_at === undefined) {
            params.args.where.deleted_at = null;
          }
        }
        
        if (params.action === 'findMany' || params.action === 'count') {
          if (params.args.where.deleted_at === undefined) {
            params.args.where.deleted_at = null;
          }
        }
      }
      return next(params);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('✅ Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
