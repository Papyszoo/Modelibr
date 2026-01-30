// Quick script to verify step definitions are loadable
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Checking if sounds.steps.ts can be imported...');

try {
    // Try to import the steps file (this will show any import errors)
    const stepsModule = await import('./steps/sounds.steps.ts');
    console.log('✅ sounds.steps.ts imported successfully!');
    console.log('   Module exports:', Object.keys(stepsModule));
} catch (err) {
    console.log('❌ Error importing sounds.steps.ts:');
    console.log('   ', err.message);
    process.exit(1);
}

console.log('\n✅ All imports successful!');
