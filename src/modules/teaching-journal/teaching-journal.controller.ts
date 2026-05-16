import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeachingJournalService } from './teaching-journal.service';
import { CreateTeachingJournalDto, UpdateTeachingJournalDto } from './dto/teaching-journal.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('teaching-journal')
@Controller('teaching-journal')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class TeachingJournalController {
  constructor(private readonly svc: TeachingJournalService) {}

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
    Role.USTAD,
  )
  @ApiOperation({ summary: 'Create teaching journal entry' })
  create(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTeachingJournalDto,
  ) {
    return this.svc.create(t, role, userId, dto);
  }

  @Put(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
    Role.USTAD,
  )
  @ApiOperation({ summary: 'Update teaching journal entry' })
  update(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeachingJournalDto,
  ) {
    return this.svc.update(t, role, userId, id, dto);
  }

  @Get('teacher/:teacherId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
    Role.USTAD,
  )
  @ApiOperation({ summary: 'Get teaching journal by teacher' })
  findByTeacher(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') userId: string,
    @Param('teacherId') tid: string,
    @Query('month') m?: string,
    @Query('classroom_id') cid?: string,
  ) {
    return this.svc.findByTeacher(t, role, userId, tid, m, cid);
  }

  @Delete(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
  )
  @ApiOperation({ summary: 'Delete teaching journal entry' })
  delete(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.svc.delete(t, id);
  }
}
