import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString, IsNumber, Min, IsEnum, IsArray } from 'class-validator';

export class CreateAcademicYearDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class CreateAcademicPeriodDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateAcademicPeriodDto extends PartialType(CreateAcademicPeriodDto) {}

export class CreateClassroomDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  level?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  academic_year_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  homeroom_teacher_id?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;
}

export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}

export class CreateSubjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category_id?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  kkm?: number;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

export class CreateSubjectCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateSubjectCategoryDto extends PartialType(CreateSubjectCategoryDto) {}

export class CreateScheduleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classroom_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  teacher_id: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  day_of_week: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  start_time: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  end_time: string;
}

export class CreateQuestionBankDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  teacher_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateQuestionBankDto extends PartialType(CreateQuestionBankDto) {}

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question_bank_id: string;

  @ApiProperty({ enum: ['multiple_choice', 'essay_1', 'essay_2'] })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  options?: any;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  correct_answer?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  points?: number;
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

export class CreateExamDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  academic_year_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  period_id?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateExamDto extends PartialType(CreateExamDto) {}

export class CreateAssignmentDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() subject_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() classroom_id: string;
  @ApiProperty() @IsDateString() @IsNotEmpty() date: string;
  @ApiProperty() @IsArray() grades: AssignmentGradeItemDto[];
}

export class AssignmentGradeItemDto {
  @IsString() @IsNotEmpty() student_id: string;
  @IsNumber() score: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class CreateExamScheduleDto {
  @ApiProperty() @IsString() @IsNotEmpty() exam_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() subject_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() classroom_id: string;
  @ApiProperty() @IsDateString() @IsNotEmpty() date: string;
  @ApiProperty() @IsString() @IsNotEmpty() start_time: string;
  @ApiProperty() @IsString() @IsNotEmpty() end_time: string;
  @ApiPropertyOptional() @IsString() @IsOptional() teacher_id?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() supervisor_id?: string;
}

export class UpdateExamScheduleDto extends PartialType(CreateExamScheduleDto) {
  @ApiPropertyOptional() @IsString() @IsOptional() question_bank_id?: string;
  @ApiPropertyOptional() @IsArray() @IsOptional() question_ids?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() status?: string; // pending, submitted, approved
}

export class GenerateReportCardDto {
  @ApiProperty() @IsString() classroom_id: string;
  @ApiPropertyOptional() @IsString() @IsOptional() academic_year_id?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() period_id?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() student_id?: string;
}

export class UpdateReportCardDto {
  @ApiPropertyOptional() @IsString() @IsOptional() notes_homeroom?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() status?: string; // draft, published
  @ApiPropertyOptional() @IsArray() @IsOptional() details?: any[];
  @ApiPropertyOptional() @IsOptional() traits?: any;
  @ApiPropertyOptional() @IsNumber() @IsOptional() attendance_sick?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() attendance_izin?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() attendance_alpa?: number;
}

export class SaveReportCardDto {
  @ApiProperty() @IsString() student_id: string;
  @ApiProperty() @IsString() classroom_id: string;
  @ApiProperty() @IsString() academic_year_id: string;
  @ApiPropertyOptional() @IsString() @IsOptional() period_id?: string;
  @ApiProperty() @IsNumber() total_score: number;
  @ApiProperty() @IsNumber() average_score: number;
  @ApiProperty() @IsArray() details: any[];
}

export class SaveExamResultDto {
  @ApiProperty() @IsArray() results: ExamResultItemDto[];
}

export class ExamResultItemDto {
  @IsString() @IsNotEmpty() student_id: string;
  @IsNumber() score: number;
  @IsOptional() @IsString() notes?: string;
}
