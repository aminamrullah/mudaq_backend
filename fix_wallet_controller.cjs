const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.controller.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('Req,')) {
  code = code.replace(/import \{ Controller, Get, Post, Body, Param, UseGuards, Query \} from '@nestjs\/common';/, "import { Controller, Get, Post, Body, Param, UseGuards, Query, Req } from '@nestjs/common';");
}
code = code.replace(/@Roles\(Role\.ADMIN\)/g, '@Roles(Role.ADMIN_PESANTREN)');

fs.writeFileSync(file, code);
