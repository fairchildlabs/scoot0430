import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { constants } from 'buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== File Upload Limits Check ===');

// Check temp directory
const tempDir = os.tmpdir();
console.log('\n== Temp Directory ==');
console.log(`Path: ${tempDir}`);
try {
  const stats = fs.statSync(tempDir);
  console.log(`Exists: Yes`);
  console.log(`Permissions: ${stats.mode.toString(8).slice(-3)}`);
  console.log(`Owner: ${stats.uid}:${stats.gid}`);
} catch (error) {
  console.log(`Error accessing temp directory: ${error.message}`);
}

// Check uploads directory
const uploadsDir = path.join(process.cwd(), 'uploads');
console.log('\n== Uploads Directory ==');
console.log(`Path: ${uploadsDir}`);
try {
  let stats;
  try {
    stats = fs.statSync(uploadsDir);
    console.log(`Exists: Yes`);
  } catch (e) {
    console.log(`Exists: No`);
    console.log('Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    stats = fs.statSync(uploadsDir);
    console.log('Directory created');
  }
  console.log(`Permissions: ${stats.mode.toString(8).slice(-3)}`);
  console.log(`Owner: ${stats.uid}:${stats.gid}`);
} catch (error) {
  console.log(`Error with uploads directory: ${error.message}`);
}

// Check disk space
console.log('\n== Disk Space ==');
try {
  exec('df -h /', (error, stdout) => {
    if (error) {
      console.log(`Error checking disk space: ${error.message}`);
      return;
    }
    console.log(stdout);
  });
} catch (error) {
  console.log(`Error running disk space check: ${error.message}`);
}

// Check memory limits
const totalMem = Math.round(os.totalmem() / (1024 * 1024));
const freeMem = Math.round(os.freemem() / (1024 * 1024));
console.log('\n== Memory ==');
console.log(`Total: ${totalMem} MB`);
console.log(`Free: ${freeMem} MB`);

// Check Node.js limits
console.log('\n== Node.js Settings ==');
console.log(`Max memory allocation: ${process.env.NODE_OPTIONS || 'Default'}`);
console.log(`Buffer size limit: ${constants.MAX_LENGTH / (1024 * 1024)} MB`);

// Check file system write test
console.log('\n== File System Write Test ==');
const testFile = path.join(uploadsDir, 'test_write.tmp');
try {
  const testData = Buffer.alloc(1024 * 1024); // 1MB test file
  fs.writeFileSync(testFile, testData);
  console.log(`Successfully wrote 1MB test file`);
  fs.unlinkSync(testFile);
  console.log(`Successfully removed test file`);
} catch (error) {
  console.log(`Error during write test: ${error.message}`);
}

console.log('\n== Complete ==');
