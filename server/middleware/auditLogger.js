const logger = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Comprehensive audit logging middleware for SparkCare AI
 * Ensures CQC compliance and security monitoring
 */

// Ensure audit log directory exists
const auditLogDir = path.join(__dirname, '../../logs');
const auditLogFile = path.join(auditLogDir, 'audit.log');

// Initialize audit log file
const initAuditLog = async () => {
  try {
    await fs.access(auditLogDir);
  } catch {
    await fs.mkdir(auditLogDir, { recursive: true });
  }
};

initAuditLog();

/**
 * Sensitive endpoints that require detailed audit logging
 */
const sensitiveEndpoints = [
  '/api/auth',
  '/api/residents',
  '/api/care-plans',
  '/api/daily-logs',
  '/api/staff',
  '/api/reports',
  '/api/risk-assessments'
];

/**
 * Data that should be redacted from audit logs for GDPR compliance
 */
const sensitiveFields = [
  'password',
  'token',
  'nhsNumber',
  'nationalInsuranceNumber',
  'dateOfBirth',
  'emergencyContact',
  'nextOfKin',
  'medicalHistory',
  'medications'
];

/**
 * Redact sensitive data from audit logs
 */
const redactSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const redacted = { ...data };
  
  sensitiveFields.forEach(field => {
    if (redacted[field]) {
      redacted[field] = '[REDACTED]';
    }
  });
  
  // Recursively redact nested objects
  Object.keys(redacted).forEach(key => {
    if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  });
  
  return redacted;
};

/**
 * Extract relevant user information for audit trail
 */
const extractUserInfo = (req) => {
  return {
    userId: req.user?.id || 'anonymous',
    userEmail: req.user?.email || 'unknown',
    userRole: req.user?.role || 'unknown',
    facilityId: req.user?.facilityId || 'unknown',
    sessionId: req.sessionID || 'unknown'
  };
};

/**
 * Determine if endpoint requires audit logging
 */
const requiresAuditLogging = (url) => {
  return sensitiveEndpoints.some(endpoint => url.startsWith(endpoint));
};

/**
 * Generate audit log entry
 */
const createAuditEntry = (req, res, responseTime) => {
  const userInfo = extractUserInfo(req);
  
  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'API_ACCESS',
    action: `${req.method} ${req.originalUrl}`,
    ...userInfo,
    requestDetails: {
      method: req.method,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      headers: redactSensitiveData({
        'x-forwarded-for': req.get('x-forwarded-for'),
        'authorization': req.get('authorization') ? '[REDACTED]' : undefined
      })
    },
    requestBody: req.method !== 'GET' ? redactSensitiveData(req.body) : undefined,
    responseDetails: {
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`
    },
    compliance: {
      cqcRelevant: true,
      gdprCompliant: true,
      retentionPeriod: '7 years'
    }
  };

  return auditEntry;
};

/**
 * Main audit logging middleware
 */
const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Capture the original send method
  const originalSend = res.send;
  
  // Override the send method to capture response
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Only log if this is a sensitive endpoint or if there's an error
    if (requiresAuditLogging(req.originalUrl) || res.statusCode >= 400) {
      const auditEntry = createAuditEntry(req, res, responseTime);
      
      // Log to both Winston logger and audit file
      logger.info('AUDIT', auditEntry);
      
      // Write to dedicated audit log file asynchronously
      fs.appendFile(auditLogFile, JSON.stringify(auditEntry) + '\n')
        .catch(err => logger.error('Failed to write audit log:', err));
      
      // Log security events separately
      if (res.statusCode === 401 || res.statusCode === 403) {
        logger.warn('SECURITY_EVENT', {
          type: 'UNAUTHORIZED_ACCESS',
          ...auditEntry
        });
      }
      
      // Log data access events for GDPR compliance
      if (req.method === 'GET' && req.originalUrl.includes('/residents/')) {
        logger.info('DATA_ACCESS', {
          type: 'RESIDENT_DATA_ACCESS',
          residentId: req.params.id,
          ...extractUserInfo(req),
          timestamp: new Date().toISOString()
        });
      }
      
      // Log data modification events
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        logger.info('DATA_MODIFICATION', {
          type: 'DATA_CHANGE',
          action: req.method,
          resource: req.originalUrl,
          ...extractUserInfo(req),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Call the original send method
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * Specific audit functions for critical care events
 */
const auditCareEvent = (eventType, details, userId) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'CARE_EVENT',
    careEventType: eventType,
    userId,
    details: redactSensitiveData(details),
    compliance: {
      cqcRelevant: true,
      careQualityImpact: true
    }
  };
  
  logger.info('CARE_AUDIT', auditEntry);
  
  fs.appendFile(auditLogFile, JSON.stringify(auditEntry) + '\n')
    .catch(err => logger.error('Failed to write care audit log:', err));
};

/**
 * Audit incident reports for CQC compliance
 */
const auditIncident = (incidentDetails, reportedBy) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'INCIDENT_REPORT',
    incidentId: incidentDetails.id,
    severity: incidentDetails.severity,
    reportedBy,
    facilityId: incidentDetails.facilityId,
    compliance: {
      cqcNotificationRequired: incidentDetails.severity === 'critical',
      safeguardingRelevant: incidentDetails.type === 'safeguarding'
    }
  };
  
  logger.warn('INCIDENT_AUDIT', auditEntry);
  
  fs.appendFile(auditLogFile, JSON.stringify(auditEntry) + '\n')
    .catch(err => logger.error('Failed to write incident audit log:', err));
};

/**
 * Audit medication administration for safety tracking
 */
const auditMedication = (medicationDetails, administeredBy) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'MEDICATION_ADMINISTRATION',
    residentId: medicationDetails.residentId,
    medicationName: medicationDetails.name,
    dosage: medicationDetails.dosage,
    administeredBy,
    verifiedBy: medicationDetails.verifiedBy,
    compliance: {
      cqcRelevant: true,
      safetyMonitoring: true
    }
  };
  
  logger.info('MEDICATION_AUDIT', auditEntry);
  
  fs.appendFile(auditLogFile, JSON.stringify(auditEntry) + '\n')
    .catch(err => logger.error('Failed to write medication audit log:', err));
};

/**
 * Audit care plan changes for continuity tracking
 */
const auditCarePlanChange = (carePlanId, changes, modifiedBy) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'CARE_PLAN_MODIFICATION',
    carePlanId,
    changes: redactSensitiveData(changes),
    modifiedBy,
    compliance: {
      cqcRelevant: true,
      personCenteredCare: true
    }
  };
  
  logger.info('CARE_PLAN_AUDIT', auditEntry);
  
  fs.appendFile(auditLogFile, JSON.stringify(auditEntry) + '\n')
    .catch(err => logger.error('Failed to write care plan audit log:', err));
};

module.exports = {
  auditLogger,
  auditCareEvent,
  auditIncident,
  auditMedication,
  auditCarePlanChange,
  redactSensitiveData
};