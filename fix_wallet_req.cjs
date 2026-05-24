const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.controller.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('Req,')) {
  code = code.replace(/import \{([\s\S]*?)\} from '@nestjs\/common';/, (match, p1) => {
    return `import {${p1}  Req,\n} from '@nestjs/common';`;
  });
}

fs.writeFileSync(file, code);
