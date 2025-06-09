const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const DailyLog = require('../models/DailyLog');
const Resident = require('../models/Resident');
const Staff = require('../models/Staff');
const logger = require('../config/logger');
const { io } = require('../index');

// Webhook verification middleware
const verifyWebhookSignature = (secret) => {
  return (req, res, next) => {
    if (!secret) return next(); // Skip verification in development
    
    const signature = req.headers['x-sparkcare-signature'] || req.headers['x-hub-signature-256'];
    
    if (!signature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing webhook signature'
      });
    }
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    
    if (digest !== signature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid webhook signature'
      });
    }
    
    next();
  };
};

/**
 * @route POST /api/webhooks/ai-model-callback
 * @desc Receive callbacks from external AI model processing
 * @access Public (with signature verification)
 */
router.post('/ai-model-callback',
  verifyWebhookSignature(process.env.AI_WEBHOOK_SECRET),
  [
    body('processId').isString().withMessage('Process ID is required'),
    body('status').isIn(['completed', 'failed', 'processing']).withMessage('Invalid status'),
    body('result').optional().isObject(),
    body('error').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
      }

      const { processId, status, result, error, metadata } = req.body;

      logger.info('AI model callback received', {
        processId: processId,
        status: status,
        timestamp: new Date()
      });

      // Process the callback based on the type of AI operation
      switch (metadata?.type) {
        case 'voice_to_text':
          await handleVoiceToTextCallback(processId, status, result, error);
          break;
          
        case 'log_analysis':
          await handleLogAnalysisCallback(processId, status, result, error);
          break;
          
        case 'risk_assessment':
          await handleRiskAssessmentCallback(processId, status, result, error);
          break;
          
        case 'compliance_check':
          await handleComplianceCheckCallback(processId, status, result, error);
          break;
          
        default:
          logger.warn('Unknown AI callback type', { 
            processId: processId, 
            type: metadata?.type 
          });
      }

      // Emit real-time update to connected clients
      if (metadata?.facilityId) {
        io.to(`facility:${metadata.facilityId}`).emit('ai_update', {
          processId: processId,
          status: status,
          type: metadata?.type,
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        message: 'Callback processed successfully',
        processId: processId
      });

    } catch (error) {
      logger.error('AI callback processing failed:', error);
      res.status(500).json({
        error: 'Callback Processing Error',
        message: 'Failed to process AI callback'
      });
    }
  }
);

/**
 * @route POST /api/webhooks/external-system
 * @desc Receive updates from external healthcare systems (GP Connect, NHS systems)
 * @access Public (with signature verification)
 */
router.post('/external-system',
  verifyWebhookSignature(process.env.EXTERNAL_WEBHOOK_SECRET),
  [
    body('system').isString().withMessage('System identifier is required'),
    body('eventType').isString().withMessage('Event type is required'),
    body('data').isObject().withMessage('Event data is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
      }

      const { system, eventType, data, timestamp } = req.body;

      logger.info('External system webhook received', {
        system: system,
        eventType: eventType,
        timestamp: timestamp || new Date()
      });

      // Route to appropriate handler based on system and event type
      switch (system) {
        case 'gp_connect':
          await handleGPConnectWebhook(eventType, data);
          break;
          
        case 'nhs_digital':
          await handleNHSDigitalWebhook(eventType, data);
          break;
          
        case 'local_authority':
          await handleLocalAuthorityWebhook(eventType, data);
          break;
          
        case 'pharmacy':
          await handlePharmacyWebhook(eventType, data);
          break;
          
        default:
          logger.warn('Unknown external system', { system: system });
          return res.status(400).json({
            error: 'Unknown System',
            message: `System '${system}' is not supported`
          });
      }

      res.json({
        success: true,
        message: 'External system webhook processed successfully'
      });

    } catch (error) {
      logger.error('External system webhook processing failed:', error);
      res.status(500).json({
        error: 'Webhook Processing Error',
        message: 'Failed to process external system webhook'
      });
    }
  }
);

/**
 * @route POST /api/webhooks/cqc-inspection
 * @desc Receive notifications about CQC inspection schedules and updates
 * @access Public (with signature verification)
 */
