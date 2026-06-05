const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({
    where: { status: 'CALON' },
    select: { id: true, name: true, nik: true, status: true, unit_id: true, deleted_at: true }
  });
  console.log("CALON Students:", students.length);
  console.log(students);
}

main().catch(console.error).finally(() => prisma.$disconnect());
