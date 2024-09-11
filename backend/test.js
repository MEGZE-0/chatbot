const crypto = require('crypto');
const fs = require('fs');

// Function to generate a random token
function generateVerifyToken(length = 128) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate token
const token = generateVerifyToken();

// Save token to .env file
fs.appendFile('.env', `VERIFY_TOKEN=${token}\n`, (err) => {
  if (err) {
    console.error('Error writing to .env file', err);
  } else {
    console.log('VERIFY_TOKEN saved to .env file');
  }
});

// Log token to console (optional)
console.log('Generated VERIFY_TOKEN:', token);
