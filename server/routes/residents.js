const express = require('express');
const { body, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

const Resident = require('../models/Resident');
const { asyncHandler, NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');
const { auditCareEvent } = require('../middleware/auditLogger');
const logger = require('../config/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/residents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
    }
  }
});

/**
 * @route   GET /api/residents
 * @desc    Get all residents with filtering and pagination
 * @access  Private
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isLength({ max: 100 }).withMessage('Search term too long'),
    query('status').optional().isIn(['active', 'archived', 'all']).withMessage('Invalid status filter'),
    query('room').optional().isLength({ max: 20 }).withMessage('Room filter too long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const status = req.query.status || 'active';
    const room = req.query.room;

    // Build filter query
    let filter = { facilityId: req.user.facilityId };
    
    if (status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { preferredName: { $regex: search, $options: 'i' } },
        { nhsNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (room) {
      filter['accommodation.roomNumber'] = { $regex: room, $options: 'i' };
    }

    const residents = await Resident.find(filter)
      .select('-medicalHistory.sensitiveInfo -personalInfo.nextOfKin.contactDetails')
      .sort({ lastName: 1, firstName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Resident.countDocuments(filter);

    auditCareEvent('RESIDENTS_LIST_ACCESSED', {
      searchTerm: search,
      resultsCount: residents.length,
      facilityId: req.user.facilityId
    }, req.user.id);

    res.json({
      success: true,
      data: {
        residents,
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
 * @route   GET /api/residents/:id
 * @desc    Get single resident by ID
 * @access  Private
 */
router.get('/:id',
  asyncHandler(async (req, res) => {
    const resident = await Resident.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    }).lean();

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    // Check if user has permission to view sensitive information
    const canViewSensitive = ['Admin', 'Senior'].includes(req.user.role);
    
    if (!canViewSensitive) {
      // Remove sensitive information for regular carers
      delete resident.medicalHistory?.sensitiveInfo;
      delete resident.personalInfo?.nextOfKin?.contactDetails;
      delete resident.personalInfo?.emergencyContact;
    }

    auditCareEvent('RESIDENT_PROFILE_ACCESSED', {
      residentId: resident._id,
      residentName: `${resident.firstName} ${resident.lastName}`,
      accessedBy: req.user.id,
      sensitiveDataAccessed: canViewSensitive
    }, req.user.id);

    res.json({
      success: true,
      data: { resident }
    });
  })
);

/**
 * @route   POST /api/residents
 * @desc    Create new resident
 * @access  Private (Admin/Senior only)
 */
router.post('/',
  upload.single('profilePhoto'),
  [
    body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('dateOfBirth').isISO8601().withMessage('Invalid date of birth format'),
    body('nhsNumber').isLength({ min: 10, max: 10 }).withMessage('NHS number must be 10 digits'),
    body('gender').isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Invalid gender'),
    body('roomNumber').optional().trim().isLength({ max: 20 }).withMessage('Room number too long'),
    body('admissionDate').isISO8601().withMessage('Invalid admission date format')
  ],
  asyncHandler(async (req, res) => {
    // Check permissions
    if (!['Admin', 'Senior'].includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions to create residents');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const {
      firstName, lastName, preferredName, dateOfBirth, nhsNumber, gender,
      roomNumber, bedNumber, admissionDate, emergencyContact, nextOfKin,
      medicalConditions, allergies, medications, mobilityAids, dietaryRequirements
    } = req.body;

    // Check if NHS number already exists
    const existingResident = await Resident.findOne({ nhsNumber });
    if (existingResident) {
      throw new ValidationError('A resident with this NHS number already exists');
    }

    const newResident = new Resident({
      firstName,
      lastName,
      preferredName,
      dateOfBirth,
      nhsNumber,
      gender,
      facilityId: req.user.facilityId,
      accommodation: {
        roomNumber,
        bedNumber
      },
      admissionDate,
      personalInfo: {
        emergencyContact: emergencyContact ? JSON.parse(emergencyContact) : undefined,
        nextOfKin: nextOfKin ? JSON.parse(nextOfKin) : undefined
      },
      medicalHistory: {
        conditions: medicalConditions ? JSON.parse(medicalConditions) : [],
        allergies: allergies ? JSON.parse(allergies) : [],
        medications: medications ? JSON.parse(medications) : []
      },
      careRequirements: {
        mobilityAids: mobilityAids ? JSON.parse(mobilityAids) : [],
        dietaryRequirements: dietaryRequirements ? JSON.parse(dietaryRequirements) : []
      },
      profilePhoto: req.file ? req.file.path : undefined,
      status: 'active',
      createdBy: req.user.id
    });

    await newResident.save();

    auditCareEvent('RESIDENT_CREATED', {
      residentId: newResident._id,
      residentName: `${newResident.firstName} ${newResident.lastName}`,
      nhsNumber: newResident.nhsNumber,
      createdBy: req.user.id,
      facilityId: req.user.facilityId
    }, req.user.id);

    logger.info('New resident created:', {
      residentId: newResident._id,
      name: `${newResident.firstName} ${newResident.lastName}`,
      createdBy: req.user.id,
      facilityId: req.user.facilityId
    });

    res.status(201).json({
      success: true,
      message: 'Resident created successfully',
      data: { resident: newResident }
    });
  })
);

