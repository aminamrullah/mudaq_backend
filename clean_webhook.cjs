const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/tenant/webhook.controller.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/if \(externalId\.startsWith\('TENANT-TOPUP-'\)\) \{\s*await this\.handleTenantTopupPaid\(externalId, body\);\s*\} else /, '');

const handleMethodMatch = code.match(/  private async handleTenantTopupPaid[\s\S]*?this\.logger\.log\(\`Successfully processed Tenant Topup \$\{externalId\}\`\);\s*\}/);
if (handleMethodMatch) {
  code = code.replace(handleMethodMatch[0], '');
}

fs.writeFileSync(file, code);
