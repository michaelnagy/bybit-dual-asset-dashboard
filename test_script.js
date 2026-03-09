const fs = require('fs');

try {
  const code = fs.readFileSync('src/lib/dataService.ts', 'utf8');
  if (code.includes('productName: stake.coin') && code.includes('stakingPeriod: \'Flexible\'') && code.includes('status = \'Completed\'')) {
      console.log('Checks pass.');
  } else {
      console.log('Code check failed.', code.includes('productName: stake.coin'), code.includes('stakingPeriod: \'Flexible\''), code.includes('status = \'Completed\''));
  }
} catch (e) {
  console.log('Error reading file.');
}
