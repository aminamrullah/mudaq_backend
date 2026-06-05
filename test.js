const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const dorms = await prisma.dormitory.findMany({
    include: {
      rooms: {
        include: {
          students: true
        }
      },
      students: true
    }
  });
  console.log(JSON.stringify(dorms, null, 2));
}
main();
