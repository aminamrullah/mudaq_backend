const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/reference_id:/g, 'reference:');

fs.writeFileSync(file, code);
