const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/prisma/schema.prisma';
let code = fs.readFileSync(file, 'utf8');

// Replace TenantTopupLog
code = code.replace(/model TenantTopupLog \{[\s\S]*?@@map\("tenant_topup_logs"\)\n\}/, `model TenantTopupRequest {
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
}

model TenantWalletTransaction {
  id           String   @id @default(uuid()) @db.Uuid
  tenant_uuid  String   @db.Uuid
  type         String   // deposit, withdrawal, deduct, etc
  amount       Decimal  @db.Decimal(12, 2)
  balance_after Decimal  @db.Decimal(12, 2)
  description  String?
  reference_id String?
  created_at   DateTime @default(now())

  tenant_wallet TenantWallet @relation(fields: [tenant_uuid], references: [tenant_uuid], onDelete: Cascade)

  @@index([tenant_uuid])
  @@map("tenant_wallet_transactions")
}`);

// Replace in Pesantren model
code = code.replace(/tenant_topup_logs\s+TenantTopupLog\[\]/, 'tenant_topup_requests TenantTopupRequest[]');

// Find TenantWallet model and add transactions
const tenantWalletRegex = /model TenantWallet \{[\s\S]*?@@map\("tenant_wallets"\)\n\}/;
const tenantWalletMatch = code.match(tenantWalletRegex);
if (tenantWalletMatch) {
  let tw = tenantWalletMatch[0];
  tw = tw.replace(/pesantren\s+Pesantren\s+@relation/, 'transactions TenantWalletTransaction[]\n\n  pesantren Pesantren @relation');
  code = code.replace(tenantWalletRegex, tw);
}

fs.writeFileSync(file, code);
