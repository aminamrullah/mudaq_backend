const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.transaction.findMany({
    include: {
      fee_category: true
    }
  });
  console.log(transactions.map(t => ({
    id: t.id,
    tenant: t.tenant_uuid,
    type: t.fee_category?.type,
    amount: t.amount_paid
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
