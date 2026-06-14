import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserTopupDto, UserWithdrawDto, UpdateUserPinDto } from './dto/user-wallet.dto';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserWalletService {
  private readonly logger = new Logger(UserWalletService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getMyWallet(tenantUuid: string, userId: string) {
    let wallet = await this.prisma.userWallet.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        user_id: userId,
      },
      include: {
        user: {
          select: { id: true, name: true, role: true, phone: true },
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.userWallet.create({
        data: {
          tenant_uuid: tenantUuid,
          user_id: userId,
          balance: 0,
        },
        include: {
          user: {
            select: { id: true, name: true, role: true, phone: true },
          },
        },
      });
    }

    return wallet;
  }

  async getTransactions(
    tenantUuid: string,
    walletId: string,
    page = 1,
    limit = 20,
  ) {
    const wallet = await this.prisma.userWallet.findFirst({
      where: {
        id: walletId,
        tenant_uuid: tenantUuid,
      },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    const [data, total] = await Promise.all([
      this.prisma.userWalletTransaction.findMany({
        where: { wallet_id: walletId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.userWalletTransaction.count({ where: { wallet_id: walletId } }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createManualTopup(tenantUuid: string, dto: UserTopupDto) {
    const wallet = await this.prisma.userWallet.findFirst({
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
      },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    const amount = new Prisma.Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      // 1. Get and check Tenant Wallet
      let tenantWallet = await tx.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid },
      });
      if (!tenantWallet) {
        tenantWallet = await tx.tenantWallet.create({
          data: { tenant_uuid: tenantUuid, balance: 0 },
        });
      }

      // Cash top-up is money received by the tenant cashier. It is booked as
      // cash movement and must not inflate tenant float.
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'user_cash_topup',
          amount: amount,
          balance_before: tenantWallet.balance,
          balance_after: tenantWallet.balance,
          reference: `UTP-${Date.now()}`,
          description: `Setoran tunai top up dompet Ustad/Pegawai (Wallet ID: ${wallet.id})`,
        },
      });

      // Update user wallet balance
      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, amount);
      const updated = await tx.userWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // Create user transaction record
      await tx.userWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: wallet.id,
          type: 'deposit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `MANUAL-${Date.now()}`,
          description: `Top up tunai via Bendahara`,
        },
      });

      return updated;
    });
  }

  async withdraw(tenantUuid: string, dto: UserWithdrawDto) {
    const wallet = await this.prisma.userWallet.findFirst({
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
      },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');
    
    if (Number(wallet.balance) < dto.amount) throw new BadRequestException('Saldo tidak mencukupi');

    const amount = new Prisma.Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      // 1. Get or Create Tenant Wallet
      let tenantWallet = await tx.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid },
      });
      if (!tenantWallet) {
        tenantWallet = await tx.tenantWallet.create({
          data: { tenant_uuid: tenantUuid, balance: 0 },
        });
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, amount);

      // 2. Update user wallet balance
      const updated = await tx.userWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // 3. Create user transaction record
      await tx.userWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: wallet.id,
          type: 'withdraw',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `UWD-${Date.now()}`,
          description: dto.notes || 'Tarik tunai via Bendahara',
        },
      });

      // Cash withdrawal is paid by tenant cashier. It is booked as cash out and
      // must not reduce tenant float.
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'user_cash_withdrawal',
          amount: amount,
          balance_before: tenantWallet.balance,
          balance_after: tenantWallet.balance,
          reference: `UWD-${Date.now()}`,
          description: `Penarikan tunai dompet Ustad/Pegawai (Wallet ID: ${wallet.id})`,
        },
      });

      return updated;
    });
  }
}
