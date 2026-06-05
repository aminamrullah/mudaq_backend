const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({
    orderBy: { created_at: 'desc' },
    take: 10,
    select: { id: true, name: true, status: true, created_at: true }
  });
  console.log("Recent Students:", students);
}

main().catch(console.error).finally(() => prisma.$disconnect());
