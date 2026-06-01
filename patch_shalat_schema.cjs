const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let content = fs.readFileSync(schemaPath, 'utf8');

// 1. Add to Pesantren
content = content.replace(
  'attendances        Attendance[]',
  'attendances        Attendance[]\n  shalat_attendances ShalatAttendance[]'
);

// 2. Add to Student
content = content.replace(
  'attendances      Attendance[]',
  'attendances      Attendance[]\n  shalat_attendances ShalatAttendance[]'
);

// 3. Add model at the end
const shalatModel = `

model ShalatAttendance {
  id          String   @id @default(uuid()) @db.Uuid
  tenant_uuid String   @db.Uuid
  student_id  String   @db.Uuid
  shalat_name String   // subuh, dzuhur, ashar, maghrib, isya, dhuha, tahajjud
  date        DateTime @db.Date
  status      String   // jamaah, munfarid, izin, sakit, alpha, haid
  notes       String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  pesantren Pesantren  @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)
  student   Student    @relation(fields: [student_id], references: [id], onDelete: Cascade)

  @@unique([student_id, shalat_name, date])
  @@index([tenant_uuid])
  @@index([student_id])
  @@index([date])
  @@map("shalat_attendances")
}
`;

content += shalatModel;

fs.writeFileSync(schemaPath, content, 'utf8');
console.log('Schema updated successfully');
