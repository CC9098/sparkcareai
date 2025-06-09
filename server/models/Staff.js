const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const trainingRecordSchema = new mongoose.Schema({
  title: { type: String, required: true },
  provider: { type: String },
  completedDate: { type: Date, required: true },
  expiryDate: { type: Date },
  certificateNumber: { type: String },
  isValid: { type: Boolean, default: true },
  documentPath: { type: String },
  category: {
    type: String,
    enum: ['Health & Safety', 'Manual Handling', 'Safeguarding', 'Medication', 'First Aid', 'Fire Safety', 'Infection Control', 'Other'],
    required: true
  }
});

const skillSchema = new mongoose.Schema({
  skill: { type: String, required: true },
  level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], required: true },
  certifiedDate: { type: Date },
  certifyingBody: { type: String },
  notes: { type: String }
});

const staffSchema = new mongoose.Schema({
  // Authentication & Security
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 8 },
  pin: { type: String, required: true, length: 4 }, // For Carer App digital signature
  
  // Basic Information
  employeeId: { type: String, unique: true, required: true },
  title: { type: String, enum: ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof'] },
  firstName: { type: String, required: true },
  middleName: { type: String },
  lastName: { type: String, required: true },
  preferredName: { type: String },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'], required: true },
  nationality: { type: String, default: 'British' },
  
  // Contact Information
  phone: { type: String, required: true },
  mobile: { type: String },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    county: { type: String },
    postcode: { type: String, required: true },
    country: { type: String, default: 'United Kingdom' }
  },
  
  // Emergency Contact
  emergencyContact: {
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String }
  },
  
  // Employment Information
  role: {
    type: String,
    enum: ['Carer', 'Senior Carer', 'Manager', 'Administrator', 'Nurse', 'Activities Coordinator', 'Maintenance', 'Kitchen Staff', 'Housekeeping'],
    required: true
  },
  accessLevel: {
    type: String,
    enum: ['Carer', 'Senior', 'Admin'],
    required: true
  },
  department: { type: String },
  startDate: { type: Date, required: true },
  contractType: { type: String, enum: ['Full-time', 'Part-time', 'Bank', 'Agency', 'Volunteer'], required: true },
  contractEndDate: { type: Date },
  salary: { type: Number },
  
  // Professional Registration
  professionalRegistration: {
    body: { type: String }, // e.g., 'NMC', 'HCPC'
    registrationNumber: { type: String },
    expiryDate: { type: Date },
    isValid: { type: Boolean, default: true }
  },
  
  // DBS Check
  dbsCheck: {
    certificateNumber: { type: String },
    level: { type: String, enum: ['Basic', 'Standard', 'Enhanced', 'Enhanced with Barred Lists'] },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    status: { type: String, enum: ['Clear', 'Conditional', 'Pending', 'Expired'], default: 'Pending' }
  },
  
  // Training and Skills
  trainingRecords: [trainingRecordSchema],
  skills: [skillSchema],
  mandatoryTrainingCompliance: { type: Number, default: 0 }, // Percentage
  
  // Work Preferences
  workPreferences: {
    availableDays: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
    preferredShifts: [{ type: String, enum: ['Day', 'Evening', 'Night', 'Weekend'] }],
    maxHoursPerWeek: { type: Number },
    willingForOvertime: { type: Boolean, default: false },
    willingForOnCall: { type: Boolean, default: false }
  },
  
  // Assigned Areas and Residents
  assignedZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
  assignedResidents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Resident' }],
  
  // Access Control
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  loginAttempts: { type: Number, default: 0 },
  accountLocked: { type: Boolean, default: false },
  lockUntil: { type: Date },
  
  // Password and PIN Management
  passwordChangedAt: { type: Date, default: Date.now },
  pinChangedAt: { type: Date, default: Date.now },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  
  // Device Access Control
  authorizedDevices: [{
    deviceId: { type: String, required: true },
    deviceName: { type: String },
    lastUsed: { type: Date },
    location: { type: String },
    appVersion: { type: String },
    isActive: { type: Boolean, default: true },
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    authorizedDate: { type: Date, default: Date.now }
  }],
  
  // Profile and Documents
  profilePhoto: {
    path: { type: String },
    uploadedDate: { type: Date }
  },
  documents: [{
    name: { type: String, required: true },
    type: { type: String, required: true },
    path: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    uploadedDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    isConfidential: { type: Boolean, default: true }
  }],
  
  // Facility and Audit
  facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.pin;
      delete ret.passwordResetToken;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtuals
staffSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

staffSchema.virtual('displayName').get(function() {
  return this.preferredName || this.firstName;
});

staffSchema.virtual('age').get(function() {
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

staffSchema.virtual('expiringTraining').get(function() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  return this.trainingRecords.filter(training => 
    training.expiryDate && 
    training.expiryDate <= thirtyDaysFromNow && 
    training.isValid
  );
});

staffSchema.virtual('isAccountLocked').get(function() {
  return !!(this.accountLocked && this.lockUntil && this.lockUntil > Date.now());
});

// Indexes
staffSchema.index({ email: 1 });
staffSchema.index({ employeeId: 1 });
staffSchema.index({ facility: 1, role: 1 });
staffSchema.index({ facility: 1, isActive: 1 });
staffSchema.index({ lastName: 1, firstName: 1 });

// Password hashing middleware
staffSchema.pre('save', async function(next) {
  // Only hash password if it's been modified
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// PIN hashing middleware
staffSchema.pre('save', async function(next) {
  if (!this.isModified('pin')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.pin = await bcrypt.hash(this.pin, salt);
    this.pinChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Generate employee ID
staffSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    const count = await this.constructor.countDocuments({ facility: this.facility });
    this.employeeId = `EMP${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

// Methods
staffSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

staffSchema.methods.comparePIN = async function(candidatePIN) {
  return await bcrypt.compare(candidatePIN, this.pin);
};

staffSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isAccountLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
      accountLocked: true
    };
  }
  
  return this.updateOne(updates);
};

staffSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { accountLocked: false, lastLogin: new Date() }
  });
};

staffSchema.methods.hasPermission = function(permission) {
  const permissions = {
    'Carer': ['view_residents', 'create_logs', 'view_care_plans', 'complete_tasks'],
    'Senior': ['view_residents', 'create_logs', 'view_care_plans', 'complete_tasks', 'create_care_plans', 'view_reports', 'manage_tasks'],
    'Admin': ['*'] // Full access
  };
  
  const userPermissions = permissions[this.accessLevel] || [];
  return userPermissions.includes('*') || userPermissions.includes(permission);
};

module.exports = mongoose.model('Staff', staffSchema);