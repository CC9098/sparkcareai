const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const Staff = require('../models/Staff');
const { asyncHandler, UnauthorizedError, ValidationError } = require('../middleware/errorHandler');
const { auditCareEvent } = require('../middleware/auditLogger');
const logger = require('../config/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset attempts per hour
  message: 'Too many password reset attempts, please try again later.',
});

/**
 * Generate JWT tokens
 */
const generateTokens = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    facilityId: user.facilityId
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

  const refreshToken = jwt.sign(
    { id: user._id }, 
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', 
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const { email, password, facilityCode } = req.body;

    // Find user by email
    const user = await Staff.findOne({ 
      email,
      isActive: true 
    }).select('+password');

    if (!user) {
      logger.warn('Failed login attempt:', { email, ip: req.ip });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn('Failed login attempt - wrong password:', { email, userId: user._id, ip: req.ip });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if facility code is required and matches (for multi-facility deployments)
    if (facilityCode && user.facilityCode !== facilityCode) {
      logger.warn('Failed login attempt - wrong facility:', { email, facilityCode, ip: req.ip });
      throw new UnauthorizedError('Invalid facility code');
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Update last login
    user.lastLogin = new Date();
    user.loginHistory.push({
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Keep only last 10 login records
    if (user.loginHistory.length > 10) {
      user.loginHistory = user.loginHistory.slice(-10);
    }
    
    await user.save();

    // Audit log
    auditCareEvent('USER_LOGIN', {
      userId: user._id,
      email: user.email,
      role: user.role,
      facilityId: user.facilityId
    }, user._id);

    logger.info('Successful login:', {
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          facilityId: user.facilityId,
          permissions: user.permissions,
          lastLogin: user.lastLogin
        },
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });
  })
);

/**
 * @route   POST /api/auth/register
 * @desc    Register new staff member (Admin only in production)
 * @access  Public (in development) / Private (in production)
 */
router.post('/register',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    body('firstName')
      .trim()
      .isLength({ min: 2 })
      .withMessage('First name must be at least 2 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Last name must be at least 2 characters'),
    body('role')
      .isIn(['Carer', 'Senior', 'Admin'])
      .withMessage('Invalid role specified')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const { email, password, firstName, lastName, role, facilityId, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await Staff.findOne({ email });
    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new Staff({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      facilityId: facilityId || 'default-facility',
      personalInfo: {
        phoneNumber
      },
      isActive: true,
      emailVerified: process.env.SKIP_EMAIL_VERIFICATION === 'true'
    });

    await newUser.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(newUser);

    // Audit log
    auditCareEvent('USER_REGISTRATION', {
      userId: newUser._id,
      email: newUser.email,
      role: newUser.role,
      facilityId: newUser.facilityId
    }, newUser._id);

    logger.info('New user registered:', {
      userId: newUser._id,
      email: newUser.email,
      role: newUser.role,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          facilityId: newUser.facilityId,
          permissions: newUser.permissions
        },
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });
  })
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      const user = await Staff.findById(decoded.id).select('-password');

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      });
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  })
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token invalidation)
 * @access  Private
 */
router.post('/logout', asyncHandler(async (req, res) => {
  // In a production environment, you might want to maintain a blacklist of tokens
  // For now, we'll just return success as the client will remove the token
  
  if (req.user) {
    auditCareEvent('USER_LOGOUT', {
      userId: req.user.id,
      email: req.user.email
    }, req.user.id);

    logger.info('User logged out:', {
      userId: req.user.id,
      email: req.user.email,
      ip: req.ip
    });
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  passwordResetLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email')
  ],
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await Staff.findOne({ email, isActive: true });
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // In production, send email here
    if (process.env.NODE_ENV === 'development') {
      logger.info('Password reset token (dev only):', {
        email: user.email,
        resetToken,
        resetUrl: `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`
      });
    }

    auditCareEvent('PASSWORD_RESET_REQUEST', {
      userId: user._id,
      email: user.email
    }, user._id);

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  })
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character')
  ],
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'password-reset') {
        throw new UnauthorizedError('Invalid reset token');
      }

      const user = await Staff.findOne({
        _id: decoded.id,
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() },
        isActive: true
      }).select('+password');

      if (!user) {
        throw new UnauthorizedError('Invalid or expired reset token');
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      user.password = hashedPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.passwordChangedAt = new Date();
      await user.save();

      auditCareEvent('PASSWORD_RESET_COMPLETED', {
        userId: user._id,
        email: user.email
      }, user._id);

      logger.info('Password reset completed:', {
        userId: user._id,
        email: user.email,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Password reset successful. Please log in with your new password.'
      });
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }
  })
);

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verify if token is still valid
 * @access  Private
 */
router.get('/verify-token', asyncHandler(async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Staff.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          facilityId: user.facilityId,
          permissions: user.permissions
        },
        tokenValid: true
      }
    });
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}));

module.exports = router;