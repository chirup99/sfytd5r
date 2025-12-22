const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Allow custom zip filename from command line, default to 'dist.zip'
const zipFileName = process.argv[2] || 'dist.zip';
const distFolder = './dist';

if (!fs.existsSync(distFolder)) {
  console.error('Error: dist folder not found. Please run "npm run build" first.');
  process.exit(1);
}

try {
  console.log('Creating deployment zip file...');
  execSync(`zip -r ${zipFileName} ${distFolder}`, { stdio: 'inherit' });
  console.log(`✓ Created ${zipFileName} successfully!`);
} catch (error) {
  console.error('Error creating zip file. Make sure zip command is available.');
  process.exit(1);
}
