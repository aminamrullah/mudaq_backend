import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Super Admin (no tenant)
  const superAdminPassword = await bcrypt.hash('superadmin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@pesantren.id' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'superadmin@pesantren.id',
      phone: '628100000000',
      password: superAdminPassword,
      role: Role.SUPER_ADMIN,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // 2. Create Demo Pesantren
  const pesantren = await prisma.pesantren.upsert({
    where: { slug: 'darul-hikmah' },
    update: {},
    create: {
      name: 'Pesantren Darul Hikmah',
      slug: 'darul-hikmah',
      domain: 'darulhikmah.mudaq.id',
      email: 'admin@darulhikmah.sch.id',
      phone: '021-1234567',
      address: 'Jl. Pesantren No. 1, Bogor',
      subscription_status: 'active',
      expired_at: new Date('2027-12-31'),
      max_students: 500,
      storage_limit: BigInt(5 * 1024 * 1024 * 1024), // 5GB
      ppdb_is_active: true,
      addon_ppdb: true,
    },
  });
  console.log(`✅ Pesantren: ${pesantren.name}`);

  // 2.1 Create Education Unit (Required for PPDB Waves)
  const educationUnit = await prisma.educationUnit.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: 'SMP Darul Hikmah' } },
    update: {},
    create: {
      name: 'SMP Darul Hikmah',
      tenant_uuid: pesantren.id,
      is_active: true,
      ppdb_is_active: true,
    },
  });
  console.log(`✅ Education Unit: ${educationUnit.name}`);

  // 2.1.1 Create another Education Unit (SMA)
  const educationUnitSMA = await prisma.educationUnit.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: 'SMA Darul Hikmah' } },
    update: {},
    create: {
      name: 'SMA Darul Hikmah',
      tenant_uuid: pesantren.id,
      is_active: true,
      ppdb_is_active: true,
    },
  });
  console.log(`✅ Education Unit: ${educationUnitSMA.name}`);

  // 2.2 Create PPDB Wave
  const ppdbWave = await prisma.ppdbWave.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: 'Gelombang Utama 2026' } },
    update: {},
    create: {
      name: 'Gelombang Utama 2026',
      tenant_uuid: pesantren.id,
      start_date: new Date('2025-10-01'),
      end_date: new Date('2026-07-01'),
      quota: 100,
      is_active: true,
      unit_ids: [educationUnit.id],
    },
  });

  // 3. Create Admin Pesantren
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Admin Darul Hikmah',
      email: 'admin@darulhikmah.sch.id',
      phone: '628111111111',
      password: adminPassword,
      role: Role.ADMIN_PESANTREN,
      tenant_uuid: pesantren.id,
    },
  });
  console.log(`✅ Admin Pesantren: ${admin.email}`);

  // 4. Create Finance User
  const financePassword = await bcrypt.hash('finance123', 12);
  const finance = await prisma.user.upsert({
    where: { email: 'finance@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Bendahara',
      email: 'finance@darulhikmah.sch.id',
      phone: '628122222222',
      password: financePassword,
      role: Role.FINANCE_PESANTREN,
      tenant_uuid: pesantren.id,
    },
  });
  console.log(`✅ Finance: ${finance.email}`);

  // 5. Create Academic Year
  const academicYear = await prisma.academicYear.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: '2026/2027' } },
    update: {},
    create: {
      name: '2026/2027',
      tenant_uuid: pesantren.id,
      start_date: new Date('2026-07-01'),
      end_date: new Date('2027-06-30'),
      is_active: true,
    },
  });

  // 6. Create Classroom
  const classroom = await prisma.classroom.upsert({
    where: { tenant_uuid_name_academic_year_id: { tenant_uuid: pesantren.id, name: 'Kelas 1A', academic_year_id: academicYear.id } },
    update: {},
    create: {
      name: 'Kelas 1A',
      level: '1',
      tenant_uuid: pesantren.id,
      academic_year_id: academicYear.id,
    },
  });

  // 6.1 Create Classroom for SMA
  const classroomSMA = await prisma.classroom.upsert({
    where: { tenant_uuid_name_academic_year_id: { tenant_uuid: pesantren.id, name: 'Kelas 10A', academic_year_id: academicYear.id } },
    update: {},
    create: {
      name: 'Kelas 10A',
      level: '10',
      tenant_uuid: pesantren.id,
      academic_year_id: academicYear.id,
    },
  });

  // 7. Create Dormitory
  const dormitory = await prisma.dormitory.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: 'Asrama Putra Al-Farabi' } },
    update: {},
    create: {
      name: 'Asrama Putra Al-Farabi',
      mushrif_name: 'Ustadz Ahmad',
      tenant_uuid: pesantren.id,
    },
  });

  // 8. Create Teacher/Ustad
  const ustadUser = await prisma.user.upsert({
    where: { email: 'ustad@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Ustadz Muhammad',
      email: 'ustad@darulhikmah.sch.id',
      phone: '628133333333',
      password: await bcrypt.hash('ustad123', 12),
      role: Role.USTAD,
      tenant_uuid: pesantren.id,
    },
  });

  const teacher = await prisma.teacher.upsert({
    where: { user_id: ustadUser.id },
    update: {},
    create: {
      name: 'Ustadz Muhammad',
      nip: '198801012020011001',
      phone: '628133333333',
      tenant_uuid: pesantren.id,
      user_id: ustadUser.id,
      is_tahfidz_teacher: true,
    },
  });

  // 8.1 Create Subject (Kitab/Mapel)
  const subject = await prisma.subject.upsert({
    where: { tenant_uuid_unit_id_code: { tenant_uuid: pesantren.id, unit_id: educationUnit.id, code: 'FATHUL-QARIB' } },
    update: {},
    create: {
      name: 'Kitab Fathul Qarib',
      tenant_uuid: pesantren.id,
      unit_id: educationUnit.id,
      code: 'FATHUL-QARIB',
    },
  });
  console.log(`✅ Subject: ${subject.name}`);

  // 8.2 Create Schedule (Jadwal)
  const scheduleCount = await prisma.schedule.count({ where: { classroom_id: classroomSMA.id } });
  if (scheduleCount === 0) {
    await prisma.schedule.create({
      data: {
        tenant_uuid: pesantren.id,
        classroom_id: classroomSMA.id,
        subject_id: subject.id,
        teacher_id: teacher.id,
        day_of_week: 1,
        start_time: '08:00',
        end_time: '09:30',
      }
    });
    console.log(`✅ Schedule created for ${classroomSMA.name}`);
  }

  // 9. Create Sample Students
  for (let i = 1; i <= 5; i++) {
    const student = await prisma.student.upsert({
      where: { tenant_uuid_nis: { tenant_uuid: pesantren.id, nis: `2026000${i}` } },
      update: {},
      create: {
        name: `Santri ${i}`,
        nis: `2026000${i}`,
        gender: i % 2 === 0 ? 'P' : 'L',
        birth_place: 'Bogor',
        birth_date: new Date(`2010-0${i}-15`),
        parent_phone: `628140000000${i}`,
        father_name: `Bapak Santri ${i}`,
        mother_name: `Ibu Santri ${i}`,
        tenant_uuid: pesantren.id,
        classroom_id: classroom.id,
        dormitory_id: dormitory.id,
        academic_year_id: academicYear.id,
        tahfidz_teacher_id: teacher.id,
        status: 'AKTIF',
      },
    });

    // Create wallet for each student
    await prisma.wallet.upsert({
      where: { student_id: student.id },
      update: {},
      create: { tenant_uuid: pesantren.id, student_id: student.id, balance: 100000 * i },
    });
  }
  console.log(`✅ 5 sample students with wallets created`);

  // 9.1 Create Sample Blog Post for Landing Page
  const postCount = await prisma.post.count({ where: { tenant_uuid: pesantren.id } });
  if (postCount === 0) {
    await prisma.post.create({
      data: {
        tenant_uuid: pesantren.id,
        title: 'Penerimaan Santri Baru Tahun Ajaran 2026/2027',
        content: 'Pesantren Darul Hikmah membuka pendaftaran santri baru untuk jenjang SMP...',
        is_published: true,
      },
    });
  }

  // 10. Create Fee Category
  await prisma.feeCategory.upsert({
    where: { tenant_uuid_name: { tenant_uuid: pesantren.id, name: 'SPP Bulanan' } },
    update: {},
    create: {
      name: 'SPP Bulanan',
      type: 'monthly',
      amount: 500000,
      tenant_uuid: pesantren.id,
      due_day: 10,
    },
  });
  console.log(`✅ Fee category created`);

  // 11. Create Wali Santri User
  // await prisma.user.upsert({
  //   where: { email: 'wali@darulhikmah.sch.id' },
  //   update: {},
  //   create: {
  //     name: 'Wali Santri 1',
  //     email: 'wali@darulhikmah.sch.id',
  //     phone: '6281400000001',
  //     password: await bcrypt.hash('wali123', 12),
  //     role: Role.WALI_SANTRI,
  //     tenant_uuid: pesantren.id,
  //   },
  // });
  // console.log(`✅ Wali Santri user created`);

  // 12. Create Kepala Koperasi User
  const koperasiPassword = await bcrypt.hash('koperasi123', 12);
  await prisma.user.upsert({
    where: { email: 'koperasi@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Kepala Koperasi',
      email: 'koperasi@darulhikmah.sch.id',
      phone: '628155555555',
      password: koperasiPassword,
      role: Role.KEPALA_KOPERASI,
      tenant_uuid: pesantren.id,
    },
  });
  console.log(`✅ Kepala Koperasi user created`);

  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Login Credentials:');
  console.log('  Super Admin:  superadmin@pesantren.id / superadmin123');
  console.log('  Admin:        admin@darulhikmah.sch.id / admin123');
  console.log('  Finance:      finance@darulhikmah.sch.id / finance123');
  console.log('  Ustad:        ustad@darulhikmah.sch.id / ustad123');
  console.log('  Wali Santri:  wali@darulhikmah.sch.id / wali123');
  console.log('  Koperasi:     koperasi@darulhikmah.sch.id / koperasi123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
