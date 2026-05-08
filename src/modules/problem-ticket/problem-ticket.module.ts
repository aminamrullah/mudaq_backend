import { Module } from '@nestjs/common';
import { ProblemTicketService } from './problem-ticket.service';
import { ProblemTicketController } from './problem-ticket.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProblemTicketController],
  providers: [ProblemTicketService],
  exports: [ProblemTicketService],
})
export class ProblemTicketModule {}
