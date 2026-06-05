const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'prisma', 'schema.prisma');
let content = fs.readFileSync(file, 'utf8');

// EducationUnit
content = content.replace(
  /students\s+StudentRegistration\[\]/g,
  'students StudentRegistration[]\n  students_legacy Student[]'
);

// Classroom
// find `students StudentRegistration[]` inside Classroom (which was matched by above)
// So no need to do again if it already got replaced for all of them.

// AcademicYear
// (already replaced by above regex since they all have `students StudentRegistration[]`)

// PpdbWave
// PpdbWave currently has `students StudentRegistration[]`
// Actually, I can just run `npx prisma format` again now that Teacher is fixed!
// Wait! The issue with `prisma format` was only that `Teacher` already had `Student Student[]` which conflicted. Let's see if `prisma format` will just fix it.

fs.writeFileSync(file, content);
console.log('Added students_legacy');
