const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'modules', 'walisantri', 'walisantri.service.ts');

let content = fs.readFileSync(filePath, 'utf8');
let original = content;

// Replace line 90-92
content = content.replace(/classroom:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}\s*\},/g, 'registrations: { select: { classroom: { select: { id: true, name: true } }, dormitory: { select: { id: true, name: true } }, dormitory_room: { select: { id: true, name: true } } } },');
content = content.replace(/dormitory:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}\s*\},/g, '');
content = content.replace(/dormitory_room:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}\s*\},/g, '');

// Replace line 241-243
content = content.replace(/classroom:\s*true,/g, 'registrations: { include: { classroom: true, dormitory: true, dormitory_room: true } },');
content = content.replace(/dormitory:\s*true,/g, '');
content = content.replace(/dormitory_room:\s*true,/g, '');

if (content !== original) {
  fs.writeFileSync(filePath, content);
  console.log('Fixed:', filePath);
}
