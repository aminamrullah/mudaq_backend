const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'prisma', 'schema.prisma');
let content = fs.readFileSync(file, 'utf8');

// Add StudentRegistration model
const studentRegistrationModel = `
model StudentRegistration {
  id          String  @id @default(uuid()) @db.Uuid
  tenant_uuid String  @db.Uuid
  student_id  String  @db.Uuid
  unit_id     String? @db.Uuid

  nis              String?
  status           String    @default("CALON") // CALON, AKTIF, ALUMNI, BOYONG, KELUAR
  classroom_id     String?   @db.Uuid
  academic_year_id String?   @db.Uuid
  entry_year       Int?
  graduation_date  DateTime?

  tahfidz_teacher_id String? @db.Uuid
  quran_teacher_id   String? @db.Uuid
  kitab_teacher_id   String? @db.Uuid
  ppdb_wave_id       String? @db.Uuid

  dormitory_id       String? @db.Uuid
  dormitory_room_id  String? @db.Uuid

  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt
  deleted_at DateTime?

  pesantren       Pesantren      @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)
  student         Student        @relation(fields: [student_id], references: [id], onDelete: Cascade)
  unit            EducationUnit? @relation(fields: [unit_id], references: [id])
  classroom       Classroom?     @relation(fields: [classroom_id], references: [id])
  academic_year   AcademicYear?  @relation(fields: [academic_year_id], references: [id])
  tahfidz_teacher Teacher?       @relation("TahfidzStudentsRegistration", fields: [tahfidz_teacher_id], references: [id])
  quran_teacher   Teacher?       @relation("QuranStudentsRegistration", fields: [quran_teacher_id], references: [id])
  kitab_teacher   Teacher?       @relation("KitabStudentsRegistration", fields: [kitab_teacher_id], references: [id])
  ppdb_wave       PpdbWave?      @relation(fields: [ppdb_wave_id], references: [id])
  dormitory       Dormitory?     @relation(fields: [dormitory_id], references: [id])
  dormitory_room  DormitoryRoom? @relation(fields: [dormitory_room_id], references: [id])

  @@unique([student_id, unit_id])
  @@index([tenant_uuid])
  @@index([student_id])
  @@index([unit_id])
  @@map("student_registrations")
}
`;

// Insert the model before the Teacher model
if (!content.includes('model StudentRegistration {')) {
  content = content.replace(/\/\/ ═══════════════════════════════════════════════════════════════\r?\n\/\/  GURU \(TEACHER\)/, studentRegistrationModel + '\n// ═══════════════════════════════════════════════════════════════\n//  GURU (TEACHER)');
}

fs.writeFileSync(file, content);
console.log('Added StudentRegistration');
