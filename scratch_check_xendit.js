const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Pesantren Xendit Config ---');
  const pesantrens = await prisma.pesantren.findMany({
    select: {
      id: true,
      name: true,
      xendit_sub_account_id: true,
    }
  });
  console.table(pesantrens);

  console.log('\n--- Recent Xendit Transactions ---');
  const transactions = await prisma.transaction.findMany({
    where: {
      payment_method: 'payment_gateway',
    },
    take: 10,
    orderBy: {
      payment_date: 'desc'
    },
    select: {
      id: true,
      reference_no: true,
      status: true,
      payment_channel: true,
      xendit_invoice_id: true,
      tenant_uuid: true,
    }
  });
  console.table(transactions);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
