#!/usr/bin/env node

/**
 * Firebase Service Account Key Renewal Helper
 * 
 * This script helps you renew your Firebase service account key when you get
 * "invalid_grant: Invalid JWT Signature" errors.
 * 
 * Steps to renew:
 * 1. Go to https://console.firebase.google.com/project/health-compass-60829/settings/serviceaccounts/adminsdk
 * 2. Click "Generate new private key"
 * 3. Download the new JSON file
 * 4. Replace the credentials in firebase/config.firebase.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Firebase Service Account Key Renewal Helper');
console.log('=============================================');
console.log('');
console.log('If you\'re getting "invalid_grant: Invalid JWT Signature" errors, follow these steps:');
console.log('');
console.log('1. Go to Firebase Console:');
console.log('   https://console.firebase.google.com/project/health-compass-60829/settings/serviceaccounts/adminsdk');
console.log('');
console.log('2. Click "Generate new private key"');
console.log('');
console.log('3. Download the new JSON file');
console.log('');
console.log('4. Update the credentials in: firebase/config.firebase.js');
console.log('');
console.log('5. Replace the following fields:');
console.log('   - private_key_id');
console.log('   - private_key');
console.log('   - client_email');
console.log('   - client_id');
console.log('');
console.log('6. Restart your application');
console.log('');
console.log('Note: The old key will be automatically revoked after 24 hours.');
console.log('');

// Check if current config exists
const configPath = path.join(__dirname, '..', 'firebase', 'config.firebase.js');
if (fs.existsSync(configPath)) {
  console.log('✅ Current Firebase config found at:', configPath);
} else {
  console.log('❌ Firebase config not found at:', configPath);
}

console.log('');
console.log('For more help, visit:');
console.log('https://firebase.google.com/docs/admin/setup#initialize-sdk');
