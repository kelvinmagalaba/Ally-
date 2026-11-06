const db = require('./config/db');

db.query('SELECT id, email, phone, role FROM users LIMIT 1', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Sample user:', rows[0]);
  }
  process.exit(0);
});