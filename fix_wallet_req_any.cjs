const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.controller.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/@Req\(\)\s+req,/g, '@Req() req: any,');
code = code.replace(/@Req\(\)\s+req\)/g, '@Req() req: any)');

fs.writeFileSync(file, code);
