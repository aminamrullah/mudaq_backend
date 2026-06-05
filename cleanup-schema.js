const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf-8');

schema = schema.replace(
`  PpdbWave            PpdbWave?           @relation(fields: [ppdbWaveId], references: [id])\n  ppdbWaveId          String?             @db.Uuid`,
``
);

schema = schema.replace(
`  students            Student[]\n  StudentRegistration StudentRegistration[]`,
`  registrations       StudentRegistration[]`
);

schema = schema.replace(
`  Dormitory       Dormitory?     @relation(fields: [dormitoryId], references: [id])
  dormitoryId     String?        @db.Uuid
  DormitoryRoom   DormitoryRoom? @relation(fields: [dormitoryRoomId], references: [id])
  dormitoryRoomId String?        @db.Uuid`,
``
);

fs.writeFileSync(schemaPath, schema);
console.log('schema.prisma cleaned up.');