/**
 * @route   PUT /api/residents/:id
 * @desc    Update resident information
 * @access  Private (Admin/Senior only)
 */
router.put('/:id',
  upload.single('profilePhoto'),
  [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('dateOfBirth').optional().isISO8601().withMessage('Invalid date of birth format'),
    body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Invalid gender'),
    body('roomNumber').optional().trim().isLength({ max: 20 }).withMessage('Room number too long')
  ],
  asyncHandler(async (req, res) => {
    // Check permissions
    if (!['Admin', 'Senior'].includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions to update residents');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const resident = await Resident.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    });

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    const updateData = { ...req.body };
    
    // Handle file upload
    if (req.file) {
      updateData.profilePhoto = req.file.path;
    }

    // Parse JSON fields if they exist
    ['emergencyContact', 'nextOfKin', 'medicalConditions', 'allergies', 'medications', 'mobilityAids', 'dietaryRequirements'].forEach(field => {
      if (updateData[field] && typeof updateData[field] === 'string') {
        try {
          updateData[field] = JSON.parse(updateData[field]);
        } catch (error) {
          throw new ValidationError(`Invalid JSON format for ${field}`);
        }
      }
    });

    // Structure nested updates
    if (updateData.roomNumber || updateData.bedNumber) {
      updateData.accommodation = {
        ...resident.accommodation.toObject(),
        ...(updateData.roomNumber && { roomNumber: updateData.roomNumber }),
        ...(updateData.bedNumber && { bedNumber: updateData.bedNumber })
      };
      delete updateData.roomNumber;
      delete updateData.bedNumber;
    }

    updateData.updatedBy = req.user.id;
    updateData.updatedAt = new Date();

    const updatedResident = await Resident.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    auditCareEvent('RESIDENT_UPDATED', {
      residentId: updatedResident._id,
      residentName: `${updatedResident.firstName} ${updatedResident.lastName}`,
      updatedBy: req.user.id,
      changesCount: Object.keys(updateData).length
    }, req.user.id);

    res.json({
      success: true,
      message: 'Resident updated successfully',
      data: { resident: updatedResident }
    });
  })
);

/**
 * @route   DELETE /api/residents/:id
 * @desc    Archive resident (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  asyncHandler(async (req, res) => {
    // Check permissions - only admins can archive residents
    if (req.user.role !== 'Admin') {
      throw new ForbiddenError('Only administrators can archive residents');
    }

    const resident = await Resident.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    });

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    // Soft delete - change status to archived
    resident.status = 'archived';
    resident.archivedDate = new Date();
    resident.archivedBy = req.user.id;
    await resident.save();

    auditCareEvent('RESIDENT_ARCHIVED', {
      residentId: resident._id,
      residentName: `${resident.firstName} ${resident.lastName}`,
      archivedBy: req.user.id,
      reason: req.body.reason || 'Not specified'
    }, req.user.id);

    res.json({
      success: true,
      message: 'Resident archived successfully'
    });
  })
);

/**
 * @route   GET /api/residents/:id/care-summary
 * @desc    Get care summary for a resident
 * @access  Private
 */
router.get('/:id/care-summary',
  asyncHandler(async (req, res) => {
    const resident = await Resident.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId,
      status: 'active'
    }).select('firstName lastName careRequirements medicalHistory currentRiskLevel');

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    // Get recent care logs and plans (would need to implement these models)
    // For now, return basic resident info
    const careSummary = {
      resident: {
        id: resident._id,
        name: `${resident.firstName} ${resident.lastName}`,
        riskLevel: resident.currentRiskLevel || 'low'
      },
      careRequirements: resident.careRequirements,
      medicalAlerts: resident.medicalHistory?.allergies || [],
      lastUpdated: resident.updatedAt
    };

    auditCareEvent('CARE_SUMMARY_ACCESSED', {
      residentId: resident._id,
      accessedBy: req.user.id
    }, req.user.id);

    res.json({
      success: true,
      data: { careSummary }
    });
  })
);

module.exports = router;