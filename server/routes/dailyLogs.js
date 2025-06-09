const express = require('express');
const { body, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

const DailyLog = require('../models/DailyLog');
const Resident = require('../models/Resident');
const { asyncHandler, NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');
const { auditCareEvent } = require('../middleware/auditLogger');
const logger = require('../config/logger');

const router = express.Router();

// Configure multer for media uploads (photos/videos)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/care-logs/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, MP4, and WebM files are allowed.'));
    }
  }
});

/**
 * @route   GET /api/daily-logs
 * @desc    Get daily logs with filtering and pagination
 * @access  Private
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('residentId').optional().isMongoId().withMessage('Invalid resident ID'),
    query('category').optional().isIn(['personal-care', 'medication', 'meals', 'activities', 'health', 'incident', 'observation']).withMessage('Invalid category'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('staffId').optional().isMongoId().withMessage('Invalid staff ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    let filter = { facilityId: req.user.facilityId };
    
    if (req.query.residentId) {
      filter.residentId = req.query.residentId;
    }
    
    if (req.query.category) {
      filter.category = req.query.category;
    }
    
    if (req.query.staffId) {
      filter.createdBy = req.query.staffId;
    }
    
    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) {
        filter.timestamp.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.timestamp.$lte = new Date(req.query.endDate);
      }
    }

    const logs = await DailyLog.find(filter)
      .populate('residentId', 'firstName lastName preferredName')
      .populate('createdBy', 'firstName lastName role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await DailyLog.countDocuments(filter);

    auditCareEvent('DAILY_LOGS_ACCESSED', {
      filterCount: Object.keys(req.query).length,
      resultsCount: logs.length,
      facilityId: req.user.facilityId
    }, req.user.id);

    res.json({
      success: true,
      data: {
        logs,
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
 * @route   GET /api/daily-logs/:id
 * @desc    Get single daily log by ID
 * @access  Private
 */
router.get('/:id',
  asyncHandler(async (req, res) => {
    const log = await DailyLog.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    })
    .populate('residentId', 'firstName lastName preferredName')
    .populate('createdBy', 'firstName lastName role')
    .populate('updatedBy', 'firstName lastName role')
    .lean();

    if (!log) {
      throw new NotFoundError('Daily log not found');
    }

    auditCareEvent('DAILY_LOG_ACCESSED', {
      logId: log._id,
      residentId: log.residentId._id,
      category: log.category
    }, req.user.id);

    res.json({
      success: true,
      data: { log }
    });
  })
);

/**
 * @route   POST /api/daily-logs
 * @desc    Create new daily log entry
 * @access  Private
 */
