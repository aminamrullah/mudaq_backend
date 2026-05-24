const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({ take: 5, orderBy: { created_at: 'desc' } });
  const topups = await prisma.topupLog.findMany({ take: 5, orderBy: { created_at: 'desc' } });
  console.log("TXS:", JSON.stringify(txs, null, 2));
  console.log("TOPUPS:", JSON.stringify(topups, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
