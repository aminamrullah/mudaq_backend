import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@ApiTags('announcement')
@Controller('announcement')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new announcement (Superadmin)' })
  create(@Body() dto: CreateAnnouncementDto) {
    return this.announcementService.create(dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all announcements (Superadmin)' })
  findAll() {
    return this.announcementService.findAll();
  }

  @Get('active')
  @Roles(Role.ADMIN_PESANTREN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get active announcements for current tenant' })
  findActive(@Request() req: any) {
    if (req.user.role === Role.SUPER_ADMIN) {
      return this.announcementService.findAll();
    }
    return this.announcementService.findActiveForTenant(req.user.tenant_uuid);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update announcement (Superadmin)' })
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete announcement (Superadmin)' })
  remove(@Param('id') id: string) {
    return this.announcementService.remove(id);
  }
}
