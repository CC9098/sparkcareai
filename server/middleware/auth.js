const jwt = require('jsonwebtoken');
const Staff = require('../models/Staff');
const logger = require('../config/logger');

/**
 * Middleware to authenticate requests using JWT tokens
 * Supports both Authorization header and cookies
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header or cookies
    let token = null;
    
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Fallback to cookie if no Authorization header
    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'Access token is required'
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database with fresh data
    const user = await Staff.findById(decoded.userId)
      .select('-password -pin -passwordResetToken')
      .populate('facility', 'name type status')
      .populate('assignedZones', 'name description');
    
    if (!user) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'User not found'
      });
    }
    
    // Check if user account is active
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account Disabled',
        message: 'Your account has been disabled. Please contact an administrator.'
      });
    }
    
    // Check if account is locked
    if (user.isAccountLocked) {
      return res.status(401).json({
        error: 'Account Locked',
        message: 'Your account has been temporarily locked due to multiple failed login attempts.'
      });
    }
    
    // Check if JWT was issued before password change
    const passwordChangedAt = user.passwordChangedAt || user.createdAt;
    if (decoded.iat < Math.floor(passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({
        error: 'Token Invalid',
        message: 'Please log in again after password change'
      });
    }
    
    // Attach user to request object
    req.user = user;
    req.userId = user._id;
    req.facilityId = user.facility._id;
    
    // Log successful authentication
    logger.info('User authenticated successfully', {
      userId: user._id,
      email: user.email,
      role: user.role,
      facility: user.facility.name,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'The provided token is invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token Expired',
        message: 'Your session has expired. Please log in again.'
      });
    }
    
    logger.error('Authentication error:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    
    return res.status(500).json({
      error: 'Authentication Error',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * Middleware to check if user has required access level
 * @param {string|Array} requiredLevel - Required access level(s)
 */
const requireAccessLevel = (requiredLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'Please authenticate first'
      });
    }
    
    const userLevel = req.user.accessLevel;
    const requiredLevels = Array.isArray(requiredLevel) ? requiredLevel : [requiredLevel];
    
    if (!requiredLevels.includes(userLevel)) {
      logger.warn('Access denied - insufficient permissions', {
        userId: req.user._id,
        userLevel: userLevel,
        requiredLevels: requiredLevels,
        endpoint: req.originalUrl,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'Insufficient Permissions',
        message: `This action requires ${requiredLevels.join(' or ')} access level`
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user has specific permission
 * @param {string} permission - Required permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'Please authenticate first'
      });
    }
    
    if (!req.user.hasPermission(permission)) {
      logger.warn('Access denied - missing permission', {
        userId: req.user._id,
        permission: permission,
        userLevel: req.user.accessLevel,
        endpoint: req.originalUrl,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'Permission Denied',
        message: `You don't have permission to ${permission}`
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user can access specific resident data
 * Checks if user is assigned to the resident or has admin access
 */
const requireResidentAccess = async (req, res, next) => {
  try {
    const residentId = req.params.residentId || req.params.id || req.body.residentId;
    
    if (!residentId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Resident ID is required'
      });
    }
    
    // Admin users have access to all residents
    if (req.user.accessLevel === 'Admin') {
      return next();
    }
    
    // Check if user is assigned to this resident
    const hasAccess = req.user.assignedResidents.includes(residentId) ||
                     req.user.accessLevel === 'Senior'; // Senior carers can access all in their facility
    
    if (!hasAccess) {
      logger.warn('Access denied - resident access restricted', {
        userId: req.user._id,
        residentId: residentId,
        userLevel: req.user.accessLevel,
        endpoint: req.originalUrl
      });
      
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You do not have access to this resident\'s data'
      });
    }
    
    next();
    
  } catch (error) {
    logger.error('Error checking resident access:', error);
    return res.status(500).json({
      error: 'Access Check Error',
      message: 'An error occurred while checking access permissions'
    });
  }
};

/**
 * Middleware to validate device access for mobile app
 * Checks if the device is authorized for the user
 */
const validateDeviceAccess = async (req, res, next) => {
  try {
    // Skip device validation for web interface
    if (!req.headers['x-device-id']) {
      return next();
    }
    
    const deviceId = req.headers['x-device-id'];
    const user = req.user;
    
    // Check if device is in user's authorized devices list
    const authorizedDevice = user.authorizedDevices.find(
      device => device.deviceId === deviceId && device.isActive
    );
    
    if (!authorizedDevice) {
      logger.warn('Unauthorized device access attempt', {
        userId: user._id,
        deviceId: deviceId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(403).json({
        error: 'Device Not Authorized',
        message: 'This device is not authorized for your account. Please contact an administrator.'
      });
    }
    
    // Update device last used timestamp
    await Staff.updateOne(
      { 
        _id: user._id, 
        'authorizedDevices.deviceId': deviceId 
      },
      { 
        $set: { 
          'authorizedDevices.$.lastUsed': new Date(),
          'authorizedDevices.$.location': req.headers['x-location'] || 'Unknown'
        } 
      }
    );
    
    next();
    
  } catch (error) {
    logger.error('Device validation error:', error);
    return res.status(500).json({
      error: 'Device Validation Error',
      message: 'An error occurred while validating device access'
    });
  }
};

/**
 * Middleware to check if user can perform actions during their shift
 * Validates shift times and assignments
 */
const requireActiveShift = async (req, res, next) => {
  try {
    // Skip shift validation for admin users
    if (req.user.accessLevel === 'Admin') {
      return next();
    }
    
    // TODO: Implement shift validation logic
    // This would check against the scheduling system to ensure
    // the user is currently on duty
    
    // For now, we'll allow all authenticated users
    next();
    
  } catch (error) {
    logger.error('Shift validation error:', error);
    return res.status(500).json({
      error: 'Shift Validation Error',
      message: 'An error occurred while validating shift status'
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user data to request if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await Staff.findById(decoded.userId)
        .select('-password -pin -passwordResetToken')
        .populate('facility', 'name type status');
      
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
        req.facilityId = user.facility._id;
      }
    }
    
    next();
    
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

/**
 * Rate limiting middleware for authentication endpoints
 */
const authRateLimit = (req, res, next) => {
  // This would typically use express-rate-limit or similar
  // For now, we'll use the global rate limiter from the main app
  next();
};

module.exports = {
  authenticateToken,
  requireAccessLevel,
  requirePermission,
  requireResidentAccess,
  validateDeviceAccess,
  requireActiveShift,
  optionalAuth,
  authRateLimit
};