import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class XenditService {
  private readonly logger = new Logger(XenditService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
    this.baseUrl =
      this.config.get<string>('XENDIT_API_URL') || 'https://api.xendit.co';
  }

  private get authHeader() {
    return `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`;
  }

  private isDemoKey() {
    return !this.apiKey || this.apiKey.startsWith('xnd_development_');
  }

  async createSubAccount(name: string, email: string) {
    if (!this.apiKey) {
      this.logger.warn(
        'XENDIT_SECRET_KEY is not set. Skipping sub-account creation.',
      );
      return null;
    }

    try {
      this.logger.log(`Creating Xendit sub-account for: ${name}`);
      const resp = await fetch(`${this.baseUrl}/v2/accounts`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'OWNED', // OWNED = Sub-account fully managed by platform but separate legal entity
          email: email,
          public_profile: {
            business_name: name,
          },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        this.logger.error('Xendit Error:', data);
        throw new BadRequestException(
          data.message || 'Gagal membuat akun Xendit',
        );
      }

      this.logger.log(`Xendit sub-account created: ${data.id}`);
      return data.id as string;
    } catch (err) {
      this.logger.error('Failed to create Xendit sub-account', err);
      return null;
    }
  }

  async getBalance() {
    if (!this.apiKey) return { balance: 0 };
    try {
      const resp = await fetch(`${this.baseUrl}/balance`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        this.logger.error('Failed to fetch Xendit balance:', data);
        return { balance: 0 };
      }
      return data;
    } catch (err) {
      this.logger.error('Failed to fetch Xendit balance', err);
      return { balance: 0 };
    }
  }

  async getBalanceForSubAccount(subAccountId?: string | null) {
    if (!subAccountId) {
      return {
        balance: 0,
        available_balance: 0,
        sub_account_id: null,
        configured: false,
      };
    }

    if (!this.apiKey || this.isDemoKey()) {
      return {
        balance: 0,
        available_balance: 0,
        sub_account_id: subAccountId,
        configured: true,
        demo_mode: true,
      };
    }

    try {
      const resp = await fetch(`${this.baseUrl}/balance`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          'for-user-id': subAccountId,
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        this.logger.error('Failed to fetch Xendit sub-account balance:', data);
        return {
          balance: 0,
          available_balance: 0,
          sub_account_id: subAccountId,
          configured: true,
          error: data.message || data.error_message || 'Gagal mengambil saldo Xendit tenant',
        };
      }

      return {
        ...data,
        sub_account_id: subAccountId,
        configured: true,
      };
    } catch (err) {
      this.logger.error('Failed to fetch Xendit sub-account balance', err);
      return {
        balance: 0,
        available_balance: 0,
        sub_account_id: subAccountId,
        configured: true,
        error: 'Gagal menghubungi Xendit',
      };
    }
  }

  async createPayoutForSubAccount(params: {
    subAccountId: string;
    referenceId: string;
    channelCode: string;
    accountNumber: string;
    accountHolderName: string;
    amount: number;
    description: string;
    emailTo?: string;
  }) {
    if (!params.subAccountId) {
      throw new BadRequestException('Sub-account Xendit pesantren belum dikonfigurasi');
    }
    if (!params.channelCode) {
      throw new BadRequestException('Kode channel bank Xendit wajib diisi');
    }
    if (!params.accountNumber || !params.accountHolderName) {
      throw new BadRequestException('Nomor rekening dan nama pemilik rekening wajib diisi');
    }
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new BadRequestException('Nominal payout harus berupa angka IDR positif');
    }

    if (this.isDemoKey()) {
      this.logger.warn(`[DEMO MODE] Mocking Xendit payout ${params.referenceId}`);
      return {
        id: `demo-payout-${Date.now()}`,
        amount: params.amount,
        channel_code: params.channelCode,
        currency: 'IDR',
        status: 'ACCEPTED',
        description: params.description,
        reference_id: params.referenceId,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        channel_properties: {
          account_number: params.accountNumber,
          account_holder_name: params.accountHolderName,
        },
        demo_mode: true,
      };
    }

    const body: any = {
      reference_id: params.referenceId,
      channel_code: params.channelCode,
      channel_properties: {
        account_number: params.accountNumber,
        account_holder_name: params.accountHolderName,
      },
      amount: params.amount,
      description: params.description.substring(0, 100),
      currency: 'IDR',
      metadata: {
        tenant_sub_account_id: params.subAccountId,
      },
    };

    if (params.emailTo) {
      body.receipt_notification = { email_to: [params.emailTo] };
    }

    const resp = await fetch(`${this.baseUrl}/v2/payouts`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-key': params.referenceId,
        'for-user-id': params.subAccountId,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (!resp.ok) {
      this.logger.error('Failed to create Xendit payout:', data);
      throw new BadRequestException(
        data.message ||
          data.error_message ||
          data.error_code ||
          'Gagal membuat payout Xendit',
      );
    }

    return data;
  }
}
