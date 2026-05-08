import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto, CreateTicketMessageDto, UpdateTicketStatusDto } from './dto/ticket.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ProblemTicketService {
  constructor(private prisma: PrismaService) {}

  async create(tenant_uuid: string, creator_id: string, dto: CreateTicketDto) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenant_uuid },
      select: { name: true }
    });

    const ticket = await this.prisma.problemTicket.create({
      data: {
        tenant_uuid,
        creator_id,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority || 'medium',
        status: 'open',
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Notify Superadmins
    await this.notifySuperAdmins(
      `Tiket Baru: ${pesantren?.name || 'Pesantren'}`,
      `${ticket.title} - ${dto.description.substring(0, 50)}...`,
      { ticket_id: ticket.id }
    );

    return ticket;
  }

  async findAll(user: any) {
    const where: any = {};
    
    // If not superadmin, only show tickets for their own tenant
    if (user.role !== Role.SUPER_ADMIN) {
      where.tenant_uuid = user.tenant_uuid;
    }

    return this.prisma.problemTicket.findMany({
      where,
      include: {
        pesantren: {
          select: {
            name: true,
          },
        },
        creator: {
          select: {
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findOne(id: string, user: any) {
    const ticket = await this.prisma.problemTicket.findUnique({
      where: { id },
      include: {
        pesantren: {
          select: {
            name: true,
          },
        },
        creator: {
          select: {
            name: true,
            role: true,
          },
        },
        messages: {
          include: {
            sender: {
              select: {
                name: true,
                role: true,
              },
            },
          },
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check permission
    if (user.role !== Role.SUPER_ADMIN && ticket.tenant_uuid !== user.tenant_uuid) {
      throw new ForbiddenException('You do not have permission to view this ticket');
    }

    return ticket;
  }

  async addMessage(ticket_id: string, sender_id: string, dto: CreateTicketMessageDto) {
    // First verify ticket exists
    const ticket = await this.prisma.problemTicket.findUnique({
      where: { id: ticket_id },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const message = await this.prisma.problemTicketMessage.create({
      data: {
        ticket_id,
        sender_id,
        message: dto.message,
        attachment_url: dto.attachment_url,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Handle Notifications
    if (message.sender.role === Role.SUPER_ADMIN) {
      // Notify the ticket creator
      await this.notifyUser(
        ticket.creator_id,
        `Balasan Tiket: ${ticket.title}`,
        `${message.sender.name}: ${dto.message.substring(0, 50)}...`,
        { ticket_id: ticket.id }
      );
    } else {
      // Notify Superadmins
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: ticket.tenant_uuid },
        select: { name: true }
      });
      await this.notifySuperAdmins(
        `Pesan Baru: ${pesantren?.name || 'Pesantren'}`,
        `${ticket.title} - ${dto.message.substring(0, 50)}...`,
        { ticket_id: ticket.id }
      );
    }

    return message;
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.problemTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updated = await this.prisma.problemTicket.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    // Notify creator about status change
    const statusLabels: { [key: string]: string } = {
      open: 'Terbuka',
      in_progress: 'Sedang Diproses',
      resolved: 'Selesai',
      closed: 'Ditutup'
    };

    await this.notifyUser(
      ticket.creator_id,
      `Status Tiket Diperbarui`,
      `Tiket "${ticket.title}" sekarang berstatus: ${statusLabels[dto.status] || dto.status}`,
      { ticket_id: ticket.id }
    );

    return updated;
  }

  // ── Helper Methods ──

  private async notifySuperAdmins(title: string, message: string, actionData: any = {}) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN, is_active: true },
      select: { id: true }
    });

    for (const admin of superAdmins) {
      await this.prisma.userNotification.create({
        data: {
          user_id: admin.id,
          type: 'TICKET_PROBLEM',
          title,
          message,
          action_data: actionData,
        }
      });
    }
  }

  private async notifyUser(userId: string, title: string, message: string, actionData: any = {}) {
    await this.prisma.userNotification.create({
      data: {
        user_id: userId,
        type: 'TICKET_PROBLEM',
        title,
        message,
        action_data: actionData,
      }
    });
  }
}