router.post('/',
  upload.array('media', 5), // Allow up to 5 media files
  [
    body('residentId').isMongoId().withMessage('Valid resident ID is required'),
    body('category').isIn(['personal-care', 'medication', 'meals', 'activities', 'health', 'incident', 'observation']).withMessage('Invalid category'),
    body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
    body('content').trim().isLength({ min: 10, max: 2000 }).withMessage('Content must be 10-2000 characters'),
    body('mood').optional().isIn(['very-happy', 'happy', 'neutral', 'sad', 'distressed']).withMessage('Invalid mood'),
    body('painLevel').optional().isInt({ min: 0, max: 10 }).withMessage('Pain level must be 0-10'),
    body('concerns').optional().isBoolean().withMessage('Concerns must be true or false'),
    body('followUpRequired').optional().isBoolean().withMessage('Follow up required must be true or false')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const { residentId, category, title, content, mood, painLevel, concerns, followUpRequired, observations } = req.body;

    // Verify resident exists and belongs to facility
    const resident = await Resident.findOne({
      _id: residentId,
      facilityId: req.user.facilityId,
      status: 'active'
    });

    if (!resident) {
      throw new NotFoundError('Resident not found or inactive');
    }

    // Process uploaded media files
    const mediaFiles = req.files ? req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimeType: file.mimetype,
      size: file.size
    })) : [];

    // Parse observations if provided
    let parsedObservations = {};
    if (observations) {
      try {
        parsedObservations = JSON.parse(observations);
      } catch (error) {
        throw new ValidationError('Invalid observations format');
      }
    }

    const newLog = new DailyLog({
      residentId,
      facilityId: req.user.facilityId,
      category,
      title,
      content,
      timestamp: new Date(),
      createdBy: req.user.id,
      careData: {
        mood,
        painLevel: painLevel ? parseInt(painLevel) : undefined,
        observations: parsedObservations
      },
      flags: {
        concerns: concerns === 'true',
        followUpRequired: followUpRequired === 'true',
        reviewRequired: concerns === 'true' || followUpRequired === 'true'
      },
      media: mediaFiles,
      isEdited: false
    });

    await newLog.save();

    // Populate fields for response
    await newLog.populate('residentId', 'firstName lastName preferredName');
    await newLog.populate('createdBy', 'firstName lastName role');

    auditCareEvent('DAILY_LOG_CREATED', {
      logId: newLog._id,
      residentId: newLog.residentId._id,
      residentName: `${newLog.residentId.firstName} ${newLog.residentId.lastName}`,
      category: newLog.category,
      hasConcerns: newLog.flags.concerns,
      requiresFollowUp: newLog.flags.followUpRequired,
      mediaCount: mediaFiles.length
    }, req.user.id);

    logger.info('New care log created:', {
      logId: newLog._id,
      residentId: newLog.residentId._id,
      category: newLog.category,
      createdBy: req.user.id,
      facilityId: req.user.facilityId
    });

    res.status(201).json({
      success: true,
      message: 'Daily log created successfully',
      data: { log: newLog }
    });
  })
);

/**
 * @route   PUT /api/daily-logs/:id
 * @desc    Update daily log entry
 * @access  Private
 */
router.put('/:id',
  upload.array('media', 5),
  [
    body('category').optional().isIn(['personal-care', 'medication', 'meals', 'activities', 'health', 'incident', 'observation']).withMessage('Invalid category'),
    body('title').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
    body('content').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('Content must be 10-2000 characters'),
    body('mood').optional().isIn(['very-happy', 'happy', 'neutral', 'sad', 'distressed']).withMessage('Invalid mood'),
    body('painLevel').optional().isInt({ min: 0, max: 10 }).withMessage('Pain level must be 0-10'),
    body('concerns').optional().isBoolean().withMessage('Concerns must be true or false'),
    body('followUpRequired').optional().isBoolean().withMessage('Follow up required must be true or false')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const log = await DailyLog.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    });

    if (!log) {
      throw new NotFoundError('Daily log not found');
    }

    // Check if user can edit this log (creator or admin/senior)
    const canEdit = log.createdBy.toString() === req.user.id || ['Admin', 'Senior'].includes(req.user.role);
    if (!canEdit) {
      throw new ForbiddenError('You can only edit your own logs unless you are an admin or senior carer');
    }

    // Check if log is within editable time window (24 hours for regular carers)
    const hoursSinceCreation = (new Date() - log.timestamp) / (1000 * 60 * 60);
    if (req.user.role === 'Carer' && hoursSinceCreation > 24) {
      throw new ForbiddenError('Logs can only be edited within 24 hours of creation');
    }

    const updateData = { ...req.body };

    // Handle new media files
    if (req.files && req.files.length > 0) {
      const newMediaFiles = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        mimeType: file.mimetype,
        size: file.size
      }));
      updateData.media = [...(log.media || []), ...newMediaFiles];
    }

    // Parse observations if provided
    if (updateData.observations) {
      try {
        updateData.observations = JSON.parse(updateData.observations);
      } catch (error) {
        throw new ValidationError('Invalid observations format');
      }
    }

    // Update care data
    if (updateData.mood || updateData.painLevel || updateData.observations) {
      updateData.careData = {
        ...log.careData.toObject(),
        ...(updateData.mood && { mood: updateData.mood }),
        ...(updateData.painLevel && { painLevel: parseInt(updateData.painLevel) }),
        ...(updateData.observations && { observations: updateData.observations })
      };
    }

    // Update flags
    if (updateData.concerns !== undefined || updateData.followUpRequired !== undefined) {
      updateData.flags = {
        ...log.flags.toObject(),
        ...(updateData.concerns !== undefined && { concerns: updateData.concerns === 'true' }),
        ...(updateData.followUpRequired !== undefined && { followUpRequired: updateData.followUpRequired === 'true' })
      };
      updateData.flags.reviewRequired = updateData.flags.concerns || updateData.flags.followUpRequired;
    }

    updateData.updatedBy = req.user.id;
    updateData.updatedAt = new Date();
    updateData.isEdited = true;

    // Remove fields that shouldn't be directly updated
    delete updateData.mood;
    delete updateData.painLevel;
    delete updateData.observations;
    delete updateData.concerns;
    delete updateData.followUpRequired;

    const updatedLog = await DailyLog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('residentId', 'firstName lastName preferredName')
    .populate('createdBy', 'firstName lastName role')
    .populate('updatedBy', 'firstName lastName role');

    auditCareEvent('DAILY_LOG_UPDATED', {
      logId: updatedLog._id,
      residentId: updatedLog.residentId._id,
      updatedBy: req.user.id,
      editedFields: Object.keys(updateData).length
    }, req.user.id);

    res.json({
      success: true,
      message: 'Daily log updated successfully',
      data: { log: updatedLog }
    });
  })
);

