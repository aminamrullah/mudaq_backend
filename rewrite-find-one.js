const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/modules/student/student.service.ts');
let content = fs.readFileSync(file, 'utf8');

const newFindOne = `
  async findOne(tenantUuid: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenant_uuid: tenantUuid, deleted_at: null },
      include: {
        classroom: true,
        dormitory: true,
        dormitory_room: true,
        wallet: true,
        histories: { orderBy: { created_at: 'desc' } },
        bills: { orderBy: { due_date: 'desc' }, take: 20 },
        attendances: { orderBy: { date: 'desc' }, take: 50 },
        tahfidz_records: { orderBy: { date: 'desc' }, take: 20 },
        violations: { orderBy: { date: 'desc' } },
        health_records: { orderBy: { date: 'desc' } },
        student_permissions: { orderBy: { start_date: 'desc' } },
        student_registrations: {
          include: {
            unit: true,
            classroom: true,
            dormitory: true,
            dormitory_room: true,
            tahfidz_teacher: { include: { user: true } },
            quran_teacher: { include: { user: true } },
            kitab_teacher: { include: { user: true } }
          }
        }
      },
    });
    if (!student) throw new NotFoundException('Santri tidak ditemukan');

    // MENGGABUNGKAN DATA ABSENSI DAN REGISTRASI UNIT
    let linkedAttendances = student.attendances.map(a => ({ ...a, unit_name: 'Pusat/Yayasan' }));
    let linkedUnits = student.student_registrations.map(reg => reg.unit).filter(Boolean);

    return {
      ...student,
      attendances: linkedAttendances,
      linked_units: linkedUnits,
    };
  }
`;

content = content.replace(/async findOne\(tenantUuid: string, id: string\) \{[\s\S]*?return student;\s+\}/, newFindOne.trim());
fs.writeFileSync(file, content);
console.log('Updated findOne');
