import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: this.configService.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendMail(to: string, subject: string, html: string) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${this.configService.get<string>('MAIL_FROM_NAME', 'MUDAQ')}" <${this.configService.get<string>('MAIL_FROM_EMAIL')}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
      throw error;
    }
  }

  async sendOtp(to: string, otp: string) {
    const subject = 'Kode Reset Password MUDAQ';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Reset Password MUDAQ</h2>
        <p>Anda menerima email ini karena Anda meminta reset password untuk akun MUDAQ Anda.</p>
        <p>Berikut adalah kode verifikasi (OTP) Anda:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6; margin: 20px 0;">
          ${otp}
        </div>
        <p>Kode ini berlaku selama 10 menit. Jangan berikan kode ini kepada siapapun.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Jika Anda tidak meminta reset password, silakan abaikan email ini.</p>
      </div>
    `;
    return this.sendMail(to, subject, html);
  }
}
