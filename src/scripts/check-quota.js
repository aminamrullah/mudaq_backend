const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tenants = await prisma.pesantren.findMany({
    select: { id: true, name: true, max_students: true }
  });
  console.log('Tenants:', JSON.stringify(tenants, null, 2));
  await prisma.$disconnect();
}

check();
