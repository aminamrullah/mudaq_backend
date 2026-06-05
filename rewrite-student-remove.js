const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/modules/student/student.service.ts');
let content = fs.readFileSync(file, 'utf8');

const newMethod = `
  async remove(userOrTenant: any, id: string) {
    const tenantUuid = typeof userOrTenant === 'string' ? userOrTenant : userOrTenant.tenant_uuid;
    const student = await this.findOne(tenantUuid, id);

    return await this.prisma.$transaction(async (tx) => {
      // If user is a unit admin, just detach from that unit
      if (typeof userOrTenant === 'object' && userOrTenant.role === 'admin_unit' && userOrTenant.unit_id) {
        // Delete registration for this unit
        await tx.studentRegistration.deleteMany({
          where: { student_id: id, unit_id: userOrTenant.unit_id }
        });
        
        // As fallback, if student's main record has this unit_id, nullify it (legacy)
        if (student.unit_id === userOrTenant.unit_id) {
          await tx.student.update({
            where: { id },
            data: { unit_id: null, classroom_id: null, status: 'KELUAR' }
          });
        }
        
        return { message: 'Santri berhasil dilepaskan dari unit ini.' };
      }

      const timestamp = Date.now();

      // Soft delete student and free up unique fields
      const deletedStudent = await tx.student.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          nis: student.nis ? \`\${student.nis}_del_\${timestamp}\` : null,
          nisn: student.nisn ? \`\${student.nisn}_del_\${timestamp}\` : null,
          nik: student.nik ? \`\${student.nik}_del_\${timestamp}\` : null,
          parent_phone: student.parent_phone ? \`\${student.parent_phone}_del_\${timestamp}\` : null,
        },
      });

      // Also set wallet as inactive
      await tx.wallet.updateMany({
        where: { student_id: id },
        data: { is_active: false },
      });

      // Handle Walisantri account cleanup
      if (student.parent_phone) {
        const normalizedPhone = normalizePhone(student.parent_phone);`;

content = content.replace(/async remove\(tenantUuid: string, id: string\) \{\s+const student = await this\.findOne\(tenantUuid, id\);\s+return await this\.prisma\.\$transaction\(async \(tx\) => \{\s+const timestamp = Date\.now\(\);\s+\/\/ Soft delete student and free up unique fields\s+const deletedStudent = await tx\.student\.update\(\{\s+where: \{ id \},\s+data: \{\s+deleted_at: new Date\(\),\s+nis: student\.nis \? `\$\{student\.nis\}_del_\$\{timestamp\}` : null,\s+nisn: student\.nisn \? `\$\{student\.nisn\}_del_\$\{timestamp\}` : null,\s+nik: student\.nik \? `\$\{student\.nik\}_del_\$\{timestamp\}` : null,\s+parent_phone: student\.parent_phone \? `\$\{student\.parent_phone\}_del_\$\{timestamp\}` : null,\s+\},\s+\}\);\s+\/\/ Also set wallet as inactive\s+await tx\.wallet\.updateMany\(\{\s+where: \{ student_id: id \},\s+data: \{ is_active: false \},\s+\}\);\s+\/\/ Handle Walisantri account cleanup\s+if \(student\.parent_phone\) \{\s+const normalizedPhone = normalizePhone\(student\.parent_phone\);/, newMethod);

fs.writeFileSync(file, content);
console.log('Updated student remove');
