const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/modules/student/student.service.ts');
let content = fs.readFileSync(file, 'utf8');

// Replace status
content = content.replace(
  /parent_email: getValue\(row, \['Email Wali', 'Email', 'parent_email'\]\)\?\.toString\(\),\s*status: 'AKTIF',/,
  "parent_email: getValue(row, ['Email Wali', 'Email', 'parent_email'])?.toString(),\n          status: 'CALON',"
);

// Replace headers
content = content.replace(
  /'No HP Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',/,
  "'No HP Wali', 'Email Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',"
);

// Replace sample data
content = content.replace(
  /"'081234567890", 'SD\/MI', '45', '160',/,
  "\"'081234567890\", 'email@contoh.com', 'SD/MI', '45', '160',"
);

fs.writeFileSync(file, content);
console.log('Updated import Excel in student service');
