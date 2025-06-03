const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// MongoDB Memory Server for development
const { MongoMemoryServer } = require('mongodb-memory-server');

const authRoutes = require('./routes/auth');
const residentsRoutes = require('./routes/residents');
const carePlansRoutes = require('./routes/carePlans');
const riskAssessmentsRoutes = require('./routes/riskAssessments');
const dailyLogsRoutes = require('./routes/dailyLogs');
const tasksRoutes = require('./routes/tasks');
const staffRoutes = require('./routes/staff');
const reportsRoutes = require('./routes/reports');
const aiRoutes = require('./routes/ai');
const webhooksRoutes = require('./routes/webhooks');

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const auditLogger = require('./middleware/auditLogger');
const logger = require('./config/logger');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// Rate limiting for API endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  optionsSuccessStatus: 200
}));

// General middleware
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit logging middleware
app.use(auditLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/residents', authMiddleware, residentsRoutes);
app.use('/api/care-plans', authMiddleware, carePlansRoutes);
app.use('/api/risk-assessments', authMiddleware, riskAssessmentsRoutes);
app.use('/api/daily-logs', authMiddleware, dailyLogsRoutes);
app.use('/api/tasks', authMiddleware, tasksRoutes);
app.use('/api/staff', authMiddleware, staffRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);
app.use('/api/webhooks', webhooksRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found on this server.',
    path: req.originalUrl
  });
});

// Socket.io connection handling for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join-facility', (facilityId) => {
    socket.join(`facility:${facilityId}`);
    logger.info(`Socket ${socket.id} joined facility: ${facilityId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// MongoDB connection
const connectDatabase = async () => {
  try {
    let mongoUri;
    
    if (process.env.NODE_ENV === 'development' && process.env.MONGODB_URI === 'mongodb://memory') {
      logger.info('Starting MongoDB Memory Server for development...');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      logger.info(`MongoDB Memory Server started at: ${mongoUri}`);
    } else {
      mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sparkcare-ai';
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Connected to MongoDB');
    
    // Auto-create admin user if enabled
    if (process.env.AUTO_CREATE_ADMIN === 'true') {
      await createDefaultAdmin();
    }
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Create default admin user for development
const createDefaultAdmin = async () => {
  try {
    const Staff = require('./models/Staff');
    const bcrypt = require('bcryptjs');
    
    const existingAdmin = await Staff.findOne({ 
      email: process.env.ADMIN_EMAIL || 'admin@sparkcare-dev.local' 
    });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || 'DevAdmin123!', 
        12
      );
      
      const adminUser = new Staff({
        email: process.env.ADMIN_EMAIL || 'admin@sparkcare-dev.local',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'Admin',
        facilityId: 'default-facility',
        isActive: true,
        emailVerified: true
      });
      
      await adminUser.save();
      logger.info('Default admin user created:', {
        email: adminUser.email,
        role: adminUser.role
      });
    }
  } catch (error) {
    logger.error('Error creating default admin:', error);
  }
};

connectDatabase();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    mongoose.connection.close();
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`SparkCare AI Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, io };