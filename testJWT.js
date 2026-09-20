const jwt = require('jsonwebtoken');

const payload = {
  id: 1,
  email: 'test@gmail.com',
  name: 'Test',
  role: 'restaurant'
};

const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret');
const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

console.log("Decoded Token:", decoded);
console.log("Role matched:", decoded.role === 'restaurant');
