import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto, RequestOtpDto, VerifyOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MailService } from '../mail/mail.service';
import { normalizePhone } from '../../common/utils/phone.util';

@Injectable()
export class AuthService {

  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private whatsappService: WhatsappService,
    private mailService: MailService,
  ) { }


  async login(dto: LoginDto, meta?: { ip: string; ua: string }) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
        deleted_at: null,
      },
      include: {
        pesantren: {
          select: {
            id: true,
            name: true,
            slug: true,
            subscription_status: true,
            expired_at: true,
            calendar_type: true,
            max_students: true,
            can_manage_landing_page: true,
          },
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    });

    if (!user) throw new UnauthorizedException('Akun tidak ditemukan');
    if (!user.is_active) throw new UnauthorizedException('Akun dinonaktifkan');

    if (user.role === 'WALI_SANTRI') {
      throw new UnauthorizedException('Silakan login melalui aplikasi mobile Walisantri menggunakan OTP');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Password salah');

    // For teachers, check if active
    if (user.role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: user.id },
      });
      if (!teacher || teacher.status !== 'active') {
        throw new UnauthorizedException('Akun guru Anda tidak aktif atau sudah dinonaktifkan');
      }
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    let isHomeroom = false;
    let homeroomClasses: string[] = [];
    let isTahfidzTeacher = false;
    let canManageQuran = false;
    let canManageKitab = false;
    if (user.role === 'USTAD') {
      const teacherProfile = await this.prisma.teacher.findFirst({
        where: { user_id: user.id },
        include: { classrooms: { select: { id: true, name: true } } },
      });
      isHomeroom = (teacherProfile?.classrooms?.length || 0) > 0;
      homeroomClasses = teacherProfile?.classrooms?.map((c) => c.name) || [];
      isTahfidzTeacher = teacherProfile?.is_tahfidz_teacher || false;
      canManageQuran = teacherProfile?.can_manage_quran || false;
      canManageKitab = teacherProfile?.can_manage_kitab || false;
    }

    const tokens = await this.generateTokens(user);

    // Record Activity
    await this.prisma.userActivity.create({
      data: {
        user_id: user.id,
        tenant_uuid: user.tenant_uuid,
        action: 'LOGIN',
        description: `User ${user.email} logged in`,
        ip_address: meta?.ip,
        user_agent: meta?.ua,
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenant_uuid: user.tenant_uuid,
        pesantren_name: user.pesantren?.name,
        pesantren_slug: user.pesantren?.slug,
        max_students: user.pesantren?.max_students || 0,
        calendar_type: user.pesantren?.calendar_type || 'gregorian',
        can_manage_landing_page: user.pesantren?.can_manage_landing_page || false,
        subscription_status: user.pesantren?.subscription_status || 'trial',
        expired_at: user.pesantren?.expired_at,
        is_homeroom: isHomeroom,
        homeroom_classes: homeroomClasses,
        is_tahfidz_teacher: isTahfidzTeacher,
        can_manage_quran: canManageQuran,
        can_manage_kitab: canManageKitab,
        koperasi_outlet_id: user.koperasi_outlet_id,
        koperasi_outlet_name: (user as any).koperasi_outlet?.name,
      },
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    if (!dto.phone) throw new UnauthorizedException('Nomor HP harus diisi');
    const cleanPhone = dto.phone.replace(/[^0-9]/g, '');
    const normalizedPhone = normalizePhone(cleanPhone);
    const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;

    // [MODIFIED] Find tenant_uuid to route WhatsApp message
    let tenantUuid = dto.tenant_uuid;
    
    // Fallback: search student by phone to auto-detect tenant
    if (!tenantUuid) {
      const student = await this.prisma.student.findFirst({
        where: { 
          parent_phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone].filter(Boolean) as string[] },
          deleted_at: null 
        },
      });
      if (student) {
        tenantUuid = student.tenant_uuid;
      }
    }

    let user = await this.prisma.user.findFirst({
      where: {
        phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone].filter(Boolean) as string[] },
        deleted_at: null
      },
    });

    if (!user) {
      // Auto-registration for Walisantri
      const hashedPassword = await bcrypt.hash(normalizedPhone, 12);
      user = await this.prisma.user.create({
        data: {
          name: `Walisantri`,
          email: `${normalizedPhone}@walisantri.com`,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'WALI_SANTRI',
          tenant_uuid: tenantUuid, // Set if found!
        },
      });
    } else if (tenantUuid && !user.tenant_uuid) {
      // Update tenant if user exists but has no tenant linked
      await this.prisma.user.update({
        where: { id: user.id },
        data: { tenant_uuid: tenantUuid },
      });
      user.tenant_uuid = tenantUuid;
    }

    if (!user) {
      throw new UnauthorizedException('Nomor HP tidak terdaftar');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await this.prisma.otp.upsert({
      where: { phone: normalizedPhone },
      update: { otp, expires_at: expiresAt },
      create: { phone: normalizedPhone, otp, expires_at: expiresAt },
    });

    // Send WA via Unified WhatsApp Service (Using Tenant's WA or Fallback to System)
    await this.whatsappService.sendMessage(
      normalizedPhone,
      `*KODE OTP LOGIN*
      
Kode verifikasi Anda adalah: *${otp}*

Berlaku selama 5 menit. Jangan berikan kode ini kepada siapapun.`,
      tenantUuid || user.tenant_uuid,
      true // Priority: kirim paling depan antrian
    );

    return { message: 'OTP telah dikirim ke WhatsApp Anda' };
  }

  async verifyOtp(dto: VerifyOtpDto, meta?: { ip: string; ua: string }) {
    const cleanPhone = dto.phone.replace(/[^0-9]/g, '');
    const normalizedPhone = normalizePhone(cleanPhone);
    const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;

    const otpRecord = await this.prisma.otp.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!otpRecord || otpRecord.otp !== dto.otp) {
      throw new UnauthorizedException('Kode OTP salah');
    }

    if (otpRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Kode OTP sudah kadaluwarsa');
    }

    // Delete OTP after success
    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    const user = await this.prisma.user.findFirst({
      where: { phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone] } },
      include: {
        pesantren: {
          select: {
            id: true,
            name: true,
            slug: true,
            subscription_status: true,
            expired_at: true,
            calendar_type: true,
            max_students: true,
            can_manage_landing_page: true,
            logo: true,
          },
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    });

    if (!user) throw new UnauthorizedException('Akun tidak ditemukan');

    // For teachers, check if active
    if (user.role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: user.id },
      });
      if (!teacher || teacher.status !== 'active') {
        throw new UnauthorizedException('Akun guru Anda tidak aktif atau sudah dinonaktifkan');
      }
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    let isHomeroom = false;
    let homeroomClasses: string[] = [];
    let isTahfidzTeacher = false;
    let canManageQuran = false;
    let canManageKitab = false;
    if (user.role === 'USTAD') {
      const teacherProfile = await this.prisma.teacher.findFirst({
        where: { user_id: user.id },
        include: { classrooms: { select: { id: true, name: true } } },
      });
      isHomeroom = (teacherProfile?.classrooms?.length || 0) > 0;
      homeroomClasses = teacherProfile?.classrooms?.map((c) => c.name) || [];
      isTahfidzTeacher = teacherProfile?.is_tahfidz_teacher || false;
      canManageQuran = teacherProfile?.can_manage_quran || false;
      canManageKitab = teacherProfile?.can_manage_kitab || false;
    }

    const tokens = await this.generateTokens(user);

    // Record Activity
    await this.prisma.userActivity.create({
      data: {
        user_id: user.id,
        tenant_uuid: user.tenant_uuid,
        action: 'LOGIN',
        description: `User ${user.phone} logged in via OTP`,
        ip_address: meta?.ip,
        user_agent: meta?.ua,
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenant_uuid: user.tenant_uuid,
        pesantren_name: user.pesantren?.name,
        pesantren_slug: user.pesantren?.slug,
        max_students: user.pesantren?.max_students || 0,
        calendar_type: user.pesantren?.calendar_type || 'gregorian',
        can_manage_landing_page: user.pesantren?.can_manage_landing_page || false,
        pesantren_logo: user.pesantren?.logo,
        subscription_status: user.pesantren?.subscription_status || 'trial',
        expired_at: user.pesantren?.expired_at,
        is_homeroom: isHomeroom,
        homeroom_classes: homeroomClasses,
        is_tahfidz_teacher: isTahfidzTeacher,
        can_manage_quran: canManageQuran,
        can_manage_kitab: canManageKitab,
        koperasi_outlet_id: user.koperasi_outlet_id,
        koperasi_outlet_name: (user as any).koperasi_outlet?.name,
      },
    };
  }





  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
      },
    });
    if (existing)
      throw new ConflictException('Email atau nomor telepon sudah terdaftar');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
        tenant_uuid: dto.tenant_uuid || null,
        role: 'STAFF_PESANTREN',
      },
    });

    const tokens = await this.generateTokens(user);
    this.logger.log(`New user registered: ${user.email}`);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    // Delete old token
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.generateTokens(stored.user);
  }

  async requestPasswordReset(dto: RequestOtpDto) {
    let user;
    let identifier;

    if (dto.email) {
      user = await this.prisma.user.findFirst({
        where: { email: dto.email, deleted_at: null },
      });
      identifier = dto.email;
    } else if (dto.phone) {
      const cleanPhone = dto.phone.replace(/[^0-9]/g, '');
      const normalizedPhone = normalizePhone(cleanPhone);
      user = await this.prisma.user.findFirst({
        where: { phone: normalizedPhone, deleted_at: null },
      });
      identifier = normalizedPhone;
    }

    if (!user || !identifier) {
      throw new UnauthorizedException('Akun tidak ditemukan');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.prisma.otp.upsert({
      where: { phone: identifier as string },
      update: { otp, expires_at: expiresAt },
      create: { phone: identifier as string, otp, expires_at: expiresAt },
    });

    if (dto.email) {
      try {
        await this.mailService.sendOtp(dto.email, otp);
        return { message: 'Kode reset password telah dikirim ke email Anda' };
      } catch (err) {
        this.logger.error(`Failed to send password reset email to ${dto.email}`, err.stack);
        throw new UnauthorizedException('Gagal mengirim email reset password. Silakan coba lagi nanti.');
      }
    } else if (identifier) {
      await this.whatsappService.sendMessage(
        identifier,
        `*RESET PASSWORD MUDAQ*
        
Kode reset password Anda adalah: *${otp}*
  
Berlaku selama 10 menit. Masukkan kode ini di halaman reset password aplikasi MUDAQ.`,
        user.tenant_uuid,
        true
      );
      return { message: 'Kode reset password telah dikirim ke WhatsApp Anda' };
    }

    throw new UnauthorizedException('Identifier tidak valid');
  }

  async resetPassword(dto: ResetPasswordDto) {
    let identifier;
    if (dto.email) {
      identifier = dto.email;
    } else if (dto.phone) {
      const cleanPhone = dto.phone.replace(/[^0-9]/g, '');
      identifier = normalizePhone(cleanPhone);
    }

    if (!identifier) throw new UnauthorizedException('Identifier tidak valid');

    const otpRecord = await this.prisma.otp.findUnique({
      where: { phone: identifier },
    });

    if (!otpRecord || otpRecord.otp !== dto.otp) {
      throw new UnauthorizedException('Kode OTP salah');
    }

    if (otpRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Kode OTP sudah kadaluwarsa');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: identifier },
          { email: identifier }
        ]
      },
    });

    if (!user) throw new UnauthorizedException('User tidak ditemukan');

    const hashedPassword = await bcrypt.hash(dto.new_password, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Delete OTP after success
    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    return { message: 'Password berhasil diubah. Silakan login kembali.' };
  }

  async logout(userId: string, meta?: { ip: string; ua: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Record Activity
    if (user) {
      await this.prisma.userActivity.create({
        data: {
          user_id: userId,
          tenant_uuid: user.tenant_uuid,
          action: 'LOGOUT',
          description: `User ${user.email || user.phone} logged out`,
          ip_address: meta?.ip,
          user_agent: meta?.ua,
        },
      });
    }

    await this.prisma.refreshToken.deleteMany({ where: { user_id: userId } });
    return { message: 'Logout berhasil' };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenant_uuid: user.tenant_uuid,
    };

    const access_token = this.jwtService.sign(payload);

    const refresh_token = uuidv4();
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token: refresh_token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { access_token, refresh_token };
  }
}
