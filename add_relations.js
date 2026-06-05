const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'prisma', 'schema.prisma');
let content = fs.readFileSync(file, 'utf8');

const additions = [
  { model: 'model Pesantren {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model Student {', rel: '  registrations StudentRegistration[]' },
  { model: 'model EducationUnit {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model Classroom {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model AcademicYear {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model PpdbWave {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model Dormitory {', rel: '  student_registrations StudentRegistration[]' },
  { model: 'model DormitoryRoom {', rel: '  student_registrations StudentRegistration[]' }
];

for (const { model, rel } of additions) {
  if (content.includes(model) && !content.includes(rel)) {
    content = content.replace(model, model + '\n' + rel);
  }
}

fs.writeFileSync(file, content);
console.log('Added opposite relations manually');
