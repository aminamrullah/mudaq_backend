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
}
