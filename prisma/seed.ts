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
      phone: '081000000000',
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
      email: 'admin@darulhikmah.sch.id',
      phone: '021-1234567',
      address: 'Jl. Pesantren No. 1, Bogor',
      subscription_status: 'active',
      expired_at: new Date('2027-12-31'),
      max_students: 500,
    },
  });
  console.log(`✅ Pesantren: ${pesantren.name}`);

  // 3. Create Admin Pesantren
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Admin Darul Hikmah',
      email: 'admin@darulhikmah.sch.id',
      phone: '081111111111',
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
      phone: '081222222222',
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
      phone: '081333333333',
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
      phone: '081333333333',
      tenant_uuid: pesantren.id,
      user_id: ustadUser.id,
      is_tahfidz_teacher: true,
    },
  });

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
        parent_phone: `08140000000${i}`,
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
  await prisma.user.upsert({
    where: { email: 'wali@darulhikmah.sch.id' },
    update: {},
    create: {
      name: 'Wali Santri 1',
      email: 'wali@darulhikmah.sch.id',
      phone: '081400000001',
      password: await bcrypt.hash('wali123', 12),
      role: Role.WALI_SANTRI,
      tenant_uuid: pesantren.id,
    },
  });
  console.log(`✅ Wali Santri user created`);

  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Login Credentials:');
  console.log('  Super Admin:  superadmin@pesantren.id / superadmin123');
  console.log('  Admin:        admin@darulhikmah.sch.id / admin123');
  console.log('  Finance:      finance@darulhikmah.sch.id / finance123');
  console.log('  Ustad:        ustad@darulhikmah.sch.id / ustad123');
  console.log('  Wali Santri:  wali@darulhikmah.sch.id / wali123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
