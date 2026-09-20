const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const jwtSecret = process.env.JWT_SECRET || 'resqfood_jwt_secret_key_default_2026';
    const decoded = jwt.verify(token, jwtSecret);
    // Reject legacy tokens that don't have a role assigned
    if (!decoded.role) {
      return res.status(401).json({ success: false, message: 'Session expired or legacy token. Please log in again.' });
    }
    req.user = decoded; // { id, email, role: 'restaurant' | 'organization' | 'administrator', name }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ success: false, message: `Access restricted to ${role}s only.` });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
