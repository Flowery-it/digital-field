const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ code: 401, message: '未提供认证Token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: 'Token已过期' });
    }
    return res.status(401).json({ code: 401, message: '认证失败' });
  }
};

const adminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ code: 401, message: '未提供认证Token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    // 简单判断，实际项目中应在用户表中添加管理员字段
    if (decoded.username !== 'admin') {
      return res.status(403).json({ code: 403, message: '无管理员权限' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: 'Token已过期' });
    }
    return res.status(401).json({ code: 401, message: '认证失败' });
  }
};

module.exports = { auth, adminAuth };
