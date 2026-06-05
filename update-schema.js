const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf-8');

// 1. Rename existing relationships in Student model
schema = schema.replace(
`  unit_id         String?        @db.Uuid
  unit            EducationUnit? @relation(fields: [unit_id], references: [id])
  academic_year   AcademicYear?  @relation(fields: [academic_year_id], references: [id])
  classroom       Classroom?     @relation(fields: [classroom_id], references: [id])
  dormitory       Dormitory?     @relation(fields: [dormitory_id], references: [id])
  dormitory_room  DormitoryRoom? @relation(fields: [dormitory_room_id], references: [id])
  tahfidz_teacher Teacher?       @relation("TahfidzStudents", fields: [tahfidz_teacher_id], references: [id])
  quran_teacher   Teacher?       @relation("QuranStudents", fields: [quran_teacher_id], references: [id])
  kitab_teacher   Teacher?       @relation("KitabStudents", fields: [kitab_teacher_id], references: [id])
  ppdb_wave       PpdbWave?      @relation(fields: [ppdb_wave_id], references: [id])`,

`  dormitory       Dormitory?     @relation(fields: [dormitory_id], references: [id])
  dormitory_room  DormitoryRoom? @relation(fields: [dormitory_room_id], references: [id])
  registrations   StudentRegistration[]`
);

// 2. Remove the unit-specific fields from Student
schema = schema.replace(
`  academic_year_id   String? @db.Uuid
  classroom_id       String? @db.Uuid
  dormitory_id       String? @db.Uuid
  dormitory_room_id  String? @db.Uuid
  tahfidz_teacher_id String? @db.Uuid
  quran_teacher_id   String? @db.Uuid
  kitab_teacher_id   String? @db.Uuid
  ppdb_wave_id       String? @db.Uuid

  status          String    @default("CALON") // CALON, AKTIF, ALUMNI, BOYONG, KELUAR
  entry_year      Int?
  graduation_date DateTime?`,

`  dormitory_id       String? @db.Uuid
  dormitory_room_id  String? @db.Uuid`
);

schema = schema.replace(
`  @@unique([tenant_uuid, nis])`,
``
);

schema = schema.replace(
`  nis         String?`,
``
);

// 3. Add StudentRegistration model right after Student model
const registrationModel = `

model StudentRegistration {
  id                 String    @id @default(uuid()) @db.Uuid
  tenant_uuid        String    @db.Uuid
  student_id         String    @db.Uuid
  unit_id            String?   @db.Uuid

  nis                String?
  status             String    @default("CALON") // CALON, AKTIF, ALUMNI, BOYONG, KELUAR
  classroom_id       String?   @db.Uuid
  academic_year_id   String?   @db.Uuid
  entry_year         Int?
  graduation_date    DateTime?
  
  tahfidz_teacher_id String? @db.Uuid
  quran_teacher_id   String? @db.Uuid
  kitab_teacher_id   String? @db.Uuid
  ppdb_wave_id       String? @db.Uuid

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
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

  @@unique([tenant_uuid, nis])
  @@index([tenant_uuid])
  @@index([student_id])
  @@map("student_registrations")
}
`;
schema = schema.replace(`  @@map("students")\n}`, `  @@map("students")\n}${registrationModel}`);

// 4. Modify relations in other models
schema = schema.replace(
`  students                   Student[]`,
`  students                   StudentRegistration[]`
);
schema = schema.replace(
`  students   Student[]`,
`  students   StudentRegistration[]`
);
schema = schema.replace(
`  students     Student[]`,
`  students     StudentRegistration[]`
);
schema = schema.replace(
`  students          Student[]`,
`  students          StudentRegistration[]`
);
schema = schema.replace(
`  tahfidz_students          Student[]           @relation("TahfidzStudents")`,
`  tahfidz_students          StudentRegistration[]           @relation("TahfidzStudentsRegistration")`
);
schema = schema.replace(
`  quran_students            Student[]           @relation("QuranStudents")`,
`  quran_students            StudentRegistration[]           @relation("QuranStudentsRegistration")`
);
schema = schema.replace(
`  kitab_students            Student[]           @relation("KitabStudents")`,
`  kitab_students            StudentRegistration[]           @relation("KitabStudentsRegistration")`
);
schema = schema.replace(
`  students  Student[]`,
`  students  StudentRegistration[]`
);
// In case there is another `students  Student[]`
schema = schema.replace(
`  students  Student[]`,
`  students  StudentRegistration[]`
);


fs.writeFileSync(schemaPath, schema);
console.log('schema.prisma updated successfully.');
