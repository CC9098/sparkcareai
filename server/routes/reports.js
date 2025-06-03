const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route   GET /api/reports
 * @desc    Get reports
 * @access  Private
 */
router.get('/',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: { reports: [] },
      message: 'Reports feature coming soon'
    });
  })
);

module.exports = router;