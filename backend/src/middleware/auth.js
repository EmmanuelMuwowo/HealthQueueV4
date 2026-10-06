const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }
  try {
    req.staff = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.staff.role)) {
    return res.status(403).json({ error: 'Access denied for your role' });
  }
  next();
};

module.exports = { authenticate, authorize };