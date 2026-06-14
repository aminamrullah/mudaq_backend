const { execSync } = require('child_process');
try {
  execSync('git checkout -- src/modules/koperasi/koperasi.service.ts', { stdio: 'inherit' });
  console.log('Restored');
} catch (e) {
  console.error(e);
}
