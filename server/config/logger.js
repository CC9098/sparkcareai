const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label']
  }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    const meta = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${meta}`;
  })
);

// Audit log format (compliance-ready)
const auditFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.json(),
  winston.format.printf((info) => {
    return JSON.stringify({
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      userId: info.userId || null,
      facility: info.facility || null,
      action: info.action || null,
      resource: info.resource || null,
      resourceId: info.resourceId || null,
      ip: info.ip || null,
      userAgent: info.userAgent || null,
      result: info.result || null,
      metadata: info.metadata || {}
    });
  })
);

// Create the main logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'sparkcare-ai',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Application logs
    new winston.transports.File({
      filename: path.join(logsDir, 'application.log'),
      level: 'info',
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 3
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create audit logger for compliance
const auditLogger = winston.createLogger({
  level: 'info',
  format: auditFormat,
  defaultMeta: { 
    service: 'sparkcare-ai-audit',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 20, // Keep for compliance (7+ years)
      tailable: true
    })
  ]
});

// Create security logger for security events
const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'sparkcare-ai-security',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Create performance logger
const performanceLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'sparkcare-ai-performance',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Helper functions for structured logging

/**
 * Log user authentication events
 */
const logAuth = (action, userId, email, result, metadata = {}) => {
  auditLogger.info('Authentication event', {
    action: action,
    userId: userId,
    email: email,
    result: result,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log data access events (GDPR compliance)
 */
const logDataAccess = (userId, action, resource, resourceId, result, metadata = {}) => {
  auditLogger.info('Data access event', {
    userId: userId,
    action: action,
    resource: resource,
    resourceId: resourceId,
    result: result,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log care events (care delivery, plan updates, etc.)
 */
const logCareEvent = (userId, action, residentId, eventType, metadata = {}) => {
  auditLogger.info('Care event', {
    userId: userId,
    action: action,
    resource: 'resident',
    resourceId: residentId,
    eventType: eventType,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log security events
 */
const logSecurity = (event, severity, userId, metadata = {}) => {
  securityLogger.warn('Security event', {
    event: event,
    severity: severity,
    userId: userId,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log performance metrics
 */
const logPerformance = (endpoint, method, duration, status, metadata = {}) => {
  performanceLogger.info('Performance metric', {
    endpoint: endpoint,
    method: method,
    duration: duration,
    status: status,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log system events
 */
const logSystem = (event, level = 'info', metadata = {}) => {
  logger[level]('System event', {
    event: event,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log AI/ML events
 */
const logAI = (action, model, input, output, confidence, metadata = {}) => {
  logger.info('AI event', {
    action: action,
    model: model,
    input: input,
    output: output,
    confidence: confidence,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Log compliance events
 */
const logCompliance = (standard, check, result, score, metadata = {}) => {
  auditLogger.info('Compliance check', {
    standard: standard,
    check: check,
    result: result,
    score: score,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

// Express middleware for request logging
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log incoming request
  logger.http('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    facility: req.user?.facility || null
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    // Log response
    logger.http('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous'
    });
    
    // Log performance metric
    logPerformance(req.originalUrl, req.method, duration, res.statusCode, {
      userId: req.user?.id,
      ip: req.ip
    });
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Error logging helper
const logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
};

// Graceful shutdown function
const gracefulShutdown = () => {
  logger.info('Shutting down logging system');
  
  return Promise.all([
    new Promise((resolve) => logger.end(resolve)),
    new Promise((resolve) => auditLogger.end(resolve)),
    new Promise((resolve) => securityLogger.end(resolve)),
    new Promise((resolve) => performanceLogger.end(resolve))
  ]);
};

// Log rotation cleanup (runs daily)
const cleanupOldLogs = () => {
  const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  logger.info('Log cleanup started', {
    retentionDays: retentionDays,
    cutoffDate: cutoffDate.toISOString()
  });
  
  // TODO: Implement log file cleanup logic
  // This would remove log files older than the retention period
};

module.exports = {
  logger,
  auditLogger,
  securityLogger,
  performanceLogger,
  logAuth,
  logDataAccess,
  logCareEvent,
  logSecurity,
  logPerformance,
  logSystem,
  logAI,
  logCompliance,
  requestLogger,
  logError,
  gracefulShutdown,
  cleanupOldLogs
};