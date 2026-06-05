const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'prisma', 'schema.prisma');
let content = fs.readFileSync(file, 'utf8');

const replacement = `  tahfidz_students          Student[]           @relation("TahfidzStudents")
  quran_students            Student[]           @relation("QuranStudents")
  kitab_students            Student[]           @relation("KitabStudents")
  tahfidz_students_reg      StudentRegistration[] @relation("TahfidzStudentsRegistration")
  quran_students_reg        StudentRegistration[] @relation("QuranStudentsRegistration")
  kitab_students_reg        StudentRegistration[] @relation("KitabStudentsRegistration")`;

// Fix Teacher ambiguous relations
content = content.replace(
  /tahfidz_students\s+Student\[\]\s+@relation\("TahfidzStudents"\)\s+quran_students\s+Student\[\]\s+@relation\("QuranStudents"\)\s+kitab_students\s+Student\[\]\s+@relation\("KitabStudents"\)/,
  replacement
);

// Remove the duplicates that Prisma format might have added
content = content.replace(/\s+StudentRegistration\s+StudentRegistration\[\]/g, '');

fs.writeFileSync(file, content);
console.log('Fixed Teacher relations');
