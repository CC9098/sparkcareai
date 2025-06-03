const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route   GET /api/tasks
 * @desc    Get tasks
 * @access  Private
 */
router.get('/',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: { tasks: [] },
      message: 'Tasks feature coming soon'
    });
  })
);

module.exports = router;