const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/modules/teacher/teacher.service.ts');
let content = fs.readFileSync(file, 'utf8');

const newMethod = `
  async remove(userOrTenant: any, id: string) {
    const tenantUuid = typeof userOrTenant === 'string' ? userOrTenant : userOrTenant.tenant_uuid;
    await this.findOne(tenantUuid, id);

    if (typeof userOrTenant === 'object' && userOrTenant.role === 'admin_unit' && userOrTenant.unit_id) {
      await this.prisma.teacherEducationUnit.deleteMany({
        where: { teacher_id: id, unit_id: userOrTenant.unit_id }
      });
      return { message: 'Guru berhasil dilepaskan dari unit ini.' };
    }

    return await this.prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({
        where: { id },
        include: { user: true }
      });

      if (!teacher) throw new NotFoundException('Teacher not found');

      const timestamp = Date.now();
      const updatedTeacher = await tx.teacher.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          status: 'inactive',
          nip: teacher.nip ? \`\${teacher.nip}_del_\${timestamp}\` : null,
          nik: teacher.nik ? \`\${teacher.nik}_del_\${timestamp}\` : null,
          user_id: null
        }
      });

      if (teacher.user_id) {
        await tx.user.update({
          where: { id: teacher.user_id },
          data: {
            deleted_at: new Date(),
            phone: teacher.user.phone ? \`\${teacher.user.phone}_del_\${timestamp}\` : null,
            email: teacher.user.email ? \`\${teacher.user.email}_del_\${timestamp}\` : null
          }
        });
      }

      return updatedTeacher;
    });
  }
`;

content = content.replace(/async remove\(tenantUuid: string, id: string\) \{\s+await this\.findOne\(tenantUuid, id\);\s+return await this\.prisma\.\$transaction\(async \(tx\) => \{\s+const teacher = await tx\.teacher\.findUnique\(\{\s+where: \{ id \},\s+include: \{ user: true \}\s+\}\);\s+if \(!teacher\) throw new NotFoundException\('Teacher not found'\);\s+const timestamp = Date\.now\(\);\s+const updatedTeacher = await tx\.teacher\.update\(\{\s+where: \{ id \},\s+data: \{\s+deleted_at: new Date\(\),\s+status: 'inactive',\s+nip: teacher\.nip \? `\$\{teacher\.nip\}_del_\$\{timestamp\}` : null,\s+nik: teacher\.nik \? `\$\{teacher\.nik\}_del_\$\{timestamp\}` : null,\s+user_id: null\s+\}\s+\}\);\s+if \(teacher\.user_id\) \{\s+await tx\.user\.update\(\{\s+where: \{ id: teacher\.user_id \},\s+data: \{\s+deleted_at: new Date\(\),\s+phone: teacher\.user\.phone \? `\$\{teacher\.user\.phone\}_del_\$\{timestamp\}` : null,\s+email: teacher\.user\.email \? `\$\{teacher\.user\.email\}_del_\$\{timestamp\}` : null\s+\}\s+\}\);\s+\}\s+return updatedTeacher;\s+\}\);\s+\}/, newMethod);

fs.writeFileSync(file, content);
console.log('Updated teacher remove');
