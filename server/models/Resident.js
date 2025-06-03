const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  relationship: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  address: { type: String },
  isPrimary: { type: Boolean, default: false }
});

const medicalHistorySchema = new mongoose.Schema({
  condition: { type: String, required: true },
  diagnosedDate: { type: Date },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  addedDate: { type: Date, default: Date.now }
});

const dolsLpsSchema = new mongoose.Schema({
  type: { type: String, enum: ['DoLS', 'LPS'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  reviewDate: { type: Date, required: true },
  status: { type: String, enum: ['Active', 'Expired', 'Under Review'], required: true },
  authorisingBody: { type: String, required: true },
  conditions: [{ type: String }],
  notes: { type: String }
});

const residentSchema = new mongoose.Schema({
  // Basic Information
  personalId: { type: String, unique: true, required: true },
  title: { type: String, enum: ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'] },
  firstName: { type: String, required: true },
  middleName: { type: String },
  lastName: { type: String, required: true },
  preferredName: { type: String },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'], required: true },
  nationality: { type: String },
  religion: { type: String },
  language: { type: String, default: 'English' },
  
  // Contact Information
  nhsNumber: { type: String, unique: true, sparse: true },
  address: {
    street: { type: String },
    city: { type: String },
    county: { type: String },
    postcode: { type: String },
    country: { type: String, default: 'United Kingdom' }
  },
  
  // Emergency Contacts
  emergencyContacts: [emergencyContactSchema],
  
  // Medical Information
  medicalHistory: [medicalHistorySchema],
  allergies: [{
    allergen: { type: String, required: true },
    reaction: { type: String, required: true },
    severity: { type: String, enum: ['Mild', 'Moderate', 'Severe'], required: true },
    notes: { type: String }
  }],
  
  // GP Information
  gp: {
    name: { type: String },
    practice: { type: String },
    phone: { type: String },
    address: { type: String }
  },
  
  // Care Information
  admissionDate: { type: Date, required: true },
  carePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan' }],
  riskAssessments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' }],
  dailyLogs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DailyLog' }],
  goals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Goal' }],
  
  // DoLS/LPS Information
  dolsLps: [dolsLpsSchema],
  
  // Preferences and Personal Details
  preferences: {
    dietary: [{ type: String }],
    activities: [{ type: String }],
    routine: { type: String },
    roomPreferences: { type: String },
    visitingPreferences: { type: String }
  },
  
  // Care Level and Funding
  careLevel: {
    type: String,
    enum: ['Residential', 'Nursing', 'Dementia', 'Learning Disability', 'Mental Health'],
    required: true
  },
  fundingType: {
    type: String,
    enum: ['Private', 'Local Authority', 'NHS', 'Mixed'],
    required: true
  },
  
  // Room Assignment
  room: {
    number: { type: String },
    floor: { type: String },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }
  },
  
  // Assigned Staff
  primaryCarer: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
  
  // Status and Documents
  status: {
    type: String,
    enum: ['Active', 'Temporary Leave', 'Discharged', 'Deceased', 'Archived'],
    default: 'Active'
  },
  documents: [{
    name: { type: String, required: true },
    type: { type: String, required: true },
    path: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    uploadedDate: { type: Date, default: Date.now },
    isConfidential: { type: Boolean, default: false }
  }],
  
  // Profile Photo
  profilePhoto: {
    path: { type: String },
    uploadedDate: { type: Date }
  },
  
  // Audit Trail
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
residentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
residentSchema.virtual('age').get(function() {
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Virtual for active DoLS/LPS
residentSchema.virtual('activeDoLsLps').get(function() {
  return this.dolsLps.filter(d => d.status === 'Active' && new Date(d.endDate) > new Date());
});

// Indexes for performance
residentSchema.index({ personalId: 1 });
residentSchema.index({ nhsNumber: 1 });
residentSchema.index({ facility: 1, status: 1 });
residentSchema.index({ lastName: 1, firstName: 1 });
residentSchema.index({ 'room.number': 1 });

// Pre-save middleware for generating personalId
residentSchema.pre('save', async function(next) {
  if (this.isNew && !this.personalId) {
    const count = await this.constructor.countDocuments({ facility: this.facility });
    this.personalId = `RES${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Resident', residentSchema);