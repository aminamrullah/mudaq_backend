import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AcademicService } from './academic.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  CreateAcademicPeriodDto,
  UpdateAcademicPeriodDto,
  CreateClassroomDto,
  UpdateClassroomDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateScheduleDto,
  CreateQuestionBankDto,
  UpdateQuestionBankDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateExamDto,
  UpdateExamDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  GenerateReportCardDto,
  UpdateReportCardDto,
  SaveReportCardDto,
  SaveExamResultDto,
  CreateSubjectCategoryDto,
  UpdateSubjectCategoryDto,
  CreateKitabDto,
  UpdateKitabDto,
  UpdateScheduleDto,
} from './dto/academic.dto';

@ApiTags('academic')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  // ==========================================
  // Academic Years
  // ==========================================
  @Get('years')
  @ApiOperation({ summary: 'Get academic years' })
  getAcademicYears(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getAcademicYears(t);
  }

  @Post('years')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create academic year' })
  createAcademicYear(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateAcademicYearDto) {
    return this.academicService.createAcademicYear(t, dto);
  }

  @Put('years/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update academic year' })
  updateAcademicYear(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academicService.updateAcademicYear(t, id, dto);
  }

  @Delete('years/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete academic year' })
  deleteAcademicYear(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteAcademicYear(t, id);
  }

  @Post('years/:yearId/periods')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create academic period' })
  createAcademicPeriod(
    @CurrentUser('tenant_uuid') t: string,
    @Param('yearId') yearId: string,
    @Body() dto: CreateAcademicPeriodDto,
  ) {
    return this.academicService.createAcademicPeriod(t, yearId, dto);
  }

  @Put('periods/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update academic period' })
  updateAcademicPeriod(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicPeriodDto,
  ) {
    return this.academicService.updateAcademicPeriod(t, id, dto);
  }

  @Delete('periods/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete academic period' })
  deleteAcademicPeriod(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteAcademicPeriod(t, id);
  }

  // ==========================================
  // Classrooms
  // ==========================================
  @Get('classrooms')
  @ApiOperation({ summary: 'Get classrooms' })
  getClassrooms(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getClassrooms(t);
  }

  @Post('classrooms')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create classroom' })
  createClassroom(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateClassroomDto) {
    return this.academicService.createClassroom(t, dto);
  }

  @Put('classrooms/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update classroom' })
  updateClassroom(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateClassroomDto,
  ) {
    return this.academicService.updateClassroom(t, id, dto);
  }

  @Delete('classrooms/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete classroom' })
  deleteClassroom(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteClassroom(t, id);
  }

  // ==========================================
  // Subjects
  // ==========================================
  @Get('subjects')
  @ApiOperation({ summary: 'Get subjects' })
  getSubjects(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getSubjects(t);
  }

  @Post('subjects')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create subject' })
  createSubject(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateSubjectDto) {
    return this.academicService.createSubject(t, dto);
  }

  @Put('subjects/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update subject' })
  updateSubject(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.academicService.updateSubject(t, id, dto);
  }

  @Delete('subjects/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete subject' })
  deleteSubject(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteSubject(t, id);
  }

  // ==========================================
  // Kitabs
  // ==========================================
  @Get('kitabs')
  @ApiOperation({ summary: 'Get kitabs' })
  getKitabs(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getKitabs(t);
  }

  @Post('kitabs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create kitab' })
  createKitab(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateKitabDto) {
    return this.academicService.createKitab(t, dto);
  }

  @Put('kitabs/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update kitab' })
  updateKitab(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateKitabDto,
  ) {
    return this.academicService.updateKitab(t, id, dto);
  }

  @Delete('kitabs/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete kitab' })
  deleteKitab(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteKitab(t, id);
  }

  // ==========================================
  // Subject Categories
  // ==========================================
  @Get('categories')
  @ApiOperation({ summary: 'Get subject categories' })
  getSubjectCategories(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getSubjectCategories(t);
  }

  @Post('categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create subject category' })
  createSubjectCategory(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateSubjectCategoryDto) {
    return this.academicService.createSubjectCategory(t, dto);
  }

  @Put('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update subject category' })
  updateSubjectCategory(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectCategoryDto
  ) {
    return this.academicService.updateSubjectCategory(t, id, dto);
  }

  @Delete('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete subject category' })
  deleteSubjectCategory(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteSubjectCategory(t, id);
  }

  // ==========================================
  // Schedules
  // ==========================================
  @Get('schedules')
  @ApiOperation({ summary: 'Get schedules' })
  @ApiQuery({ name: 'classroom_id', required: false })
  @ApiQuery({ name: 'my_only', required: false })
  getSchedules(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Query('classroom_id') classroomId?: string,
    @Query('my_only') myOnly?: string,
  ) {
    return this.academicService.getSchedules(t, role, userId, classroomId, myOnly === 'true');
  }

  @Post('schedules')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Create schedule' })
  createSchedule(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateScheduleDto) {
    return this.academicService.createSchedule(t, dto);
  }

  @Put('schedules/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Update schedule' })
  updateSchedule(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.academicService.updateSchedule(t, id, dto);
  }

  @Delete('schedules/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Delete schedule' })
  deleteSchedule(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteSchedule(t, id);
  }

  // ==========================================
  // Question Banks
  // ==========================================
  @Get('question-banks')
  @ApiOperation({ summary: 'Get question banks' })
  @ApiQuery({ name: 'subject_id', required: false })
  getQuestionBanks(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Query('subject_id') subjectId?: string,
  ) {
    return this.academicService.getQuestionBanks(t, role, userId, subjectId);
  }

  @Post('question-banks')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create question bank' })
  createQuestionBank(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateQuestionBankDto) {
    return this.academicService.createQuestionBank(t, dto);
  }

  @Put('question-banks/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update question bank' })
  updateQuestionBank(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionBankDto,
  ) {
    return this.academicService.updateQuestionBank(t, id, dto);
  }

  @Delete('question-banks/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete question bank' })
  deleteQuestionBank(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteQuestionBank(t, id);
  }

  // ==========================================
  // Questions
  // ==========================================
  @Get('question-banks/:bankId/questions')
  @ApiOperation({ summary: 'Get questions for a bank' })
  getQuestions(@Param('bankId') bankId: string) {
    return this.academicService.getQuestions(bankId);
  }

  @Post('questions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create question' })
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.academicService.createQuestion(dto);
  }

  @Put('questions/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update question' })
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.academicService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete question' })
  deleteQuestion(@Param('id') id: string) {
    return this.academicService.deleteQuestion(id);
  }

  // ==========================================
  // Exams
  // ==========================================
  @Get('exams')
  @ApiOperation({ summary: 'Get exams' })
  getExams(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getExams(t);
  }

  @Post('exams')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create exam' })
  createExam(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateExamDto) {
    return this.academicService.createExam(t, dto);
  }

  @Put('exams/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update exam' })
  updateExam(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
  ) {
    return this.academicService.updateExam(t, id, dto);
  }

  @Delete('exams/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete exam' })
  deleteExam(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteExam(t, id);
  }

  @Get('questions-by-subject')
  @ApiOperation({ summary: 'Get all questions for a subject (optional filter by kitab)' })
  @ApiQuery({ name: 'subject_id', required: true })
  @ApiQuery({ name: 'kitab_id', required: false })
  getQuestionsBySubject(
    @CurrentUser('tenant_uuid') t: string, 
    @Query('subject_id') subjectId: string,
    @Query('kitab_id') kitabId?: string
  ) {
    return this.academicService.getQuestionsBySubject(t, subjectId, kitabId);
  }

  // ==========================================
  // Exam Schedules
  // ==========================================
  @Get('exam-schedules')
  @ApiOperation({ summary: 'Get exam schedules' })
  @ApiQuery({ name: 'exam_id', required: false })
  @ApiQuery({ name: 'classroom_id', required: false })
  getExamSchedules(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Query('exam_id') examId?: string,
    @Query('classroom_id') classroomId?: string,
  ) {
    return this.academicService.getExamSchedules(t, role, userId, examId, classroomId);
  }

  @Post('exam-schedules')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create exam schedule' })
  createExamSchedule(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateExamScheduleDto) {
    return this.academicService.createExamSchedule(t, dto);
  }

  @Put('exam-schedules/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Update exam schedule (Submit paper/Approve paper/Update detail)' })
  updateExamSchedule(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateExamScheduleDto,
  ) {
    return this.academicService.updateExamSchedule(t, id, dto);
  }

  @Delete('exam-schedules/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete exam schedule' })
  deleteExamSchedule(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.deleteExamSchedule(t, id);
  }

  @Get('exam-schedules/:id/results')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Get exam student results' })
  getExamResults(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.getExamResults(t, id);
  }

  @Post('exam-schedules/:id/results')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Save exam student results' })
  saveExamResults(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: SaveExamResultDto,
  ) {
    return this.academicService.saveExamResults(t, id, userId, role, dto);
  }

  // ==========================================
  // Report Cards
  // ==========================================

  @Get('report-cards/my-homeroom')
  @ApiOperation({ summary: 'Get classes where current user is homeroom teacher' })
  getMyHomeroomClasses(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string) {
    return this.academicService.getMyHomeroomClasses(t, u);
  }

  @Get('report-cards')
  @ApiOperation({ summary: 'Get report cards for a class' })
  getReportCards(@CurrentUser('tenant_uuid') t: string, @Query() query: GenerateReportCardDto) {
    return this.academicService.getReportCards(t, query);
  }
  
  @Post('report-cards')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Save report card manually' })
  saveReportCard(@CurrentUser('tenant_uuid') t: string, @Body() dto: SaveReportCardDto) {
    return this.academicService.saveReportCard(t, dto);
  }

  @Post('report-cards/generate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Generate or sync report cards for a class' })
  generateReportCards(@CurrentUser('tenant_uuid') t: string, @Body() dto: GenerateReportCardDto) {
    return this.academicService.generateReportCards(t, dto);
  }

  @Put('report-cards/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Update report card (notes, status, etc)' })
  updateReportCard(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() dto: UpdateReportCardDto) {
    return this.academicService.updateReportCard(t, id, dto);
  }

  // ==========================================
  // Classroom Student Management
  // ==========================================
  @Get('classrooms/:id/students')
  @ApiOperation({ summary: 'Get students in a classroom' })
  getStudentsInClass(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.academicService.getStudentsInClass(t, id);
  }

  @Get('students/unassigned')
  @ApiOperation({ summary: 'Get students without a classroom' })
  getUnassignedStudents(@CurrentUser('tenant_uuid') t: string) {
    return this.academicService.getUnassignedStudents(t);
  }

  @Post('classrooms/:id/assign-students')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Assign students to a classroom' })
  assignStudentsToClass(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body('student_ids') studentIds: string[],
  ) {
    return this.academicService.assignStudentsToClass(t, id, studentIds);
  }

  @Post('students/remove-from-class')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Remove students from their classroom' })
  removeStudentsFromClass(
    @CurrentUser('tenant_uuid') t: string,
    @Body('student_ids') studentIds: string[],
  ) {
    return this.academicService.removeStudentsFromClass(t, studentIds);
  }
  // ==========================================
  // Daily Assignments
  // ==========================================
  @Get('assignments')
  @ApiOperation({ summary: 'Get daily assignments' })
  @ApiQuery({ name: 'classroom_id', required: false })
  getAssignments(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Query('classroom_id') classroomId?: string,
  ) {
    return this.academicService.getAssignments(t, role, userId, classroomId);
  }

  @Post('assignments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Create daily assignment and grades' })
  createAssignment(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.academicService.createAssignment(t, userId, dto);
  }

  @Get('assignments/:id')
  @ApiOperation({ summary: 'Get daily assignment detail' })
  getAssignmentDetail(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.academicService.getAssignmentDetail(t, id);
  }

  @Put('assignments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Update daily assignment and grades' })
  updateAssignment(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.academicService.updateAssignment(t, userId, role, id, dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD)
  @ApiOperation({ summary: 'Delete daily assignment' })
  deleteAssignment(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    return this.academicService.deleteAssignment(t, userId, role, id);
  }
}
