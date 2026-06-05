const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, 'src', 'modules', 'student', 'student.service.ts');
let content = fs.readFileSync(servicePath, 'utf-8');

const newRemove = `  async remove(tenantUuid: string, id: string, role?: string, tokenUnitId?: string | null) {
    const student = await this.findOne(tenantUuid, id);
    const unitId = tokenUnitId || this.cls.get('unit_id');

    // ── ADMIN_UNIT: only delete registration for this unit ──
    if (role === 'ADMIN_UNIT' || unitId) {
      const reg = await this.prisma.studentRegistration.findFirst({
        where: { student_id: id, unit_id: unitId }
      });
      if (reg) {
        return this.prisma.studentRegistration.delete({
          where: { id: reg.id },
        });
      }
      return student;
    }

    // ── ADMIN_PESANTREN / SUPER_ADMIN: full soft delete ──
    return await this.prisma.$transaction(async (tx) => {
      const timestamp = Date.now();

      // Soft delete student and free up unique fields
      const deletedStudent = await tx.student.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          nik: student.nik ? \`\${student.nik}_del_\${timestamp}\` : null,
          parent_phone: student.parent_phone ? \`\${student.parent_phone}_del_\${timestamp}\` : null,
        },
      });

      // Free up NIS in registrations
      await tx.studentRegistration.updateMany({
        where: { student_id: id },
        data: { deleted_at: new Date() } // Soft delete or just let it be, but NIS needs to be freed
      });
      // Find all registrations to free up NIS
      const regs = await tx.studentRegistration.findMany({ where: { student_id: id } });
      for (const reg of regs) {
        if (reg.nis) {
           await tx.studentRegistration.update({
              where: { id: reg.id },
              data: { nis: \`\${reg.nis}_del_\${timestamp}\` }
           });
        }
      }

      // Also set wallet as inactive
      await tx.wallet.updateMany({
        where: { student_id: id },
        data: { is_active: false },
      });

      // Handle Walisantri account cleanup
      if (student.parent_phone) {
        const normalizedPhone = normalizePhone(student.parent_phone);

        // Check if any other ACTIVE student uses this phone
        const otherStudentsCount = await tx.student.count({
          where: {
            tenant_uuid: tenantUuid,
            parent_phone: normalizedPhone,
            id: { not: id },
            deleted_at: null,
          },
        });

        if (otherStudentsCount === 0) {
          // No other active students use this phone, soft-delete the walisantri user and free up phone/email
          const walisantri = await tx.user.findFirst({
            where: {
              phone: normalizedPhone,
              role: 'WALI_SANTRI',
              tenant_uuid: tenantUuid,
              deleted_at: null
            }
          });

          if (walisantri) {
            await tx.user.update({
              where: { id: walisantri.id },
              data: {
                deleted_at: new Date(),
                is_active: false,
                phone: walisantri.phone ? \`\${walisantri.phone}_del_\${timestamp}\` : null,
                email: walisantri.email ? \`\${walisantri.email}_del_\${timestamp}\` : null,
              },
            });
          }
        }
      }

      return deletedStudent;
    });
  }`;

const startRemove = content.indexOf('  async remove(tenantUuid: string, id: string, role?: string, tokenUnitId?: string | null) {');
const endRemove = content.indexOf('  async importExcel(tenantUuid: string, file: Express.Multer.File) {');
if (startRemove !== -1 && endRemove !== -1) {
    content = content.substring(0, startRemove) + newRemove + '\n\n' + content.substring(endRemove);
}

// Fix generateNextNis
const newGenerateNis = `  private async generateNextNis(tx: Prisma.TransactionClient, tenantUuid: string): Promise<string> {
    const unitId = this.cls.get('unit_id');
    const year = new Date().getFullYear();
    const prefix = \`\${year}\`;

    const lastRegistration = await tx.studentRegistration.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        nis: { startsWith: prefix },
        ...(unitId ? { unit_id: unitId } : {}),
      },
      orderBy: { nis: 'desc' },
    });

    if (!lastRegistration || !lastRegistration.nis) {
      return \`\${prefix}0001\`;
    }

    const lastSequence = parseInt(lastRegistration.nis.slice(prefix.length)) || 0;
    const nextSequence = lastSequence + 1;
    return \`\${prefix}\${nextSequence.toString().padStart(4, '0')}\`;
  }`;

const startGen = content.indexOf('  private async generateNextNis(');
const endGen = content.indexOf('  private async ensureWalisantriAccount(');
if (startGen !== -1 && endGen !== -1) {
    content = content.substring(0, startGen) + newGenerateNis + '\n\n' + content.substring(endGen);
}

fs.writeFileSync(servicePath, content);
console.log('Update successful');
