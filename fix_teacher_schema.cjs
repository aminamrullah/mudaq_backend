const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/prisma/schema.prisma';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('face_descriptor')) {
  code = code.replace(/  can_manage_kitab   Boolean @default\(false\)/, `  can_manage_kitab   Boolean @default(false)
  face_descriptor    Json?`);
}

if (!code.includes('balance_before Decimal')) {
  code = code.replace(/  balance_after Decimal  @db\.Decimal\(12, 2\)/, `  balance_before Decimal  @db.Decimal(12, 2)
  balance_after Decimal  @db.Decimal(12, 2)`);
}

fs.writeFileSync(file, code);
