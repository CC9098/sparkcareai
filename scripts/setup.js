#!/usr/bin/env node

/**
 * SparkCare AI Development Setup Script
 * 
 * This script sets up the development environment by:
 * - Creating necessary directories
 * - Setting up environment files
 * - Initializing the database
 * - Creating sample data
 * - Setting up SSL certificates for development
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const createDirectories = () => {
  log('\n📁 Creating necessary directories...', 'blue');
  
  const directories = [
    'logs',
    'uploads',
    'uploads/photos',
    'uploads/videos',
    'uploads/documents',
    'uploads/profiles',
    'uploads/temp',
    'backups',
    'client/src/components',
    'client/src/pages',
    'client/src/store',
    'client/src/utils',
    'client/src/hooks',
    'client/src/styles',
    'client/src/layouts',
    'server/middleware',
    'server/routes',
    'server/models',
    'server/config',
    'server/utils',
    'server/services',
    'server/scripts'
  ];
  
  directories.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      log(`✅ Created: ${dir}`, 'green');
    } else {
      log(`✓ Exists: ${dir}`, 'yellow');
    }
  });
};

const generateSecrets = () => {
  log('\n🔐 Generating security secrets...', 'blue');
  
  return {
    jwtSecret: crypto.randomBytes(64).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    sessionSecret: crypto.randomBytes(64).toString('hex'),
    aiWebhookSecret: crypto.randomBytes(32).toString('hex'),
    cqcWebhookSecret: crypto.randomBytes(32).toString('hex'),
    medicationWebhookSecret: crypto.randomBytes(32).toString('hex'),
    familyWebhookSecret: crypto.randomBytes(32).toString('hex'),
    externalWebhookSecret: crypto.randomBytes(32).toString('hex')
  };
};

const createEnvFile = () => {
  log('\n📝 Creating environment configuration...', 'blue');
  
  const envPath = path.join(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    log('⚠️  .env file already exists. Skipping...', 'yellow');
    return;
  }
  
  const secrets = generateSecrets();
  
  const envContent = `# ================================
# SparkCare AI Development Environment
# Generated on ${new Date().toISOString()}
# ================================

# Application Environment
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# ================================
# Database Configuration
# ================================

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/sparkcare-ai-dev
MONGODB_TEST_URI=mongodb://localhost:27017/sparkcare-ai-test

# ================================
# Security Configuration
# ================================

# JWT Authentication
JWT_SECRET=${secrets.jwtSecret}
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Data Encryption
ENCRYPTION_KEY=${secrets.encryptionKey}
ENCRYPTION_ALGORITHM=aes-256-gcm

# Session Security
SESSION_SECRET=${secrets.sessionSecret}

# ================================
# AI Services Configuration
# ================================

# AI Webhook Security
AI_WEBHOOK_SECRET=${secrets.aiWebhookSecret}

# Note: Add your AI service API keys here when ready
# OPENAI_API_KEY=your-openai-api-key
# AZURE_SPEECH_KEY=your-azure-speech-key
# AZURE_SPEECH_REGION=your-region

# ================================
# External System Integration
# ================================

# CQC Integration
CQC_WEBHOOK_SECRET=${secrets.cqcWebhookSecret}

# Medication Alerts
MEDICATION_WEBHOOK_SECRET=${secrets.medicationWebhookSecret}

# Family Portal
FAMILY_WEBHOOK_SECRET=${secrets.familyWebhookSecret}

# External Systems
EXTERNAL_WEBHOOK_SECRET=${secrets.externalWebhookSecret}

# ================================
# Email Configuration (Development)
# ================================

# For development, we'll use a test email service
# You can use services like Ethereal Email for testing
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ethereal-username
SMTP_PASS=your-ethereal-password

FROM_EMAIL=noreply@sparkcare-dev.local
FROM_NAME=SparkCare AI Development
SUPPORT_EMAIL=support@sparkcare-dev.local

# ================================
# File Storage Configuration
# ================================

# Local Storage (Development)
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf,doc,docx,mp4,webm

# ================================
# Logging Configuration
# ================================

LOG_LEVEL=debug
LOG_FILE=logs/application.log
ERROR_LOG_FILE=logs/error.log
AUDIT_LOG_FILE=logs/audit.log

# ================================
# Feature Flags (Development)
# ================================

# AI Features
ENABLE_VOICE_TO_TEXT=true
ENABLE_AI_INSIGHTS=true
ENABLE_PREDICTIVE_ANALYTICS=false

# Development Features
DEBUG_MODE=true
ENABLE_CORS=true
ENABLE_REQUEST_LOGGING=true

# Mock Services
MOCK_AI_SERVICES=true
MOCK_NHS_SERVICES=true
MOCK_EMAIL_SERVICE=true

# ================================
# Development Settings
# ================================

# Skip certain validations for easier development
SKIP_EMAIL_VERIFICATION=true
ALLOW_WEAK_PASSWORDS=false
ENABLE_DEV_ROUTES=true

# Auto-create admin user on startup
AUTO_CREATE_ADMIN=true
ADMIN_EMAIL=admin@sparkcare-dev.local
ADMIN_PASSWORD=DevAdmin123!
ADMIN_FACILITY_NAME=SparkCare Development Facility
`;

  fs.writeFileSync(envPath, envContent);
  log('✅ Created .env file with development configuration', 'green');
  log('🔑 Generated secure random secrets', 'green');
};

const createDockerCompose = () => {
  log('\n🐳 Creating Docker Compose configuration...', 'blue');
  
  const dockerComposePath = path.join(process.cwd(), 'docker-compose.dev.yml');
  
  if (fs.existsSync(dockerComposePath)) {
    log('⚠️  docker-compose.dev.yml already exists. Skipping...', 'yellow');
    return;
  }
  
  const dockerComposeContent = `version: '3.8'

services:
  # MongoDB Database
  mongodb:
    image: mongo:6.0
    container_name: sparkcare-mongodb-dev
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: sparkcare-ai-dev
    volumes:
      - mongodb_data:/data/db
      - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - sparkcare-network

  # Redis (for caching and job queues)
  redis:
    image: redis:7-alpine
    container_name: sparkcare-redis-dev
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - sparkcare-network

  # MongoDB Express (Database Admin UI)
  mongo-express:
    image: mongo-express:latest
    container_name: sparkcare-mongo-express-dev
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_MONGODB_PORT: 27017
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: sparkcare123
    depends_on:
      - mongodb
    networks:
      - sparkcare-network

  # Email Testing (MailHog)
  mailhog:
    image: mailhog/mailhog:latest
    container_name: sparkcare-mailhog-dev
    restart: unless-stopped
    ports:
      - "1025:1025"  # SMTP server
      - "8025:8025"  # Web UI
    networks:
      - sparkcare-network

volumes:
  mongodb_data:
  redis_data:

networks:
  sparkcare-network:
    driver: bridge
`;

  fs.writeFileSync(dockerComposePath, dockerComposeContent);
  log('✅ Created docker-compose.dev.yml for development services', 'green');
};

const createMongoInitScript = () => {
  log('\n🗄️  Creating MongoDB initialization script...', 'blue');
  
  const mongoInitPath = path.join(process.cwd(), 'scripts/mongo-init.js');
  
  const mongoInitContent = `// MongoDB Initialization Script for SparkCare AI Development
// This script creates the database and sets up initial indexes

print('Starting SparkCare AI database initialization...');

// Switch to the development database
db = db.getSiblingDB('sparkcare-ai-dev');

// Create collections and indexes for optimal performance
print('Creating collections and indexes...');

// Residents collection
db.residents.createIndex({ "personalId": 1 }, { unique: true });
db.residents.createIndex({ "nhsNumber": 1 }, { unique: true, sparse: true });
db.residents.createIndex({ "facility": 1, "status": 1 });
db.residents.createIndex({ "lastName": 1, "firstName": 1 });

// Staff collection
db.staff.createIndex({ "email": 1 }, { unique: true });
db.staff.createIndex({ "employeeId": 1 }, { unique: true });
db.staff.createIndex({ "facility": 1, "role": 1 });
db.staff.createIndex({ "facility": 1, "isActive": 1 });

// Daily logs collection
db.dailylogs.createIndex({ "logId": 1 }, { unique: true });
db.dailylogs.createIndex({ "resident": 1, "logTime": -1 });
db.dailylogs.createIndex({ "facility": 1, "logTime": -1 });
db.dailylogs.createIndex({ "carer": 1, "logTime": -1 });
db.dailylogs.createIndex({ "category": 1, "logTime": -1 });
db.dailylogs.createIndex({ "isIncident": 1, "logTime": -1 });

// Care plans collection
db.careplans.createIndex({ "planId": 1 }, { unique: true });
db.careplans.createIndex({ "resident": 1, "status": 1 });
db.careplans.createIndex({ "facility": 1, "nextReviewDate": 1 });

// Text search indexes
db.dailylogs.createIndex({ 
  "details": "text", 
  "item": "text", 
  "comments.comment": "text" 
});

print('Database initialization completed successfully!');
`;

  fs.writeFileSync(mongoInitPath, mongoInitContent);
  log('✅ Created MongoDB initialization script', 'green');
};

const createGitIgnore = () => {
  log('\n📄 Creating .gitignore file...', 'blue');
  
  const gitIgnorePath = path.join(process.cwd(), '.gitignore');
  
  if (fs.existsSync(gitIgnorePath)) {
    log('⚠️  .gitignore already exists. Skipping...', 'yellow');
    return;
  }
  
  const gitIgnoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage
.grunt

# Bower dependency directory
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
node_modules/
jspm_packages/

# TypeScript v1 declaration files
typings/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Uploads and user data
uploads/
!uploads/.gitkeep

# Backups
backups/
!backups/.gitkeep

# SSL certificates
*.pem
*.crt
*.key

# Database files
*.db
*.sqlite
*.sqlite3

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Test files
test-results/
coverage/

# Build outputs
build/
dist/
*.tgz

# React build
client/build/

# PWA files
client/public/sw.js
client/public/workbox-*.js

# Local development
.env.development
docker-compose.override.yml
`;

  fs.writeFileSync(gitIgnorePath, gitIgnoreContent);
  log('✅ Created .gitignore file', 'green');
};

const createKeepFiles = () => {
  log('\n📝 Creating .gitkeep files for empty directories...', 'blue');
  
  const keepDirs = [
    'uploads',
    'backups',
    'logs'
  ];
  
  keepDirs.forEach(dir => {
    const keepPath = path.join(process.cwd(), dir, '.gitkeep');
    if (!fs.existsSync(keepPath)) {
      fs.writeFileSync(keepPath, '# This file ensures the directory is tracked by Git\n');
      log(`✅ Created ${dir}/.gitkeep`, 'green');
    }
  });
};

const createPackageScripts = () => {
  log('\n📦 Adding helpful development scripts...', 'blue');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Add additional development scripts
  const additionalScripts = {
    "setup": "node scripts/setup.js",
    "dev:docker": "docker-compose -f docker-compose.dev.yml up -d",
    "dev:docker:down": "docker-compose -f docker-compose.dev.yml down",
    "dev:full": "npm run dev:docker && npm run dev",
    "db:reset": "node server/scripts/reset-db.js",
    "db:seed": "node server/scripts/seed-dev-data.js",
    "db:backup": "node server/scripts/backup-db.js",
    "logs:tail": "tail -f logs/application.log",
    "logs:error": "tail -f logs/error.log",
    "logs:audit": "tail -f logs/audit.log",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "security:audit": "npm audit",
    "security:fix": "npm audit fix",
    "docs:api": "node scripts/generate-api-docs.js",
    "clean": "rm -rf node_modules client/node_modules build client/build logs/*.log",
    "postinstall": "cd client && npm install"
  };
  
  packageJson.scripts = { ...packageJson.scripts, ...additionalScripts };
  
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  log('✅ Added development scripts to package.json', 'green');
};

const displayInstructions = () => {
  log('\n🎉 SparkCare AI Development Setup Complete!', 'green');
  log('\n📋 Next Steps:', 'cyan');
  log('1. Install MongoDB (if not using Docker):', 'white');
  log('   brew install mongodb/brew/mongodb-community  # macOS', 'yellow');
  log('   sudo apt-get install mongodb                 # Ubuntu', 'yellow');
  
  log('\n2. Start development services:', 'white');
  log('   npm run dev:docker    # Start MongoDB, Redis, etc. with Docker', 'yellow');
  log('   OR', 'white');
  log('   Start MongoDB manually if not using Docker', 'yellow');
  
  log('\n3. Install client dependencies:', 'white');
  log('   cd client && npm install', 'yellow');
  
  log('\n4. Start the development servers:', 'white');
  log('   npm run dev           # Start both backend and frontend', 'yellow');
  
  log('\n5. Access the application:', 'white');
  log('   🌐 Care Office: http://localhost:3000', 'cyan');
  log('   🏥 API Server: http://localhost:5000', 'cyan');
  log('   📊 MongoDB Admin: http://localhost:8081 (admin/sparkcare123)', 'cyan');
  log('   📧 Email Testing: http://localhost:8025', 'cyan');
  
  log('\n🔧 Useful Commands:', 'cyan');
  log('   npm run db:seed       # Add sample data', 'yellow');
  log('   npm run logs:tail     # View application logs', 'yellow');
  log('   npm run test:watch    # Run tests in watch mode', 'yellow');
  log('   npm run security:audit # Check for security issues', 'yellow');
  
  log('\n🔒 Default Admin Account (Auto-created):', 'cyan');
  log('   Email: admin@sparkcare-dev.local', 'yellow');
  log('   Password: DevAdmin123!', 'yellow');
  
  log('\n📚 Documentation:', 'cyan');
  log('   - README.md: Complete setup and usage guide', 'yellow');
  log('   - .env: Environment configuration (generated)', 'yellow');
  log('   - API Documentation: Will be available at /api/docs', 'yellow');
  
  log('\n⚠️  Security Notes:', 'magenta');
  log('   - Generated secrets are for development only', 'yellow');
  log('   - Change all passwords and secrets for production', 'yellow');
  log('   - Review .env file and update as needed', 'yellow');
  
  log('\n💡 Need Help?', 'cyan');
  log('   - Check the README.md for detailed instructions', 'yellow');
  log('   - Run: npm run dev:docker:down to stop services', 'yellow');
  log('   - Run: npm run clean to reset everything', 'yellow');
  
  log('\n🚀 Happy coding with SparkCare AI!', 'green');
};

const main = async () => {
  try {
    log('🏥 SparkCare AI Development Setup', 'magenta');
    log('=====================================', 'magenta');
    
    createDirectories();
    createEnvFile();
    createDockerCompose();
    createMongoInitScript();
    createGitIgnore();
    createKeepFiles();
    createPackageScripts();
    
    displayInstructions();
    
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
};

// Run the setup if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };