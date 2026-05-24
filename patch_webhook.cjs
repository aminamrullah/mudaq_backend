const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/tenant/webhook.controller.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove the TENANT-TOPUP if block
code = code.replace(/if \(externalId\.startsWith\('TENANT-TOPUP-'\)\) \{\s*await this\.handleTenantTopupPaid\(externalId, body\);\s*\} else /, '');

// Remove the handleTenantTopupPaid method
code = code.replace(/  private async handleTenantTopupPaid[\s\S]*?(?=^\s*$)/m, '');
// If it didn't match the end perfectly, maybe use a more specific regex:
code = code.replace(/  private async handleTenantTopupPaid[\s\S]*?\}\s*\}\s*\n/m, '');

fs.writeFileSync(file, code);
