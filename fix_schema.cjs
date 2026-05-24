const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/prisma/schema.prisma';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('min_tenant_wallet_balance')) {
  code = code.replace(/  addon_landing_page    Boolean  @default\(false\)/, `  addon_landing_page    Boolean  @default(false)
  min_tenant_wallet_balance Decimal @default(0) @db.Decimal(12, 2)
  storage_limit           BigInt    @default(1073741824) // 1GB
  storage_used            BigInt    @default(0)`);
}

if (!code.includes('face_descriptor')) {
  code = code.replace(/  rfid_uid       String\?   @unique/, `  rfid_uid       String?   @unique
  face_descriptor Json?`);
}

if (!code.includes('TenantWithdrawalRequest')) {
  // If TenantTopupLog is still there
  if (code.includes('model TenantTopupLog {')) {
    code = code.replace(/model TenantTopupLog \{/, `model TenantWithdrawalRequest {
  id           String   @id @default(uuid()) @db.Uuid
  tenant_uuid  String   @db.Uuid
  amount       Decimal  @db.Decimal(12, 2)
  bank_name    String
  account_no   String
  account_name String
  status       String   @default("pending") // pending, approved, rejected
  notes        String?
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  pesantren Pesantren @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_withdrawal_requests")
}

model TenantTopupRequest {`);
    
    code = code.replace(/model TenantTopupRequest \{[\s\S]*?@@map\("tenant_topup_logs"\)\n\}/, `model TenantTopupRequest {
  id           String    @id @default(uuid()) @db.Uuid
  tenant_uuid  String    @db.Uuid
  amount       Decimal   @db.Decimal(12, 2)
  status       String    @default("pending") // pending, approved, rejected
  notes        String?
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt

  pesantren Pesantren @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_topup_requests")
}`);
  } else {
    // If TenantTopupLog was already replaced by something else, just append it
    code += `\nmodel TenantWithdrawalRequest {
  id           String   @id @default(uuid()) @db.Uuid
  tenant_uuid  String   @db.Uuid
  amount       Decimal  @db.Decimal(12, 2)
  bank_name    String
  account_no   String
  account_name String
  status       String   @default("pending") // pending, approved, rejected
  notes        String?
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  pesantren Pesantren @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_withdrawal_requests")
}\n`;

  // Also ensure TenantTopupRequest exists
  if (!code.includes('TenantTopupRequest')) {
    code += `\nmodel TenantTopupRequest {
  id           String    @id @default(uuid()) @db.Uuid
  tenant_uuid  String    @db.Uuid
  amount       Decimal   @db.Decimal(12, 2)
  status       String    @default("pending") // pending, approved, rejected
  notes        String?
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt

  pesantren Pesantren @relation(fields: [tenant_uuid], references: [id], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_topup_requests")
}\n`;
  }

  }
}

if (!code.includes('TenantWalletTransaction')) {
  code += `\nmodel TenantWalletTransaction {
  id           String   @id @default(uuid()) @db.Uuid
  tenant_uuid  String   @db.Uuid
  type         String   // deposit, withdrawal, deduct, etc
  amount       Decimal  @db.Decimal(12, 2)
  balance_after Decimal  @db.Decimal(12, 2)
  description  String?
  reference    String?
  created_at   DateTime @default(now())

  tenant_wallet TenantWallet @relation(fields: [tenant_uuid], references: [tenant_uuid], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_wallet_transactions")
}\n`;
}

// Ensure relations on Pesantren
if (!code.includes('tenant_topup_requests TenantTopupRequest[]')) {
  code = code.replace(/  topup_logs\s+TopupLog\[\]/, `  tenant_topup_requests TenantTopupRequest[]
  tenant_withdrawal_requests TenantWithdrawalRequest[]
  topup_logs         TopupLog[]`);
}

// Add transactions to TenantWallet
const tenantWalletMatch = code.match(/model TenantWallet \{[\s\S]*?@@map\("tenant_wallets"\)\n\}/);
if (tenantWalletMatch && !tenantWalletMatch[0].includes('transactions')) {
  let tw = tenantWalletMatch[0];
  tw = tw.replace(/pesantren\s+Pesantren\s+@relation/, 'transactions TenantWalletTransaction[]\n\n  pesantren Pesantren @relation');
  code = code.replace(tenantWalletMatch[0], tw);
}

fs.writeFileSync(file, code);
