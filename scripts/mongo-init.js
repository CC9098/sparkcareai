// MongoDB Initialization Script for SparkCare AI Development
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