/**
 * @route   DELETE /api/daily-logs/:id
 * @desc    Delete daily log (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  asyncHandler(async (req, res) => {
    // Only admins can delete logs
    if (req.user.role !== 'Admin') {
      throw new ForbiddenError('Only administrators can delete daily logs');
    }

    const log = await DailyLog.findOne({
      _id: req.params.id,
      facilityId: req.user.facilityId
    });

    if (!log) {
      throw new NotFoundError('Daily log not found');
    }

    await DailyLog.findByIdAndDelete(req.params.id);

    auditCareEvent('DAILY_LOG_DELETED', {
      logId: log._id,
      residentId: log.residentId,
      category: log.category,
      deletedBy: req.user.id,
      reason: req.body.reason || 'Not specified'
    }, req.user.id);

    res.json({
      success: true,
      message: 'Daily log deleted successfully'
    });
  })
);

/**
 * @route   GET /api/daily-logs/resident/:residentId
 * @desc    Get all logs for a specific resident
 * @access  Private
 */
router.get('/resident/:residentId',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isIn(['personal-care', 'medication', 'meals', 'activities', 'health', 'incident', 'observation']).withMessage('Invalid category'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format')
  ],
  asyncHandler(async (req, res) => {
    const { residentId } = req.params;
    
    // Verify resident exists and belongs to facility
    const resident = await Resident.findOne({
      _id: residentId,
      facilityId: req.user.facilityId
    });

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    let filter = { 
      residentId,
      facilityId: req.user.facilityId 
    };
    
    if (req.query.category) {
      filter.category = req.query.category;
    }
    
    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) {
        filter.timestamp.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.timestamp.$lte = new Date(req.query.endDate);
      }
    }

    const logs = await DailyLog.find(filter)
      .populate('createdBy', 'firstName lastName role')
      .populate('updatedBy', 'firstName lastName role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await DailyLog.countDocuments(filter);

    auditCareEvent('RESIDENT_LOGS_ACCESSED', {
      residentId,
      residentName: `${resident.firstName} ${resident.lastName}`,
      logsCount: logs.length
    }, req.user.id);

    res.json({
      success: true,
      data: {
        resident: {
          id: resident._id,
          name: `${resident.firstName} ${resident.lastName}`,
          preferredName: resident.preferredName
        },
        logs,
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

module.exports = router;