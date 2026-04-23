/**
 * Run all demos sequentially
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const demos = [
  { name: 'STUN Demo', file: 'stun-demo.js' },
  { name: 'TURN Demo', file: 'turn-demo.js' },
  { name: 'ICE Demo', file: 'ice-demo.js' },
];

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           NodeRTC - Complete Protocol Demo                 ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log();

for (const demo of demos) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Running: ${demo.name}`);
  console.log(`${'─'.repeat(60)}\n`);

  await new Promise((resolve, reject) => {
    const child = spawn('node', [join(__dirname, demo.file)], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${demo.name} exited with code ${code}`));
      }
    });
  });

  // Small delay between demos
  await new Promise(r => setTimeout(r, 500));
}

console.log('\n' + '═'.repeat(60));
console.log('All demos completed successfully!');
console.log('═'.repeat(60));
