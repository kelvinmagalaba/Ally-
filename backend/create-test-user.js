const bcrypt = require("bcryptjs");
const db = require('./config/db');

const testUser = {
  email: 'test@example.com',
  phone: '+255712345678',
  password: 'test123',
  role: 'customer'
};

const hashedPassword = bcrypt.hashSync(testUser.password, 10);

db.query(
  'INSERT INTO users (email, phone, password_hash, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
  [testUser.email, testUser.phone, hashedPassword, testUser.role],
  (err, result) => {
    if (err) {
      console.error('Error creating test user:', err);
    } else {
      console.log('Test user created/updated successfully');
    }
    process.exit(0);
  }
);