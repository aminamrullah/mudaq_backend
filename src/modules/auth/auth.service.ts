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
    const user = (await this.prisma.user.findFirst({
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
            addon_koperasi: true,
            addon_wa_gateway: true,
            addon_landing_page: true,
            addon_inventaris: true,
            deleted_at: true,
          } as any,
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    })) as any;

    if (!user) throw new UnauthorizedException('Akun tidak ditemukan');
    if (!user.is_active) throw new UnauthorizedException('Akun dinonaktifkan');
    if (user.pesantren && user.pesantren.deleted_at) {
      throw new UnauthorizedException('Pesantren Anda telah dihapus');
    }

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
        addon_koperasi: user.pesantren?.addon_koperasi || false,
        addon_wa_gateway: user.pesantren?.addon_wa_gateway || false,
        addon_landing_page: user.pesantren?.addon_landing_page || false,
        addon_inventaris: user.pesantren?.addon_inventaris || false,
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

    let user = await this.prisma.user.findFirst({
      where: {
        phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone].filter(Boolean) as string[] },
        deleted_at: null
      },
    });

    // [MODIFIED] Find tenant_uuid to route WhatsApp message
    let tenantUuid = dto.tenant_uuid || user?.tenant_uuid;
    
    // Fallback: search student by phone to auto-detect tenant if user doesn't have one
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

    // Verify phone isolation
    await this.validatePhoneIsolation(normalizedPhone, tenantUuid);



    if (user && user.tenant_uuid && tenantUuid && user.tenant_uuid !== tenantUuid) {
      throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} sudah terdaftar di pesantren lain.`);
    }

    if (!user) {
      // Free up unique constraint if there's a deleted user with this phone
      const deletedUser = await this.prisma.user.findFirst({
        where: {
          phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone].filter(Boolean) as string[] },
          deleted_at: { not: null }
        }
      });

      if (deletedUser) {
        await this.prisma.user.update({
          where: { id: deletedUser.id },
          data: {
            phone: deletedUser.phone ? `${deletedUser.phone}_del_${Date.now()}` : null,
            email: deletedUser.email ? `${deletedUser.email}_del_${Date.now()}` : null,
          }
        });
      }

      // Auto-registration for Walisantri
      const hashedPassword = await bcrypt.hash(normalizedPhone, 12);
      user = await this.prisma.user.create({
        data: {
          name: `Walisantri`,
          email: `${normalizedPhone}@walisantri.com`,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'WALI_SANTRI',
          tenant_uuid: tenantUuid || null, // Set if found!
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

    const user = (await this.prisma.user.findFirst({
      where: { 
        phone: { in: [normalizedPhone, legacyPhone, cleanPhone, dto.phone].filter(Boolean) as string[] },
        deleted_at: null
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
            addon_koperasi: true,
            addon_wa_gateway: true,
            addon_landing_page: true,
            addon_inventaris: true,
            logo: true,
            deleted_at: true,
          } as any,
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    })) as any;

    if (!user) throw new UnauthorizedException('Akun tidak ditemukan');
    if (!user.is_active) throw new UnauthorizedException('Akun dinonaktifkan');
    if (user.pesantren && user.pesantren.deleted_at) {
      throw new UnauthorizedException('Pesantren Anda telah dihapus');
    }

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
        addon_koperasi: user.pesantren?.addon_koperasi || false,
        addon_wa_gateway: user.pesantren?.addon_wa_gateway || false,
        addon_landing_page: user.pesantren?.addon_landing_page || false,
        addon_inventaris: user.pesantren?.addon_inventaris || false,
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
        deleted_at: null,
      },
    });
    if (existing)
      throw new ConflictException('Email atau nomor telepon sudah terdaftar');

    // Free up unique constraints if there's a deleted user
    const deletedUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
        deleted_at: { not: null },
      },
    });
    
    if (deletedUser) {
      await this.prisma.user.update({
        where: { id: deletedUser.id },
        data: {
          phone: deletedUser.phone ? `${deletedUser.phone}_del_${Date.now()}` : null,
          email: deletedUser.email ? `${deletedUser.email}_del_${Date.now()}` : null,
        }
      });
    }

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
      include: { 
        user: {
          include: {
            pesantren: { select: { deleted_at: true } }
          }
        }
      },
    });

    if (!stored || stored.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    if (!stored.user.is_active) {
      throw new UnauthorizedException('Akun dinonaktifkan');
    }
    
    if ((stored.user as any).pesantren?.deleted_at) {
      throw new UnauthorizedException('Pesantren Anda telah dihapus');
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

  async validatePhoneIsolation(phone: string, tenantUuid?: string | null) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;

    // 1. Check if the parent phone is used in multiple different tenants
    const studentCountByTenant = await this.prisma.student.groupBy({
      by: ['tenant_uuid'],
      where: {
        parent_phone: normalizedPhone,
        deleted_at: null,
      },
    });
    if (studentCountByTenant.length > 1) {
      throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} terdeteksi terdaftar di beberapa pesantren berbeda.`);
    }

    // 2. Check if used by any student in a DIFFERENT tenant
    if (tenantUuid) {
      const otherStudent = await this.prisma.student.findFirst({
        where: {
          parent_phone: normalizedPhone,
          tenant_uuid: { not: tenantUuid },
          deleted_at: null,
        },
      });
      if (otherStudent) {
        throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} sudah digunakan oleh wali santri di pesantren lain.`);
      }
    }

    // 3. Check if registered under a DIFFERENT tenant in User table
    if (tenantUuid) {
      const otherUser = await this.prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          tenant_uuid: { not: tenantUuid },
          deleted_at: null,
        },
      });
      if (otherUser) {
        throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} sudah terdaftar di pesantren lain.`);
      }
    }
  }

  async googleLogin(idToken: string, meta?: { ip: string; ua: string }) {
    let payload: any;
    if (idToken.startsWith('mock_google_token_')) {
      const email = idToken.replace('mock_google_token_', '');
      payload = {
        email,
        name: email.split('@')[0],
        sub: 'mock_' + email.split('@')[0],
      };
    } else {
      try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!res.ok) {
          throw new UnauthorizedException('Token Google tidak valid');
        }
        payload = await res.json();
      } catch (err) {
        this.logger.error('Failed to verify Google token', err);
        throw new UnauthorizedException('Token Google tidak valid atau gagal diverifikasi');
      }
    }

    const { email, name, sub: googleId } = payload;
    if (!email) {
      throw new UnauthorizedException('Token Google tidak menyertakan email');
    }

    let user = await this.prisma.user.findFirst({
      where: { email, deleted_at: null },
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
            addon_koperasi: true,
            addon_wa_gateway: true,
            addon_landing_page: true,
            addon_inventaris: true,
            logo: true,
            deleted_at: true,
          } as any,
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    }) as any;

    if (user) {
      if (!user.is_active) {
        throw new UnauthorizedException('Akun dinonaktifkan');
      }
      if (user.pesantren && user.pesantren.deleted_at) {
        throw new UnauthorizedException('Pesantren Anda telah dihapus');
      }

      if (user.phone) {
        // Already registered and has phone number, generate full login response
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
            description: `User ${user.email} logged in via Google`,
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
            addon_koperasi: user.pesantren?.addon_koperasi || false,
            addon_wa_gateway: user.pesantren?.addon_wa_gateway || false,
            addon_landing_page: user.pesantren?.addon_landing_page || false,
            addon_inventaris: user.pesantren?.addon_inventaris || false,
            pesantren_logo: user.pesantren?.logo,
            subscription_status: user.pesantren?.subscription_status || 'trial',
            expired_at: user.pesantren?.expired_at,
            is_homeroom: isHomeroom,
            homeroom_classes: homeroomClasses,
            is_tahfidz_teacher: isTahfidzTeacher,
            can_manage_quran: canManageQuran,
            can_manage_kitab: canManageKitab,
            koperasi_outlet_id: user.koperasi_outlet_id,
            koperasi_outlet_name: user.koperasi_outlet?.name,
          },
        };
      }
    }

    // If user does not exist or user exists but phone is null/empty:
    // Generate a temporary JWT token valid for 15 minutes to allow binding phone number
    const tempToken = this.jwtService.sign(
      { email, name: name || 'User Google', temp: true },
      { expiresIn: '15m' }
    );

    return {
      needsPhone: true,
      temp_token: tempToken,
    };
  }

  async bindPhone(
    tempToken: string,
    phone: string,
    otp: string,
    meta?: { ip: string; ua: string },
  ) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
    } catch (err) {
      throw new UnauthorizedException('Token sementara tidak valid atau telah kadaluwarsa');
    }

    if (!payload || !payload.temp || !payload.email) {
      throw new UnauthorizedException('Token sementara tidak valid');
    }

    const { email, name } = payload;

    // Verify OTP first
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const normalizedPhone = normalizePhone(cleanPhone);
    const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;

    const otpRecord = await this.prisma.otp.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!otpRecord || otpRecord.otp !== otp) {
      throw new UnauthorizedException('Kode OTP salah');
    }

    if (otpRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Kode OTP sudah kadaluwarsa');
    }

    // Delete OTP after successful verification
    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    // Find user by email
    let userByEmail = await this.prisma.user.findFirst({
      where: { email, deleted_at: null },
    });

    if (!userByEmail) {
      // Free up deleted user email
      const deletedUserEmail = await this.prisma.user.findFirst({
        where: { email, deleted_at: { not: null } }
      });
      if (deletedUserEmail) {
        await this.prisma.user.update({
          where: { id: deletedUserEmail.id },
          data: {
            phone: deletedUserEmail.phone ? `${deletedUserEmail.phone}_del_${Date.now()}` : null,
            email: `${deletedUserEmail.email}_del_${Date.now()}`,
          }
        });
      }
    }

    // Find user by phone
    let userByPhone = await this.prisma.user.findFirst({
      where: { 
        phone: { in: [normalizedPhone, legacyPhone, cleanPhone, phone].filter(Boolean) as string[] },
        deleted_at: null 
      },
    });

    if (!userByPhone) {
      // Free up deleted user phone
      const deletedUserPhone = await this.prisma.user.findFirst({
        where: {
          phone: { in: [normalizedPhone, legacyPhone, cleanPhone, phone].filter(Boolean) as string[] },
          deleted_at: { not: null }
        }
      });
      if (deletedUserPhone) {
        await this.prisma.user.update({
          where: { id: deletedUserPhone.id },
          data: {
            phone: deletedUserPhone.phone ? `${deletedUserPhone.phone}_del_${Date.now()}` : null,
            email: deletedUserPhone.email ? `${deletedUserPhone.email}_del_${Date.now()}` : null,
          }
        });
      }
    }

    let detectedTenantUuid = userByEmail?.tenant_uuid || userByPhone?.tenant_uuid;
    if (!detectedTenantUuid) {
      const student = await this.prisma.student.findFirst({
        where: {
          parent_phone: { in: [normalizedPhone, legacyPhone, cleanPhone, phone].filter(Boolean) as string[] },
          deleted_at: null,
        },
      });
      detectedTenantUuid = student ? student.tenant_uuid : null;
    }

    // Check phone isolation
    await this.validatePhoneIsolation(normalizedPhone, detectedTenantUuid);

    let targetUser: any = null;

    if (userByEmail && userByPhone) {
      if (userByEmail.id === userByPhone.id) {
        // They are the same row, just update
        targetUser = await this.prisma.user.update({
          where: { id: userByEmail.id },
          data: {
            phone: normalizedPhone,
            tenant_uuid: detectedTenantUuid || userByEmail.tenant_uuid || null,
          },
        });
      } else {
        // Different rows: is the userByPhone a placeholder auto-registered account?
        const isPlaceholder = userByPhone.email?.endsWith('@walisantri.com');
        if (isPlaceholder) {
          // Merge: Delete userByEmail (which is currently empty of phone number and was just logged in via Google)
          // and move Google email & name to userByPhone
          await this.prisma.user.delete({ where: { id: userByEmail.id } });
          targetUser = await this.prisma.user.update({
            where: { id: userByPhone.id },
            data: {
              email: email,
              name: name || userByPhone.name,
              tenant_uuid: detectedTenantUuid || userByPhone.tenant_uuid || null,
            },
          });
        } else {
          throw new ConflictException('Nomor telepon sudah terikat dengan email Google lain.');
        }
      }
    } else if (userByEmail) {
      // Only email exists, bind phone to it
      targetUser = await this.prisma.user.update({
        where: { id: userByEmail.id },
        data: {
          phone: normalizedPhone,
          tenant_uuid: detectedTenantUuid || userByEmail.tenant_uuid || null,
        },
      });
    } else if (userByPhone) {
      // Only phone exists (from auto-registration or direct registry)
      const isPlaceholder = userByPhone.email?.endsWith('@walisantri.com');
      if (isPlaceholder || userByPhone.role === 'WALI_SANTRI') {
        // Update email to the Google email
        targetUser = await this.prisma.user.update({
          where: { id: userByPhone.id },
          data: {
            email: email,
            name: name || userByPhone.name,
            tenant_uuid: detectedTenantUuid || userByPhone.tenant_uuid || null,
          },
        });
      } else {
        throw new ConflictException('Nomor telepon sudah terikat dengan email Google lain.');
      }
    } else {
      // Neither exists: Create new user
      const hashedPassword = await bcrypt.hash(normalizedPhone, 12);
      targetUser = await this.prisma.user.create({
        data: {
          name: name || 'Walisantri',
          email: email,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'WALI_SANTRI',
          tenant_uuid: detectedTenantUuid || null,
        },
      });
    }

    // Now load full target user with pesantren details to return standard login structure
    const fullUser = await this.prisma.user.findFirst({
      where: { id: targetUser.id },
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
            addon_koperasi: true,
            addon_wa_gateway: true,
            addon_landing_page: true,
            addon_inventaris: true,
            logo: true,
          } as any,
        },
        koperasi_outlet: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    }) as any;

    let isHomeroom = false;
    let homeroomClasses: string[] = [];
    let isTahfidzTeacher = false;
    let canManageQuran = false;
    let canManageKitab = false;
    if (fullUser.role === 'USTAD') {
      const teacherProfile = await this.prisma.teacher.findFirst({
        where: { user_id: fullUser.id },
        include: { classrooms: { select: { id: true, name: true } } },
      });
      isHomeroom = (teacherProfile?.classrooms?.length || 0) > 0;
      homeroomClasses = teacherProfile?.classrooms?.map((c) => c.name) || [];
      isTahfidzTeacher = teacherProfile?.is_tahfidz_teacher || false;
      canManageQuran = teacherProfile?.can_manage_quran || false;
      canManageKitab = teacherProfile?.can_manage_kitab || false;
    }

    // If student has a tenant but targetUser had none, update student tenant just in case
    if (detectedTenantUuid && !fullUser.tenant_uuid) {
      await this.prisma.user.update({
        where: { id: fullUser.id },
        data: { tenant_uuid: detectedTenantUuid },
      });
      fullUser.tenant_uuid = detectedTenantUuid;
    }

    const tokens = await this.generateTokens(fullUser);

    // Record Activity
    await this.prisma.userActivity.create({
      data: {
        user_id: fullUser.id,
        tenant_uuid: fullUser.tenant_uuid,
        action: 'LOGIN',
        description: `User ${fullUser.email} bound phone ${normalizedPhone} and logged in via Google`,
        ip_address: meta?.ip,
        user_agent: meta?.ua,
      },
    });

    return {
      ...tokens,
      user: {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        phone: fullUser.phone,
        role: fullUser.role,
        tenant_uuid: fullUser.tenant_uuid,
        pesantren_name: fullUser.pesantren?.name,
        pesantren_slug: fullUser.pesantren?.slug,
        max_students: fullUser.pesantren?.max_students || 0,
        calendar_type: fullUser.pesantren?.calendar_type || 'gregorian',
        can_manage_landing_page: fullUser.pesantren?.can_manage_landing_page || false,
        addon_koperasi: fullUser.pesantren?.addon_koperasi || false,
        addon_wa_gateway: fullUser.pesantren?.addon_wa_gateway || false,
        addon_landing_page: fullUser.pesantren?.addon_landing_page || false,
        addon_inventaris: fullUser.pesantren?.addon_inventaris || false,
        pesantren_logo: fullUser.pesantren?.logo,
        subscription_status: fullUser.pesantren?.subscription_status || 'trial',
        expired_at: fullUser.pesantren?.expired_at,
        is_homeroom: isHomeroom,
        homeroom_classes: homeroomClasses,
        is_tahfidz_teacher: isTahfidzTeacher,
        can_manage_quran: canManageQuran,
        can_manage_kitab: canManageKitab,
        koperasi_outlet_id: fullUser.koperasi_outlet_id,
        koperasi_outlet_name: fullUser.koperasi_outlet?.name,
      },
    };
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
