#!/usr/bin/env node

// Script to test file upload limits in deployment environment

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '../temp');

async function ensureTempDir() {
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create temp directory: ${error.message}`);
  }
}

async function createTestFile(size, filename) {
  console.log(`Creating test file: ${filename} (${size / (1024 * 1024)} MB)`);
  const filePath = path.join(tempDir, filename);
  
  // Create a buffer with the specified size
  const chunkSize = 1024 * 1024; // 1MB chunks
  const fileHandle = await fs.open(filePath, 'w');
  
  try {
    const buffer = Buffer.alloc(chunkSize, 'A');
    
    // Write the buffer in chunks to avoid memory issues
    const fullChunks = Math.floor(size / chunkSize);
    const remainder = size % chunkSize;
    
    for (let i = 0; i < fullChunks; i++) {
      await fileHandle.write(buffer, 0, chunkSize);
      if (i % 10 === 0) {
        console.log(`  Written ${i * chunkSize / (1024 * 1024)} MB...`);
      }
    }
    
    if (remainder > 0) {
      await fileHandle.write(buffer, 0, remainder);
    }
    
    console.log(`  Completed writing ${size / (1024 * 1024)} MB file`);
    return filePath;
  } finally {
    await fileHandle.close();
  }
}

async function testUpload(filePath, fileName) {
  console.log(`Testing upload of ${fileName}...`);
  
  try {
    const fileStats = await fs.stat(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    console.log(`  File size: ${fileSizeMB.toFixed(2)} MB`);
    
    const fileData = await fs.readFile(filePath);
    
    // Create a simple FormData-like object for fetch
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2);
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };
    
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`),
      Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    
    console.log(`  Sending HTTP request with ${payload.length / (1024 * 1024)} MB payload...`);
    
    const startTime = Date.now();
    const response = await fetch('http://localhost:5000/api/chat/upload', {
      method: 'POST',
      headers,
      body: payload,
      timeout: 300000 // 5-minute timeout
    });
    const endTime = Date.now();
    
    console.log(`  Response status: ${response.status}`);
    console.log(`  Response time: ${(endTime - startTime) / 1000} seconds`);
    
    const responseText = await response.text();
    console.log(`  Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
    
    return {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      response: responseText,
      size: fileStats.size,
      time: endTime - startTime
    };
  } catch (error) {
    console.error(`  Upload failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      size: fileStats?.size || 0
    };
  }
}

async function runTests() {
  try {
    await ensureTempDir();
    
    // Test with various file sizes to determine the limit
    const sizes = [
      { name: '10MB_test.bin', size: 10 * 1024 * 1024 },
      { name: '50MB_test.bin', size: 50 * 1024 * 1024 },
      { name: '100MB_test.bin', size: 100 * 1024 * 1024 }
    ];
    
    const results = [];
    
    for (const test of sizes) {
      const filePath = await createTestFile(test.size, test.name);
      const result = await testUpload(filePath, test.name);
      results.push({
        fileName: test.name,
        ...result
      });
    }
    
    console.log('\nTest Results Summary:');
    console.table(results.map(r => ({
      fileName: r.fileName,
      sizeInMB: (r.size / (1024 * 1024)).toFixed(2),
      success: r.success,
      status: r.status,
      timeInSeconds: r.time ? (r.time / 1000).toFixed(2) : 'N/A',
      error: r.error || 'None'
    })));
    
    // Clean up temp files
    for (const test of sizes) {
      try {
        await fs.unlink(path.join(tempDir, test.name));
        console.log(`Removed test file: ${test.name}`);
      } catch (error) {
        console.error(`Failed to remove test file ${test.name}: ${error.message}`);
      }
    }
    
    // Try to find the upload size limit based on results
    const successfulUploads = results.filter(r => r.success);
    const failedUploads = results.filter(r => !r.success);
    
    if (successfulUploads.length === 0) {
      console.log('All uploads failed. There might be an issue with the upload endpoint or configuration.');
    } else if (failedUploads.length === 0) {
      console.log('All uploads succeeded. The limit is higher than the largest tested file size.');
    } else {
      const maxSuccessfulSize = Math.max(...successfulUploads.map(r => r.size));
      const minFailedSize = Math.min(...failedUploads.map(r => r.size));
      
      console.log(`\nEstimated upload size limit is between ${maxSuccessfulSize / (1024 * 1024)} MB and ${minFailedSize / (1024 * 1024)} MB`);
    }
    
  } catch (error) {
    console.error('Test runner error:', error);
  }
}

runTests().catch(console.error);
