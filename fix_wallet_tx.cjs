const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.service.ts';
let code = fs.readFileSync(file, 'utf8');

// Topup approval deposit
code = code.replace(/          tenant_uuid: request\.tenant_uuid,\s*type: 'deposit',\s*amount: request\.amount,\s*balance_after: balanceAfter,/, `          tenant_uuid: request.tenant_uuid,
          type: 'deposit',
          amount: request.amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,`);

// Withdrawal approval
code = code.replace(/          tenant_uuid: request\.tenant_uuid,\s*type: 'withdrawal',\s*amount: request\.amount,\s*balance_after: balanceAfter,/, `          tenant_uuid: request.tenant_uuid,
          type: 'withdrawal',
          amount: request.amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,`);

fs.writeFileSync(file, code);
