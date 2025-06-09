const express = require('express');
const { body, query, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const Staff = require('../models/Staff');
const { asyncHandler, NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');
const { auditCareEvent } = require('../middleware/auditLogger');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @route   GET /api/staff
 * @desc    Get all staff members with filtering and pagination
 * @access  Private (Admin/Senior only)
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('role').optional().isIn(['Carer', 'Senior', 'Admin']).withMessage('Invalid role filter'),
    query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Invalid status filter')
  ],
  asyncHandler(async (req, res) => {
    // Check permissions
    if (!['Admin', 'Senior'].includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions to view staff list');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    let filter = { facilityId: req.user.facilityId };
    
    if (req.query.role) {
      filter.role = req.query.role;
    }
    
    if (req.query.status && req.query.status !== 'all') {
      filter.isActive = req.query.status === 'active';
    }

    const staff = await Staff.find(filter)
      .select('-password -passwordResetToken -loginHistory')
      .sort({ lastName: 1, firstName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Staff.countDocuments(filter);

    auditCareEvent('STAFF_LIST_ACCESSED', {
      resultsCount: staff.length,
      facilityId: req.user.facilityId
    }, req.user.id);

    res.json({
      success: true,
      data: {
        staff,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  })
);

/**
 * @route   GET /api/staff/:id
 * @desc    Get single staff member by ID
 * @access  Private
 */
router.get('/:id',
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    }).select('-password -passwordResetToken').lean();

    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Users can view their own profile, admins/seniors can view all
    const canView = staff._id.toString() === req.user.id || ['Admin', 'Senior'].includes(req.user.role);
    if (!canView) {
      throw new ForbiddenError('Cannot view other staff member profiles');
    }

    auditCareEvent('STAFF_PROFILE_ACCESSED', {
      staffId: staff._id,
      staffName: `${staff.firstName} ${staff.lastName}`,
      accessedBy: req.user.id
    }, req.user.id);

    res.json({
      success: true,
      data: { staff }
    });
  })
);

/**
 * @route   PUT /api/staff/:id
 * @desc    Update staff member information
 * @access  Private
 */
router.put('/:id',
  [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('role').optional().isIn(['Carer', 'Senior', 'Admin']).withMessage('Invalid role'),
    body('phoneNumber').optional().isMobilePhone().withMessage('Invalid phone number')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const staff = await Staff.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    });

    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Check permissions
    const isOwnProfile = staff._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'Admin';
    
    if (!isOwnProfile && !isAdmin) {
      throw new ForbiddenError('Can only update own profile unless you are an admin');
    }

    // Only admins can change roles
    if (req.body.role && !isAdmin) {
      throw new ForbiddenError('Only administrators can change user roles');
    }

    const updateData = { ...req.body };
    updateData.updatedAt = new Date();

    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -passwordResetToken');

    auditCareEvent('STAFF_PROFILE_UPDATED', {
      staffId: updatedStaff._id,
      updatedBy: req.user.id,
      changesCount: Object.keys(updateData).length
    }, req.user.id);

    res.json({
      success: true,
      message: 'Staff profile updated successfully',
      data: { staff: updatedStaff }
    });
  })
);

module.exports = router;