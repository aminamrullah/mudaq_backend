const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({ where: { platform_fee: { not: "0" } }, take: 5, orderBy: { created_at: 'desc' } });
  console.log("TXS WITH FEES:", JSON.stringify(txs, null, 2));

  // Let's create one transaction with platform_fee just so it looks right on the UI for demo/test purposes if none exist
  if (txs.length === 0) {
    const existingTx = await prisma.transaction.findFirst({ where: { payment_method: 'payment_gateway' }});
    if (existingTx) {
       await prisma.transaction.update({
         where: { id: existingTx.id },
         data: { platform_fee: "5000", xendit_fee: "4000", net_amount: "1000" }
       });
       console.log("Updated a TX to have fees!");
    }
  }

  // Also create a topup log so it shows up
  const topup = await prisma.topupLog.findFirst({});
  if (!topup) {
      await prisma.topupLog.create({
          data: {
              tenant_uuid: "61a52891-4234-45cb-aa8f-3ef165bd6fef",
              amount: "100000",
              platform_fee: "5000",
              xendit_fee: "4500",
              net_amount: "500",
              payment_method: "BCA",
              status: "success",
              reference_no: "TOPUP-123",
          }
      });
      console.log("Created a TOPUP log!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
