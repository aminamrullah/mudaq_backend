const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.teacherAttendance.findMany().then(r=>console.dir(r,{depth:null})).catch(console.error).finally(()=>prisma.$disconnect());
