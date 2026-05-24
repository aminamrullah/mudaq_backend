const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.tenantWalletTransaction.findMany();
  console.log('Transactions:', txs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