router.post('/cqc-inspection',
  verifyWebhookSignature(process.env.CQC_WEBHOOK_SECRET),
  [
    body('facilityId').isString().withMessage('Facility ID is required'),
    body('inspectionType').isIn(['announced', 'unannounced', 'focused', 'comprehensive']).withMessage('Invalid inspection type'),
    body('scheduledDate').optional().isISO8601().withMessage('Invalid date format'),
    body('status').isIn(['scheduled', 'in_progress', 'completed', 'cancelled']).withMessage('Invalid status')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
      }

      const { facilityId, inspectionType, scheduledDate, status, inspectorDetails } = req.body;

      logger.info('CQC inspection webhook received', {
        facilityId: facilityId,
        inspectionType: inspectionType,
        status: status,
        scheduledDate: scheduledDate
      });

      // Create inspection notification in the system
      await createInspectionNotification({
        facilityId: facilityId,
        inspectionType: inspectionType,
        scheduledDate: scheduledDate,
        status: status,
        inspectorDetails: inspectorDetails,
        receivedAt: new Date()
      });

      // Notify facility administrators immediately
      io.to(`facility:${facilityId}`).emit('cqc_inspection_update', {
        inspectionType: inspectionType,
        status: status,
        scheduledDate: scheduledDate,
        urgency: inspectionType === 'unannounced' ? 'high' : 'medium'
      });

      res.json({
        success: true,
        message: 'CQC inspection notification processed successfully'
      });

    } catch (error) {
      logger.error('CQC inspection webhook processing failed:', error);
      res.status(500).json({
        error: 'Webhook Processing Error',
        message: 'Failed to process CQC inspection notification'
      });
    }
  }
);

/**
 * @route POST /api/webhooks/medication-alerts
 * @desc Receive medication alerts and recalls from pharmacy systems
 * @access Public (with signature verification)
 */
router.post('/medication-alerts',
  verifyWebhookSignature(process.env.MEDICATION_WEBHOOK_SECRET),
  [
    body('alertType').isIn(['recall', 'shortage', 'safety', 'interaction']).withMessage('Invalid alert type'),
    body('medicationName').isString().withMessage('Medication name is required'),
    body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity level'),
    body('affectedBatches').optional().isArray(),
    body('actionRequired').isString().withMessage('Action required is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
      }

      const { 
        alertType, 
        medicationName, 
        severity, 
        affectedBatches, 
        actionRequired, 
        expiryDate,
        sourceAuthority 
      } = req.body;

      logger.info('Medication alert webhook received', {
        alertType: alertType,
        medicationName: medicationName,
        severity: severity,
        sourceAuthority: sourceAuthority
      });

      // Find all residents who might be affected by this medication alert
      const affectedResidents = await findResidentsWithMedication(medicationName, affectedBatches);

      // Create medication alert notifications
      const alert = await createMedicationAlert({
        alertType: alertType,
        medicationName: medicationName,
        severity: severity,
        affectedBatches: affectedBatches,
        actionRequired: actionRequired,
        expiryDate: expiryDate,
        sourceAuthority: sourceAuthority,
        affectedResidents: affectedResidents.map(r => r._id),
        receivedAt: new Date()
      });

      // Notify relevant facilities and staff
      for (const resident of affectedResidents) {
        io.to(`facility:${resident.facility}`).emit('medication_alert', {
          alertId: alert._id,
          alertType: alertType,
          medicationName: medicationName,
          severity: severity,
          residentId: resident._id,
          residentName: resident.fullName,
          actionRequired: actionRequired
        });
      }

      res.json({
        success: true,
        message: 'Medication alert processed successfully',
        alertId: alert._id,
        affectedResidents: affectedResidents.length
      });

    } catch (error) {
      logger.error('Medication alert webhook processing failed:', error);
      res.status(500).json({
        error: 'Webhook Processing Error',
        message: 'Failed to process medication alert'
      });
    }
  }
);

/**
 * @route POST /api/webhooks/family-portal
 * @desc Receive updates from family portal interactions
 * @access Public (with signature verification)
 */
router.post('/family-portal',
  verifyWebhookSignature(process.env.FAMILY_WEBHOOK_SECRET),
  [
    body('residentId').isMongoId().withMessage('Invalid resident ID'),
    body('familyMemberId').isString().withMessage('Family member ID is required'),
    body('eventType').isIn(['message', 'visit_request', 'care_query', 'update_viewed']).withMessage('Invalid event type'),
    body('content').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          details: errors.array()
        });
      }

      const { residentId, familyMemberId, eventType, content, timestamp } = req.body;

      logger.info('Family portal webhook received', {
        residentId: residentId,
        familyMemberId: familyMemberId,
        eventType: eventType,
        timestamp: timestamp || new Date()
      });

      const resident = await Resident.findById(residentId);
      if (!resident) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Resident not found'
        });
      }

      // Process different types of family portal events
      switch (eventType) {
        case 'message':
          await handleFamilyMessage(residentId, familyMemberId, content);
          break;
          
        case 'visit_request':
          await handleVisitRequest(residentId, familyMemberId, content);
          break;
          
        case 'care_query':
          await handleCareQuery(residentId, familyMemberId, content);
          break;
          
        case 'update_viewed':
          await handleUpdateViewed(residentId, familyMemberId, content);
          break;
      }

      // Notify care staff about family interactions
      io.to(`facility:${resident.facility}`).emit('family_interaction', {
        residentId: residentId,
        residentName: resident.fullName,
        eventType: eventType,
        familyMemberId: familyMemberId,
        timestamp: timestamp || new Date(),
        requiresResponse: ['message', 'visit_request', 'care_query'].includes(eventType)
      });

      res.json({
        success: true,
        message: 'Family portal event processed successfully'
      });

    } catch (error) {
      logger.error('Family portal webhook processing failed:', error);
      res.status(500).json({
        error: 'Webhook Processing Error',
        message: 'Failed to process family portal event'
      });
    }
  }
);

