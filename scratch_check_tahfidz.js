const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.tahfidzRecord.findMany({
    take: 20,
    select: { id: true, title: true, category: true }
  });
  console.log(JSON.stringify(records, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
