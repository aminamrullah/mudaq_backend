import * as express from 'express';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { StudentService } from './student.service';
import { CreateStudentDto, UpdateStudentDto, BulkMutateStudentDto } from './dto/student.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('students')
@Controller('students')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create santri' })
  create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateStudentDto) {
    return this.studentService.create(t, dto);
  }

  @Post('bulk-mutate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Bulk mutate santri (class promotion/graduation)' })
  bulkMutate(@CurrentUser('tenant_uuid') t: string, @Body() dto: BulkMutateStudentDto) {
    return this.studentService.bulkMutate(t, dto);
  }

  @Post('import')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import santri from Excel' })
  import(
    @CurrentUser('tenant_uuid') t: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.studentService.importExcel(t, file);
  }

  @Get('import/template')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Download Excel template for import' })
  downloadTemplate(@Res() res: express.Response) {
    const buffer = this.studentService.generateTemplate();
    res.setHeader('Content-Disposition', 'attachment; filename=template_import_santri.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.STAFF_PESANTREN, Role.USTAD, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  @ApiOperation({ summary: 'List santri' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'classroom_id', required: false })
  @ApiQuery({ name: 'dormitory_id', required: false })
  @ApiQuery({ name: 'dormitory_room_id', required: false })
  @ApiQuery({ name: 'tahfidz_teacher_id', required: false })
  @ApiQuery({ name: 'quran_teacher_id', required: false })
  @ApiQuery({ name: 'kitab_teacher_id', required: false })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
    @Query('search') s?: string,
    @Query('status') st?: string,
    @Query('classroom_id') cid?: string,
    @Query('dormitory_id') did?: string,
    @Query('dormitory_room_id') drid?: string,
    @Query('tahfidz_teacher_id') ttid?: string,
    @Query('quran_teacher_id') qtid?: string,
    @Query('kitab_teacher_id') ktid?: string,
  ) {
    return this.studentService.findAll(t, p, l, s, st, cid, did, drid, ttid, qtid, ktid);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.STAFF_PESANTREN, Role.USTAD, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  @ApiOperation({ summary: 'Get santri detail' })
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.studentService.findOne(t, id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentService.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.studentService.remove(t, id);
  }

  // ── Health Records ──
  @Get(':id/health')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  getHealth(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.studentService.getHealthRecords(t, id);
  }

  @Post(':id/health')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  createHealth(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() body: any) {
    return this.studentService.createHealthRecord(t, id, body);
  }

  // ── Violations ──
  @Get(':id/violations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  getViolations(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.studentService.getViolations(t, id);
  }

  @Post(':id/violations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  createViolation(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() body: any) {
    return this.studentService.createViolation(t, id, body);
  }

  // ── Permissions ──
  @Get(':id/permissions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  getPermissions(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.studentService.getPermissions(t, id);
  }

  @Put('permissions/:pid/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  updatePermissionStatus(
    @CurrentUser('tenant_uuid') t: string,
    @Param('pid') pid: string,
    @Body('status') status: string
  ) {
    return this.studentService.updatePermissionStatus(t, pid, status);
  }

  @Post(':id/permissions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  createPermission(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.studentService.createPermission(t, id, body);
  }

  @Post(':id/tahfidz')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN, Role.USTAD)
  createTahfidz(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() body: any) {
    return this.studentService.createTahfidzRecord(t, id, body);
  }
}
