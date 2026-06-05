const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({
    where: {
      unit_id: { not: null }
    }
  });

  console.log(`Found ${students.length} students with unit_id`);

  let created = 0;
  for (const student of students) {
    const existing = await prisma.studentRegistration.findFirst({
      where: {
        student_id: student.id,
        unit_id: student.unit_id
      }
    });

    if (!existing) {
      await prisma.studentRegistration.create({
        data: {
          tenant_uuid: student.tenant_uuid,
          student_id: student.id,
          unit_id: student.unit_id,
          nis: student.nis,
          status: student.status,
          classroom_id: student.classroom_id,
          academic_year_id: student.academic_year_id,
          entry_year: student.entry_year,
          graduation_date: student.graduation_date,
          tahfidz_teacher_id: student.tahfidz_teacher_id,
          quran_teacher_id: student.quran_teacher_id,
          kitab_teacher_id: student.kitab_teacher_id,
          ppdb_wave_id: student.ppdb_wave_id,
          dormitory_id: student.dormitory_id,
          dormitory_room_id: student.dormitory_room_id,
        }
      });
      created++;
    }
  }

  console.log(`Created ${created} student registrations.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
