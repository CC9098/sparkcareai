const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route   GET /api/risk-assessments
 * @desc    Get risk assessments
 * @access  Private
 */
router.get('/',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: { riskAssessments: [] },
      message: 'Risk assessments feature coming soon'
    });
  })
);

module.exports = router;