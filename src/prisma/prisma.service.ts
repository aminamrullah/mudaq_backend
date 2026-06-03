import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private cls: ClsService) {
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

    // Global Tenant Scoping Middleware
    this.$use(async (params, next) => {
      let tenant_uuid = null;
      try {
        tenant_uuid = this.cls.get('tenant_uuid');
      } catch (e) {
        // Ignore if outside of CLS context
      }

      const tenantModels = [
        'AcademicYear', 'AcademicPeriod', 'Subject', 'SubjectCategory', 'Classroom', 
        'Dormitory', 'DormitoryRoom', 'Schedule', 'Kitab', 'Student', 'Teacher', 'Attendance', 
        'TahfidzRecord', 'Violation', 'HealthRecord', 'StudentPermission', 
        'FeeCategory', 'Bill', 'Transaction', 'Wallet', 'WalletTransaction', 
        'TenantWallet', 'TenantWalletTransaction', 'User', 'Post', 'SaasInvoice', 
        'UsageLog', 'QuestionBank', 'Exam', 'ExamSchedule', 'ExamResult', 
        'ReportCard', 'DonationDisbursement', 'TeacherAttendance', 'TeachingJournal', 
        'StudentHistory', 'DailyAssignment', 'AssignmentGrade', 'Expenditure', 
        'UserActivity', 'ProblemTicket', 'KoperasiOutlet', 'ProductCategory', 
        'ProductUnit', 'Product', 'PosSession', 'PosOrder', 'StockMovement', 
        'StockOpname', 'Promotion', 'InventoryItem', 'InventoryCategory', 
        'InventoryLocation', 'InventoryMutation', 'PpdbWave'
      ];

      if (tenant_uuid && params.model && tenantModels.includes(params.model)) {
        if (!params.args) params.args = {};

        if (params.action === 'findUnique') {
          params.action = 'findFirst';
        }

        if (['findFirst', 'findMany', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
          if (!params.args.where) params.args.where = {};
          params.args.where.tenant_uuid = tenant_uuid;
        }
      }
      return next(params);
    });

    // Global Soft Delete Middleware
    this.$use(async (params, next) => {
      const modelsWithSoftDelete = ['Pesantren', 'User', 'Student', 'Teacher'];
      
      if (params.model && modelsWithSoftDelete.includes(params.model)) {
        if (!params.args) {
          params.args = {};
        }

        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.action = 'findFirst';
          if (!params.args.where) params.args.where = {};
          if (params.args.where.deleted_at === undefined) {
            params.args.where.deleted_at = null;
          }
        }
        
        if (params.action === 'findMany' || params.action === 'count') {
          if (!params.args.where) params.args.where = {};
          if (params.args.where.deleted_at === undefined) {
            params.args.where.deleted_at = null;
          }
        }
      }

      // Automatically apply soft delete to nested to-many includes/selects
      if (params.args) {
        const injectSoftDeleteForToMany = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          const toManyRelations = [
            'students', 'tahfidz_students', 'quran_students', 'kitab_students', 
            'teachers', 'users', 'assigned_users'
          ];
          
          for (const key of Object.keys(obj)) {
            if (toManyRelations.includes(key)) {
              if (obj[key] === true) {
                obj[key] = { where: { deleted_at: null } };
              } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (!obj[key].where) obj[key].where = {};
                if (obj[key].where.deleted_at === undefined) {
                  obj[key].where.deleted_at = null;
                }
              }
            }
            
            // Recursively traverse deeper levels
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              if (obj[key].include) injectSoftDeleteForToMany(obj[key].include);
              if (obj[key].select) injectSoftDeleteForToMany(obj[key].select);
            }
          }
        };

        if (params.args.include) injectSoftDeleteForToMany(params.args.include);
        if (params.args.select) injectSoftDeleteForToMany(params.args.select);
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
