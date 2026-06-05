import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
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

@Injectable()
export class AcademicService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) { }

  // ==========================================
  // Academic Years
  // ==========================================
  async getAcademicYears(tenantId: string) {
    return this.prisma.academicYear.findMany({
      where: { tenant_uuid: tenantId },
      include: { periods: true },
      orderBy: { start_date: 'desc' },
    });
  }

  async createAcademicYear(tenantId: string, dto: CreateAcademicYearDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_active) {
        await tx.academicYear.updateMany({
          where: { tenant_uuid: tenantId },
          data: { is_active: false },
        });
      }
      return tx.academicYear.create({
        data: {
          tenant_uuid: tenantId,
          name: dto.name,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          is_active: dto.is_active || false,
        },
      });
    });
  }

  async updateAcademicYear(tenantId: string, id: string, dto: UpdateAcademicYearDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_active) {
        await tx.academicYear.updateMany({
          where: { tenant_uuid: tenantId },
          data: { is_active: false },
        });
      }
      const data: any = { ...dto };
      if (dto.start_date) data.start_date = new Date(dto.start_date);
      if (dto.end_date) data.end_date = new Date(dto.end_date);

      return tx.academicYear.update({
        where: { id, tenant_uuid: tenantId },
        data,
      });
    });
  }

  async deleteAcademicYear(tenantId: string, id: string) {
    return this.prisma.academicYear.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Academic Periods
  // ==========================================
  async createAcademicPeriod(tenantId: string, yearId: string, dto: CreateAcademicPeriodDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_active) {
        await tx.academicPeriod.updateMany({
          where: { tenant_uuid: tenantId },
          data: { is_active: false },
        });
      }
      return tx.academicPeriod.create({
        data: {
          tenant_uuid: tenantId,
          academic_year_id: yearId,
          name: dto.name,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          is_active: dto.is_active || false,
        },
      });
    });
  }

  async updateAcademicPeriod(tenantId: string, id: string, dto: UpdateAcademicPeriodDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_active) {
        await tx.academicPeriod.updateMany({
          where: { tenant_uuid: tenantId },
          data: { is_active: false },
        });
      }
      const data: any = { ...dto };
      if (dto.start_date) data.start_date = new Date(dto.start_date);
      if (dto.end_date) data.end_date = new Date(dto.end_date);

      return tx.academicPeriod.update({
        where: { id, tenant_uuid: tenantId },
        data,
      });
    });
  }

  async deleteAcademicPeriod(tenantId: string, id: string) {
    return this.prisma.academicPeriod.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Classrooms
  // ==========================================
  async getClassrooms(tenantId: string) {
    const unitId = this.cls.get('unit_id');
    return this.prisma.classroom.findMany({
      where: { 
        tenant_uuid: tenantId,
        ...(unitId ? { unit_id: unitId } : {})
      },
      include: { homeroom: true, academic_year: true },
    });
  }

  async createClassroom(tenantId: string, dto: CreateClassroomDto) {
    return this.prisma.classroom.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        name: dto.name,
        level: dto.level,
        academic_year_id: dto.academic_year_id || undefined,
        homeroom_teacher_id: dto.homeroom_teacher_id || undefined,
        capacity: dto.capacity || 40,
      },
    });
  }

  async updateClassroom(tenantId: string, id: string, dto: UpdateClassroomDto) {
    const data: any = { ...dto };
    if (data.academic_year_id === '') data.academic_year_id = undefined;
    if (data.homeroom_teacher_id === '') data.homeroom_teacher_id = null;

    return this.prisma.classroom.update({
      where: { id, tenant_uuid: tenantId },
      data,
    });
  }

  async deleteClassroom(tenantId: string, id: string) {
    return this.prisma.classroom.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Subjects
  // ==========================================
  async getSubjects(tenantId: string) {
    const unitId = this.cls.get('unit_id');
    return this.prisma.subject.findMany({
      where: { 
        tenant_uuid: tenantId,
        ...(unitId ? { OR: [{ unit_id: unitId }, { unit_id: null }] } : {})
      },
      include: { category: true }
    });
  }

  async createSubject(tenantId: string, dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        name: dto.name,
        code: dto.code,
        category_id: dto.category_id,
        kkm: dto.kkm || 70,
      },
    });
  }

  async updateSubject(tenantId: string, id: string, dto: UpdateSubjectDto) {
    return this.prisma.subject.update({
      where: { id, tenant_uuid: tenantId },
      data: dto,
    });
  }

  async deleteSubject(tenantId: string, id: string) {
    return this.prisma.subject.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Kitabs
  // ==========================================
  async getKitabs(tenantId: string) {
    const unitId = this.cls.get('unit_id');
    return this.prisma.kitab.findMany({
      where: { 
        tenant_uuid: tenantId,
        ...(unitId ? { OR: [{ unit_id: unitId }, { unit_id: null }] } : {})
      },
      orderBy: { name: 'asc' },
    });
  }

  async createKitab(tenantId: string, dto: CreateKitabDto) {
    return this.prisma.kitab.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        name: dto.name,
        author: dto.author,
        description: dto.description,
      },
    });
  }

  async updateKitab(tenantId: string, id: string, dto: UpdateKitabDto) {
    return this.prisma.kitab.update({
      where: { id, tenant_uuid: tenantId },
      data: dto,
    });
  }

  async deleteKitab(tenantId: string, id: string) {
    return this.prisma.kitab.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Subject Categories
  // ==========================================
  async getSubjectCategories(tenantId: string) {
    const unitId = this.cls.get('unit_id');
    return this.prisma.subjectCategory.findMany({
      where: { 
        tenant_uuid: tenantId,
        ...(unitId ? { OR: [{ unit_id: unitId }, { unit_id: null }] } : {})
      },
      orderBy: { name: 'asc' }
    });
  }

  async createSubjectCategory(tenantId: string, dto: CreateSubjectCategoryDto) {
    return this.prisma.subjectCategory.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        name: dto.name,
        description: dto.description
      }
    });
  }

  async updateSubjectCategory(tenantId: string, id: string, dto: UpdateSubjectCategoryDto) {
    return this.prisma.subjectCategory.update({
      where: { id, tenant_uuid: tenantId },
      data: dto
    });
  }

  async deleteSubjectCategory(tenantId: string, id: string) {
    return this.prisma.subjectCategory.delete({
      where: { id, tenant_uuid: tenantId }
    });
  }

  // ==========================================
  // Schedules
  // ==========================================
  async getSchedules(tenantId: string, role: string, userId: string, classroomId?: string, myOnly?: boolean) {
    const where: any = { tenant_uuid: tenantId };
    const unitId = this.cls.get('unit_id');

    if (unitId) {
      where.classroom = {
        OR: [{ unit_id: unitId }, { unit_id: null }]
      };
    }

    if (role === 'USTAD' || myOnly) {
      // Find the teacher profile linked to this user
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId },
        include: { classrooms: { select: { id: true } } }
      });

      if (!teacher) return [];

      if (myOnly) {
        where.teacher_id = teacher.id;
      } else {
        const homeroomClassIds = teacher.classrooms.map(c => c.id);

        // Rule: 
        // 1. If it's my own schedule
        // 2. OR If I am the homeroom teacher for that class (show all schedules in that class)
        where.OR = [
          { teacher_id: teacher.id },
          { classroom_id: { in: homeroomClassIds } }
        ];
      }
    }

    if (classroomId) {
      if (where.OR) {
        // If already filtering by OR (Teacher), we need to ensure the classroomId is also respected
        where.AND = [
          { classroom_id: classroomId },
          { OR: where.OR }
        ];
        delete where.OR;
      } else {
        where.classroom_id = classroomId;
      }
    }

    return this.prisma.schedule.findMany({
      where,
      include: {
        subject: true,
        teacher: true,
        classroom: {
          include: {
            _count: {
              select: { students: true }
            }
          }
        },
        kitab: true
      },
    });
  }

  async createSchedule(tenantId: string, dto: CreateScheduleDto) {
    return this.prisma.schedule.create({
      data: {
        tenant_uuid: tenantId,
        classroom_id: dto.classroom_id,
        subject_id: dto.subject_id,
        teacher_id: dto.teacher_id === '' ? null : dto.teacher_id,
        kitab_id: (dto.kitab_id === '' || !dto.kitab_id) ? null : dto.kitab_id,
        day_of_week: dto.day_of_week,
        start_time: dto.start_time,
        end_time: dto.end_time,
      },
    });
  }

  async updateSchedule(tenantId: string, id: string, dto: UpdateScheduleDto) {
    const data: any = { ...dto };
    if (data.teacher_id === '') data.teacher_id = null;
    if (data.kitab_id === '') data.kitab_id = null;

    return this.prisma.schedule.update({
      where: { id, tenant_uuid: tenantId },
      data,
    });
  }

  async deleteSchedule(tenantId: string, id: string) {
    return this.prisma.schedule.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Question Banks
  // ==========================================
  async getQuestionBanks(tenantId: string, role?: string, userId?: string, subjectId?: string) {
    const unitId = this.cls.get('unit_id');
    const where: any = { 
      tenant_uuid: tenantId,
      ...(unitId ? { OR: [{ unit_id: unitId }, { unit_id: null }] } : {})
    };

    if (subjectId) {
      where.subject_id = subjectId;
    }

    if (role === 'USTAD') {
      // Find teacher profile
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId },
      });

      if (!teacher) return [];

      // Find subjects this teacher handles
      const teacherSchedules = await this.prisma.schedule.findMany({
        where: { teacher_id: teacher.id, tenant_uuid: tenantId },
        select: { subject_id: true }
      });

      const handledSubjectIds = [...new Set(teacherSchedules.map(s => s.subject_id))];

      if (subjectId) {
        // If teacher specifically searched for a subject, check if they handle it
        if (!handledSubjectIds.includes(subjectId)) {
          return []; // Not authorized or no results for this specific subject
        }
      } else {
        // Otherwise, filter by all handled subjects
        where.subject_id = { in: handledSubjectIds };
      }
    }

    return this.prisma.questionBank.findMany({
      where,
      include: { subject: true, teacher: true, kitab: true, questions: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async createQuestionBank(tenantId: string, dto: CreateQuestionBankDto) {
    return this.prisma.questionBank.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        subject_id: dto.subject_id,
        teacher_id: dto.teacher_id,
        kitab_id: dto.kitab_id,
        title: dto.title,
        description: dto.description,
      },
    });
  }

  async updateQuestionBank(tenantId: string, id: string, dto: UpdateQuestionBankDto) {
    return this.prisma.questionBank.update({
      where: { id, tenant_uuid: tenantId },
      data: dto,
    });
  }

  async deleteQuestionBank(tenantId: string, id: string) {
    return this.prisma.questionBank.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  // ==========================================
  // Questions
  // ==========================================
  async getQuestions(bankId: string) {
    return this.prisma.question.findMany({
      where: { question_bank_id: bankId },
      orderBy: { created_at: 'asc' },
    });
  }

  async createQuestion(dto: CreateQuestionDto) {
    return this.prisma.question.create({
      data: {
        question_bank_id: dto.question_bank_id,
        type: dto.type,
        content: dto.content,
        options: dto.options,
        correct_answer: dto.correct_answer,
        points: dto.points || 10,
      },
    });
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    return this.prisma.question.update({
      where: { id },
      data: dto,
    });
  }

  async deleteQuestion(id: string) {
    return this.prisma.question.delete({
      where: { id },
    });
  }

  // ==========================================
  // Exams
  // ==========================================
  async getExams(tenantId: string) {
    const unitId = this.cls.get('unit_id');
    return this.prisma.exam.findMany({
      where: { 
        tenant_uuid: tenantId,
        ...(unitId ? { OR: [{ unit_id: unitId }, { unit_id: null }] } : {})
      },
      include: { academic_year: true, period: true, schedules: true },
    });
  }

  async createExam(tenantId: string, dto: CreateExamDto) {
    return this.prisma.exam.create({
      data: {
        tenant_uuid: tenantId,
        unit_id: this.cls.get('unit_id') || undefined,
        academic_year_id: dto.academic_year_id,
        period_id: dto.period_id,
        name: dto.name,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        status: dto.status || 'draft',
      },
    });
  }

  async updateExam(tenantId: string, id: string, dto: UpdateExamDto) {
    const data: any = { ...dto };
    if (dto.start_date) data.start_date = new Date(dto.start_date);
    if (dto.end_date) data.end_date = new Date(dto.end_date);

    return this.prisma.exam.update({
      where: { id, tenant_uuid: tenantId },
      data,
    });
  }

  async deleteExam(tenantId: string, id: string) {
    return this.prisma.exam.delete({
      where: { id, tenant_uuid: tenantId },
    });
  }

  async getQuestionsBySubject(tenantId: string, subjectId: string, kitabId?: string) {
    const where: any = {
      tenant_uuid: tenantId,
      subject_id: subjectId
    };

    if (kitabId && kitabId !== 'undefined' && kitabId !== 'null') {
      where.OR = [
        { kitab_id: kitabId },
        { kitab_id: null }
      ];
    }

    return this.prisma.question.findMany({
      where: {
        question_bank: where
      },
      include: {
        question_bank: {
          include: {
            kitab: { select: { id: true, name: true } }
          }
        }
      }
    });
  }

  // ==========================================
  // Exam Schedules
  // ==========================================
  async getExamSchedules(tenantId: string, role?: string, userId?: string, examId?: string, classroomId?: string) {
    const where: any = { tenant_uuid: tenantId };
    if (examId) where.exam_id = examId;

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId }
      });
      if (!teacher) return [];

      // Teacher can see schedules where they are the author OR the supervisor
      where.OR = [
        { teacher_id: teacher.id },
        { supervisor_id: teacher.id }
      ];
    }

    if (classroomId && classroomId !== 'undefined') {
      if (where.OR) {
        where.AND = [
          { classroom_id: classroomId },
          { OR: where.OR }
        ];
        delete where.OR;
      } else {
        where.classroom_id = classroomId;
      }
    }

    return this.prisma.examSchedule.findMany({
      where,
      include: {
        exam: true,
        subject: true,
        classroom: true,
        teacher: true,
        supervisor: true,
        kitab: true,
        question_bank: true,
        questions: {
          include: {
            question: true
          }
        },
        results: {
          include: {
            student: { select: { id: true, name: true, nis: true } }
          }
        }
      },
      orderBy: { date: 'asc' }
    });
  }

  async createExamSchedule(tenantId: string, dto: CreateExamScheduleDto) {
    return this.prisma.examSchedule.create({
      data: {
        tenant_uuid: tenantId,
        exam_id: dto.exam_id,
        subject_id: dto.subject_id,
        classroom_id: dto.classroom_id,
        date: new Date(dto.date),
        start_time: dto.start_time,
        end_time: dto.end_time,
        teacher_id: dto.teacher_id || null,
        supervisor_id: dto.supervisor_id || null,
        kitab_id: dto.kitab_id || null,
        status: 'pending'
      }
    });
  }

  async updateExamSchedule(tenantId: string, id: string, dto: UpdateExamScheduleDto) {
    const { question_ids, ...updateData } = dto;
    const data: any = { ...updateData };
    if (dto.date) data.date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.examSchedule.update({
        where: { id, tenant_uuid: tenantId },
        data
      });

      if (question_ids) {
        // Clear old questions and insert new ones
        await tx.examQuestion.deleteMany({ where: { exam_schedule_id: id } });
        await tx.examQuestion.createMany({
          data: question_ids.map((qId, idx) => ({
            exam_schedule_id: id,
            question_id: qId,
            order: idx
          }))
        });
      }

      return schedule;
    });
  }

  async deleteExamSchedule(tenantId: string, id: string) {
    return this.prisma.examSchedule.delete({
      where: { id, tenant_uuid: tenantId }
    });
  }

  async getExamResults(tenantId: string, scheduleId: string) {
    return this.prisma.examResult.findMany({
      where: { tenant_uuid: tenantId, exam_schedule_id: scheduleId },
      include: {
        student: { select: { id: true, name: true, nis: true } }
      }
    });
  }

  async saveExamResults(tenantId: string, scheduleId: string, userId: string, role: string, dto: SaveExamResultDto) {
    const where: any = { id: scheduleId, tenant_uuid: tenantId };

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId }
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');

      // Teacher can save results if they are the author OR the supervisor
      where.OR = [
        { teacher_id: teacher.id },
        { supervisor_id: teacher.id }
      ];
    }

    const schedule = await this.prisma.examSchedule.findFirst({
      where,
      include: { exam: true }
    });

    if (!schedule) throw new NotFoundException('Jadwal ujian tidak ditemukan atau Anda tidak memiliki akses');

    // Workflow checks:
    // 1. Must be approved
    if (schedule.status !== 'approved') {
      throw new Error('Penilaian hanya bisa dilakukan jika soal sudah di-ACC oleh Admin');
    }
    // 2. Exam must not be finished
    if (schedule.exam.status === 'finished') {
      throw new Error('Ujian sudah dinyatakan selesai oleh Admin, nilai tidak dapat diubah');
    }

    return this.prisma.$transaction(async (tx) => {
      // Clear existing and re-save
      await tx.examResult.deleteMany({
        where: { exam_schedule_id: scheduleId, tenant_uuid: tenantId }
      });

      return tx.examResult.createMany({
        data: dto.results.map(r => ({
          tenant_uuid: tenantId,
          exam_schedule_id: scheduleId,
          student_id: r.student_id,
          score: r.score,
          notes: r.notes
        }))
      });
    });
  }

  // ==========================================
  // Report Cards
  // ==========================================

  async getMyHomeroomClasses(tenantId: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id: userId, tenant_uuid: tenantId }
    });
    if (!teacher) return [];

    return this.prisma.classroom.findMany({
      where: { homeroom_teacher_id: teacher.id, tenant_uuid: tenantId },
      include: {
        academic_year: true
      }
    });
  }

  async getReportCards(tenantId: string, query: GenerateReportCardDto) {
    const where: any = {
      tenant_uuid: tenantId,
    };

    if (query.id) {
      where.id = query.id;
    } else {
      if (!query.classroom_id) throw new BadRequestException('classroom_id is required if id is not provided');
      where.classroom_id = query.classroom_id;
      if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
      if (query.period_id) where.period_id = query.period_id;
      if (query.student_id) where.student_id = query.student_id;
    }

    return this.prisma.reportCard.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, nis: true } },
        academic_year: true,
        period: true,
        details: {
          include: {
            subject: {
              include: { category: true }
            }
          }
        }
      },
      orderBy: { average_score: 'desc' }
    });
  }

  async saveReportCard(tenantId: string, dto: SaveReportCardDto) {
    return this.prisma.$transaction(async (tx) => {
      let report = await tx.reportCard.findFirst({
        where: {
          tenant_uuid: tenantId,
          student_id: dto.student_id,
          academic_year_id: dto.academic_year_id,
          period_id: dto.period_id || null
        }
      });

      if (report) {
        report = await tx.reportCard.update({
          where: { id: report.id },
          data: {
            classroom_id: dto.classroom_id,
            total_score: dto.total_score,
            average_score: dto.average_score,
          }
        });
      } else {
        report = await tx.reportCard.create({
          data: {
            tenant_uuid: tenantId,
            student_id: dto.student_id,
            classroom_id: dto.classroom_id,
            academic_year_id: dto.academic_year_id,
            period_id: dto.period_id || null,
            total_score: dto.total_score,
            average_score: dto.average_score,
            status: 'draft'
          }
        });
      }

      // Sync details
      for (const detail of dto.details) {
        await tx.reportCardDetail.upsert({
          where: {
            report_card_id_subject_id: {
              report_card_id: report.id,
              subject_id: detail.subject_id
            }
          },
          create: {
            report_card_id: report.id,
            subject_id: detail.subject_id,
            score: detail.score,
            predicate: this.calculatePredicate(detail.score)
          },
          update: {
            score: detail.score,
            predicate: this.calculatePredicate(detail.score)
          }
        });
      }

      return report;
    });
  }

  async generateReportCards(tenantId: string, dto: GenerateReportCardDto) {
    if (!dto.classroom_id) throw new BadRequestException('classroom_id is required for generating report cards');
    const classroomId = dto.classroom_id;

    if (!dto.academic_year_id) {
      const activeYear = await this.prisma.academicYear.findFirst({
        where: { tenant_uuid: tenantId, is_active: true }
      });
      dto.academic_year_id = activeYear?.id;
    }

    if (!dto.academic_year_id) {
      throw new Error('Tahun akademik wajib diisi atau diset aktif di pengaturan.');
    }

    const academicYearId = dto.academic_year_id;

    const students = await this.prisma.student.findMany({
      where: { classroom_id: dto.classroom_id, tenant_uuid: tenantId, status: 'AKTIF', deleted_at: null }
    });

    // 1. Fetch Exam Results
    const examResults = await this.prisma.examResult.findMany({
      where: {
        tenant_uuid: tenantId,
        student_id: { in: students.map(s => s.id) },
        exam_schedule: { classroom_id: dto.classroom_id }
      },
      include: {
        exam_schedule: { select: { subject_id: true } }
      }
    });

    // 2. Fetch Daily Assignment Grades
    const assignmentGrades = await this.prisma.assignmentGrade.findMany({
      where: {
        tenant_uuid: tenantId,
        student_id: { in: students.map(s => s.id) },
        daily_assignment: { classroom_id: dto.classroom_id }
      },
      include: {
        daily_assignment: { select: { subject_id: true } }
      }
    });

    // 3. Fetch Attendance Records within the academic year range
    const yearData = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, tenant_uuid: tenantId } });
    if (!yearData) throw new Error('Data tahun akademik tidak ditemukan');

    const attendanceRecords = await this.prisma.attendance.findMany({
      where: {
        tenant_uuid: tenantId,
        student_id: { in: students.map(s => s.id) },
        date: {
          gte: new Date(yearData.start_date),
          lte: new Date(yearData.end_date)
        }
      }
    });

    for (const student of students) {
      const studentExamResults = examResults.filter(r => r.student_id === student.id);
      const studentAssignmentGrades = assignmentGrades.filter(r => r.student_id === student.id);
      const studentAttendance = attendanceRecords.filter(r => r.student_id === student.id);

      const attSick = studentAttendance.filter(r => r.status === 'sakit').length;
      const attIzin = studentAttendance.filter(r => r.status === 'izin').length;
      const attAlpa = studentAttendance.filter(r => r.status === 'alpa').length;

      const subjectData: Record<string, { exams: number[], assignments: number[] }> = {};

      studentExamResults.forEach(r => {
        const sid = r.exam_schedule.subject_id;
        if (!subjectData[sid]) subjectData[sid] = { exams: [], assignments: [] };
        subjectData[sid].exams.push(Number(r.score));
      });

      studentAssignmentGrades.forEach(r => {
        const sid = r.daily_assignment.subject_id;
        if (!subjectData[sid]) subjectData[sid] = { exams: [], assignments: [] };
        subjectData[sid].assignments.push(Number(r.score));
      });

      let report = await this.prisma.reportCard.findFirst({
        where: {
          student_id: student.id,
          academic_year_id: academicYearId,
          period_id: dto.period_id || null
        }
      });

      if (report) {
        report = await this.prisma.reportCard.update({
          where: { id: report.id },
          data: {
            classroom_id: classroomId,
            attendance_sick: attSick,
            attendance_izin: attIzin,
            attendance_alpa: attAlpa
          }
        });
      } else {
        report = await this.prisma.reportCard.create({
          data: {
            tenant_uuid: tenantId,
            student_id: student.id,
            academic_year_id: academicYearId,
            period_id: dto.period_id || null,
            classroom_id: classroomId,
            status: 'draft',
            attendance_sick: attSick,
            attendance_izin: attIzin,
            attendance_alpa: attAlpa
          }
        });
      }

      // 3. Identify all subjects that have either an exam or an assignment in this class
      const allSubjectIds = [...new Set([
        ...examResults.map(r => r.exam_schedule.subject_id),
        ...assignmentGrades.map(r => r.daily_assignment.subject_id)
      ])];

      for (const subjectId of allSubjectIds) {
        const data = subjectData[subjectId] || { exams: [], assignments: [] };

        // Calculate averages. 
        // If a subject has exams in the class but this student has 0 exams, avgExam = 0
        const hasExamsInClass = examResults.some(r => r.exam_schedule.subject_id === subjectId);
        const hasAssignmentsInClass = assignmentGrades.some(r => r.daily_assignment.subject_id === subjectId);

        const avgExam = data.exams.length > 0
          ? (data.exams.reduce((a, b) => a + b, 0) / data.exams.length)
          : (hasExamsInClass ? 0 : null); // Penalty 0 if they missed it

        const avgAssign = data.assignments.length > 0
          ? (data.assignments.reduce((a, b) => a + b, 0) / data.assignments.length)
          : (hasAssignmentsInClass ? 0 : null); // Penalty 0 if they missed it

        let finalScore = 0;
        if (avgExam !== null && avgAssign !== null) {
          // Both are expected: 60% Exam, 40% Assignment
          finalScore = (avgExam * 0.6) + (avgAssign * 0.4);
        } else if (avgExam !== null) {
          // Only exams exist for this subject in this class
          finalScore = avgExam;
        } else if (avgAssign !== null) {
          // Only assignments exist for this subject in this class
          finalScore = avgAssign;
        }

        await this.prisma.reportCardDetail.upsert({
          where: {
            report_card_id_subject_id: {
              report_card_id: report.id,
              subject_id: subjectId
            }
          },
          create: {
            report_card_id: report.id,
            subject_id: subjectId,
            score: finalScore,
            predicate: this.calculatePredicate(finalScore)
          },
          update: {
            score: finalScore,
            predicate: this.calculatePredicate(finalScore)
          }
        });
      }

      const allDetails = await this.prisma.reportCardDetail.findMany({ where: { report_card_id: report.id } });
      const total = allDetails.reduce((a, b) => a + Number(b.score), 0);
      const avg = allDetails.length > 0 ? total / allDetails.length : 0;

      await this.prisma.reportCard.update({
        where: { id: report.id },
        data: { total_score: total, average_score: avg }
      });
    }

    const allReports = await this.prisma.reportCard.findMany({
      where: {
        classroom_id: dto.classroom_id,
        academic_year_id: dto.academic_year_id,
        period_id: dto.period_id || null
      },
      orderBy: { average_score: 'desc' }
    });

    for (let i = 0; i < allReports.length; i++) {
      await this.prisma.reportCard.update({
        where: { id: allReports[i].id },
        data: { rank: i + 1 }
      });
    }

    return this.getReportCards(tenantId, dto);
  }

  private calculatePredicate(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'E';
  }

  async updateReportCard(tenantId: string, id: string, dto: UpdateReportCardDto) {
    const { details, ...updateData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.reportCard.update({
        where: { id, tenant_uuid: tenantId },
        data: {
          notes_homeroom: updateData.notes_homeroom,
          status: updateData.status,
          traits: updateData.traits,
          attendance_sick: updateData.attendance_sick,
          attendance_izin: updateData.attendance_izin,
          attendance_alpa: updateData.attendance_alpa,
          promotion_status: updateData.promotion_status,
        }
      });

      if (details) {
        for (const detail of details) {
          await tx.reportCardDetail.update({
            where: { id: detail.id },
            data: {
              score: detail.score,
              notes: detail.notes,
              predicate: this.calculatePredicate(detail.score)
            }
          });
        }

        const allDetails = await tx.reportCardDetail.findMany({ where: { report_card_id: id } });
        const total = allDetails.reduce((a, b) => a + Number(b.score), 0);
        const avg = allDetails.length > 0 ? total / allDetails.length : 0;

        await tx.reportCard.update({
          where: { id },
          data: { total_score: total, average_score: avg }
        });
      }

      return report;
    });
  }

  // ==========================================
  // Classroom Student Management
  // ==========================================
  async getStudentsInClass(tenantId: string, classroomId: string) {
    return this.prisma.student.findMany({
      where: { tenant_uuid: tenantId, classroom_id: classroomId, deleted_at: null },
      orderBy: { name: 'asc' },
    });
  }

  async getUnassignedStudents(tenantId: string) {
    return this.prisma.student.findMany({
      where: { tenant_uuid: tenantId, classroom_id: null, deleted_at: null },
      orderBy: { name: 'asc' },
    });
  }

  async assignStudentsToClass(tenantId: string, classroomId: string, studentIds: string[]) {
    return this.prisma.student.updateMany({
      where: { tenant_uuid: tenantId, id: { in: studentIds } },
      data: { classroom_id: classroomId },
    });
  }

  async removeStudentsFromClass(tenantId: string, studentIds: string[]) {
    return this.prisma.student.updateMany({
      where: { tenant_uuid: tenantId, id: { in: studentIds } },
      data: { classroom_id: null },
    });
  }
  // ==========================================
  // Daily Assignments
  // ==========================================
  async getAssignments(tenantId: string, role: string, userId: string, classroomId?: string) {
    const where: any = { tenant_uuid: tenantId };

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId },
      });
      if (!teacher) return [];
      where.teacher_id = teacher.id;
    }

    if (classroomId && classroomId !== 'undefined') {
      where.classroom_id = classroomId;
    }

    return this.prisma.dailyAssignment.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        classroom: {
          select: {
            name: true,
            _count: {
              select: { students: { where: { deleted_at: null } } }
            }
          }
        },
        _count: { select: { grades: true } }
      },
      orderBy: { date: 'desc' },
    });
  }

  async createAssignment(tenantId: string, userId: string, dto: any) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id: userId, tenant_uuid: tenantId },
    });

    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.dailyAssignment.create({
        data: {
          tenant_uuid: tenantId,
          teacher_id: teacher.id,
          subject_id: dto.subject_id,
          classroom_id: dto.classroom_id,
          title: dto.title,
          date: new Date(dto.date),
        },
      });

      if (dto.grades && dto.grades.length > 0) {
        await tx.assignmentGrade.createMany({
          data: dto.grades.map((g: any) => ({
            tenant_uuid: tenantId,
            daily_assignment_id: assignment.id,
            student_id: g.student_id,
            score: g.score,
            notes: g.notes,
          })),
        });
      }

      return assignment;
    });
  }

  async getAssignmentDetail(tenantId: string, id: string) {
    const assignment = await this.prisma.dailyAssignment.findFirst({
      where: { id, tenant_uuid: tenantId },
      include: {
        subject: true,
        classroom: true,
        grades: {
          include: {
            student: { select: { id: true, name: true, nis: true } }
          }
        }
      }
    });

    if (!assignment) throw new NotFoundException('Tugas tidak ditemukan');
    return assignment;
  }

  async updateAssignment(tenantId: string, userId: string, role: string, id: string, dto: UpdateAssignmentDto) {
    const where: any = { id, tenant_uuid: tenantId };

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId }
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      where.teacher_id = teacher.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.dailyAssignment.findFirst({ where });
      if (!assignment) throw new NotFoundException('Tugas tidak ditemukan atau Anda tidak memiliki akses');

      await tx.dailyAssignment.update({
        where: { id },
        data: {
          title: dto.title,
          date: dto.date ? new Date(dto.date) : undefined,
          subject_id: dto.subject_id,
          classroom_id: dto.classroom_id,
        },
      });

      if (dto.grades) {
        // Simple approach: delete existing grades and re-create
        await tx.assignmentGrade.deleteMany({
          where: { daily_assignment_id: id, tenant_uuid: tenantId }
        });

        await tx.assignmentGrade.createMany({
          data: dto.grades.map((g: any) => ({
            tenant_uuid: tenantId,
            daily_assignment_id: assignment.id,
            student_id: g.student_id,
            score: g.score,
            notes: g.notes,
          })),
        });
      }

      return assignment;
    });
  }

  async deleteAssignment(tenantId: string, userId: string, role: string, id: string) {
    const where: any = { id, tenant_uuid: tenantId };

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid: tenantId }
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      where.teacher_id = teacher.id;
    }

    const assignment = await this.prisma.dailyAssignment.findFirst({ where });
    if (!assignment) throw new NotFoundException('Tugas tidak ditemukan atau Anda tidak memiliki akses');

    return this.prisma.dailyAssignment.delete({
      where: { id }
    });
  }
}
