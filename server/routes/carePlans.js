const express = require('express');
const { body, query, validationResult } = require('express-validator');

const CarePlan = require('../models/CarePlan');
const Resident = require('../models/Resident');
const { asyncHandler, NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');
const { auditCarePlanChange } = require('../middleware/auditLogger');

const router = express.Router();

/**
 * @route   GET /api/care-plans
 * @desc    Get care plans with filtering
 * @access  Private
 */
router.get('/',
  asyncHandler(async (req, res) => {
    const filter = { facilityId: req.user.facilityId };
    
    if (req.query.residentId) {
      filter.residentId = req.query.residentId;
    }

    const carePlans = await CarePlan.find(filter)
      .populate('residentId', 'firstName lastName preferredName')
      .populate('createdBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: { carePlans }
    });
  })
);

/**
 * @route   POST /api/care-plans
 * @desc    Create new care plan
 * @access  Private (Admin/Senior only)
 */
router.post('/',
  [
    body('residentId').isMongoId().withMessage('Valid resident ID required'),
    body('strengths').isArray().withMessage('Strengths must be an array'),
    body('needs').isArray().withMessage('Needs must be an array'),
    body('risks').isArray().withMessage('Risks must be an array'),
    body('actions').isArray().withMessage('Actions must be an array')
  ],
  asyncHandler(async (req, res) => {
    if (!['Admin', 'Senior'].includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions to create care plans');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(err => err.msg).join(', ')}`);
    }

    const { residentId, strengths, needs, risks, actions } = req.body;

    const resident = await Resident.findOne({
      _id: residentId,
      facilityId: req.user.facilityId,
      status: 'active'
    });

    if (!resident) {
      throw new NotFoundError('Resident not found');
    }

    const carePlan = new CarePlan({
      residentId,
      facilityId: req.user.facilityId,
      planType: 'comprehensive',
      strengths,
      needs,
      risks,
      actions,
      status: 'active',
      createdBy: req.user.id
    });

    await carePlan.save();
    await carePlan.populate('residentId', 'firstName lastName preferredName');

    auditCarePlanChange(carePlan._id, { action: 'created' }, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Care plan created successfully',
      data: { carePlan }
    });
  })
);

module.exports = router;