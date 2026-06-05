const fs = require('fs');
const path = require('path');
const srcDir = path.join(process.cwd(), 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(srcDir, function(filePath) {
  if (filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Fix select: { nis: true } -> select: { nisn: true, registrations: { select: { nis: true } } }
    content = content.replace(/nis:\s*true/g, 'registrations: { select: { nis: true, status: true, classroom: { select: { name: true } }, unit: { select: { name: true } } } }');

    // Fix student.nis -> student.registrations?.[0]?.nis
    content = content.replace(/student\.nis\b/g, 'student.registrations?.[0]?.nis');
    
    // Fix student.status -> student.registrations?.[0]?.status
    content = content.replace(/student\.status\b/g, 'student.registrations?.[0]?.status');
    
    // Fix student.classroom?.name -> student.registrations?.[0]?.classroom?.name
    content = content.replace(/student\.classroom\?\.name/g, 'student.registrations?.[0]?.classroom?.name');

    // Fix student.classroom_id -> student.registrations?.[0]?.classroom_id
    content = content.replace(/student\.classroom_id/g, 'student.registrations?.[0]?.classroom_id');

    // Fix student.dormitory_id -> student.registrations?.[0]?.dormitory_id
    content = content.replace(/student\.dormitory_id/g, 'student.registrations?.[0]?.dormitory_id');
    
    // Fix student.dormitory?.name -> student.registrations?.[0]?.dormitory?.name
    content = content.replace(/student\.dormitory\?\.name/g, 'student.registrations?.[0]?.dormitory?.name');

    // Fix student.dormitory_room?.name -> student.registrations?.[0]?.dormitory_room?.name
    content = content.replace(/student\.dormitory_room\?\.name/g, 'student.registrations?.[0]?.dormitory_room?.name');

    // Fix student.quran_teacher_id
    content = content.replace(/student\.quran_teacher_id/g, 'student.registrations?.[0]?.quran_teacher_id');
    content = content.replace(/student\.kitab_teacher_id/g, 'student.registrations?.[0]?.kitab_teacher_id');

    // Fix where: { classroom_id: ... } -> where: { registrations: { some: { classroom_id: ... } } }
    content = content.replace(/classroom_id:\s*(dto\.classroom_id|classroomId|null)/g, 'registrations: { some: { classroom_id: $1 } }');

    // Fix status: 'AKTIF' in student where
    content = content.replace(/status:\s*('AKTIF'|\{ in: \['AKTIF', 'active'\] \})/g, 'registrations: { some: { status: $1 } }');

    // Fix student: { include: { classroom: true } }
    content = content.replace(/student:\s*\{\s*include:\s*\{\s*classroom:\s*true\s*\}\s*\}/g, 'student: { include: { registrations: { include: { classroom: true } } } }');
    content = content.replace(/student:\s*\{\s*select:\s*\{\s*name:\s*true,\s*registrations:/g, 'student: { select: { name: true, nisn: true, registrations:'); // Fix any duplicate or missed
    
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed:', filePath);
    }
  }
});
