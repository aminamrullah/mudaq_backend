const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const search = "santri";
  const whereClause = {
    deleted_at: null,
  };
  
  whereClause.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { nis: { contains: search, mode: 'insensitive' } },
    { nik: { contains: search, mode: 'insensitive' } },
  ];

  const students = await prisma.student.findMany({
    where: whereClause,
    include: {
      unit: { select: { name: true } },
    },
  });

  console.log(`Found ${students.length} students matching "${search}"`);
  console.log(students.map(s => ({ name: s.name, unit_id: s.unit_id })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
