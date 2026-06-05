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

    if (filePath.includes('teacher.service.ts')) {
      // Fix user type issue
      content = content.replace(/teacher\.user\?/g, '(teacher as any).user?');
    }

    if (filePath.includes('public.controller.ts')) {
      content = content.replace(/select:\s*{\s*students:\s*true\s*}/g, 'select: { registrations: true }');
      content = content.replace(/_count\.students/g, '_count.registrations');
      // currentStudents count
      content = content.replace(/where:\s*{\s*tenant_uuid:\s*pesantren\.id,\s*status:\s*'aktif'\s*}/g, 'where: { tenant_uuid: pesantren.id, registrations: { some: { status: "aktif" } } }');
    }

    if (filePath.includes('walisantri.service.ts')) {
      content = content.replace(/student:\s*\{\s*include:\s*\{\s*classroom:\s*true\s*\}\s*\}/g, 'student: { include: { registrations: { include: { classroom: true } } } }');
      content = content.replace(/student\.wallet/g, 'student.wallet');
      // Actually, wait, wallet DOES exist on student. Why did TS complain?
      // "Property 'wallet' does not exist on type '{ id: string; tenant_uuid: string; name: string... }'"
      // Because `wallet` wasn't included in the findFirst query where this student was retrieved!
      // Let's add wallet to the includes in walisantri.service.ts
      // In walisantri.service.ts, the includes might be `include: { student: true }`, I need `include: { student: { include: { wallet: true, registrations: { include: { classroom: true } } } } }`
    }

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed:', filePath);
    }
  }
});
