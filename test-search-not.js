const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const search = "santri";
  const currentUnitId = 'some-unit-id'; // simulate

  const whereClause = {
    deleted_at: null,
    unit_id: { not: currentUnitId }
  };
  
  whereClause.OR = [
    { name: { contains: search, mode: 'insensitive' } },
  ];

  const students = await prisma.student.findMany({
    where: whereClause,
  });

  console.log(`With { not: currentUnitId }, Found ${students.length} students`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
