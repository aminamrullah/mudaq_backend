import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProblemTicketService } from './problem-ticket.service';
import { CreateTicketDto, CreateTicketMessageDto, UpdateTicketStatusDto } from './dto/ticket.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Problem Tickets')
@Controller('problem-tickets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
@ApiBearerAuth()
export class ProblemTicketController {
  constructor(private readonly ticketService: ProblemTicketService) {}

  @Post()
  @Roles(Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create a new problem ticket' })
  create(@Request() req: any, @Body() dto: CreateTicketDto) {
    return this.ticketService.create(req.user.tenant_uuid, req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tickets (Superadmin sees all, Admin sees their own tenant tickets)' })
  findAll(@Request() req: any) {
    return this.ticketService.findAll(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details with conversation' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.ticketService.findOne(id, req.user);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add a message/reply to a ticket' })
  addMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return this.ticketService.addMessage(id, req.user.id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update ticket status (Superadmin only)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketService.updateStatus(id, dto);
  }
}
