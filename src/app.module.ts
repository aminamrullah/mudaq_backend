import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { StudentModule } from './modules/student/student.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { BillingModule } from './modules/billing/billing.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DormitoryModule } from './modules/dormitory/dormitory.module';
import { GlobalConfigModule } from './modules/global-config/global-config.module';
import { UploadModule } from './modules/upload/upload.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AcademicModule } from './modules/academic/academic.module';
import { TahfidzModule } from './modules/tahfidz/tahfidz.module';
import { TeacherAttendanceModule } from './modules/teacher-attendance/teacher-attendance.module';
import { TeachingJournalModule } from './modules/teaching-journal/teaching-journal.module';
import { WalisantriModule } from './modules/walisantri/walisantri.module';
import { PostModule } from './modules/post/post.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ExpenditureModule } from './modules/expenditure/expenditure.module';
import { ProblemTicketModule } from './modules/problem-ticket/problem-ticket.module';
import { MailModule } from './modules/mail/mail.module';
import { KoperasiModule } from './modules/koperasi/koperasi.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PpdbModule } from './modules/ppdb/ppdb.module';
import { InventoryModule } from './modules/inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    TenantModule,
    UserModule,
    DashboardModule,
    StudentModule,
    TeacherModule,
    AttendanceModule,
    BillingModule,
    WalletModule,
    PayrollModule,
    DormitoryModule,
    GlobalConfigModule,
    UploadModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
    }),
    AcademicModule,
    TahfidzModule,
    TeacherAttendanceModule,
    TeachingJournalModule,
    WalisantriModule,
    PostModule,
    WhatsappModule,
    ExpenditureModule,
    ProblemTicketModule,
    MailModule,
    KoperasiModule,
    PpdbModule,
    InventoryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})

export class AppModule {}