// Helper functions for processing specific callback types

async function handleVoiceToTextCallback(processId, status, result, error) {
  if (status === 'completed' && result) {
    // Update any pending logs with the transcription
    await DailyLog.updateMany(
      { 'voiceToText.processId': processId },
      {
        $set: {
          'voiceToText.transcript': result.text,
          'voiceToText.confidence': result.confidence,
          'voiceToText.status': 'completed'
        }
      }
    );
  } else if (status === 'failed') {
    await DailyLog.updateMany(
      { 'voiceToText.processId': processId },
      {
        $set: {
          'voiceToText.status': 'failed',
          'voiceToText.error': error
        }
      }
    );
  }
}

async function handleLogAnalysisCallback(processId, status, result, error) {
  if (status === 'completed' && result) {
    await DailyLog.findOneAndUpdate(
      { 'aiAnalysis.processId': processId },
      {
        $set: {
          'aiSuggestions': result.suggestions,
          'tags': result.suggestedTags,
          'priority': result.suggestedPriority,
          'aiAnalysis.status': 'completed'
        }
      }
    );
  }
}

async function handleRiskAssessmentCallback(processId, status, result, error) {
  // Handle AI-powered risk assessment results
  logger.info('Risk assessment callback processed', { processId, status });
}

async function handleComplianceCheckCallback(processId, status, result, error) {
  // Handle compliance checking results
  logger.info('Compliance check callback processed', { processId, status });
}

async function handleGPConnectWebhook(eventType, data) {
  switch (eventType) {
    case 'appointment_update':
      await handleGPAppointmentUpdate(data);
      break;
    case 'prescription_update':
      await handleGPPrescriptionUpdate(data);
      break;
    case 'medical_record_update':
      await handleGPMedicalRecordUpdate(data);
      break;
  }
}

async function handleNHSDigitalWebhook(eventType, data) {
  // Handle NHS Digital system updates
  logger.info('NHS Digital webhook processed', { eventType, data });
}

async function handleLocalAuthorityWebhook(eventType, data) {
  // Handle local authority updates (funding, assessments, etc.)
  logger.info('Local Authority webhook processed', { eventType, data });
}

async function handlePharmacyWebhook(eventType, data) {
  // Handle pharmacy system updates
  logger.info('Pharmacy webhook processed', { eventType, data });
}

async function createInspectionNotification(inspectionData) {
  // Create inspection notification record
  // This would typically be stored in a notifications or inspections collection
  logger.info('Inspection notification created', inspectionData);
}

async function findResidentsWithMedication(medicationName, affectedBatches) {
  // Find residents who are currently prescribed the affected medication
  // This would query the medication records (eMAR system)
  return await Resident.find({
    status: 'Active',
    // Add medication query logic here
  }).select('_id firstName lastName facility');
}

async function createMedicationAlert(alertData) {
  // Create medication alert record
  // This would typically be stored in a medication_alerts collection
  logger.info('Medication alert created', alertData);
  return { _id: 'alert-id-placeholder', ...alertData };
}

async function handleFamilyMessage(residentId, familyMemberId, content) {
  // Handle family message
  logger.info('Family message processed', { residentId, familyMemberId });
}

async function handleVisitRequest(residentId, familyMemberId, content) {
  // Handle visit request
  logger.info('Visit request processed', { residentId, familyMemberId });
}

async function handleCareQuery(residentId, familyMemberId, content) {
  // Handle care query from family
  logger.info('Care query processed', { residentId, familyMemberId });
}

async function handleUpdateViewed(residentId, familyMemberId, content) {
  // Handle family member viewing care updates
  logger.info('Update viewed processed', { residentId, familyMemberId });
}

async function handleGPAppointmentUpdate(data) {
  // Handle GP appointment updates
  logger.info('GP appointment update processed', data);
}

async function handleGPPrescriptionUpdate(data) {
  // Handle GP prescription updates
  logger.info('GP prescription update processed', data);
}

async function handleGPMedicalRecordUpdate(data) {
  // Handle GP medical record updates
  logger.info('GP medical record update processed', data);
}

module.exports = router;