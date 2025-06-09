const mongoose = require('mongoose');

const strengthSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['Physical', 'Cognitive', 'Social', 'Emotional', 'Spiritual', 'Other'], required: true },
  impact: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  addedDate: { type: Date, default: Date.now }
});

const needSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['Personal Care', 'Health', 'Social', 'Emotional', 'Safety', 'Mobility', 'Communication', 'Nutrition', 'Other'], required: true },
  priority: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
  goalTargetDate: { type: Date },
  status: { type: String, enum: ['Active', 'Met', 'On Hold', 'Discontinued'], default: 'Active' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  addedDate: { type: Date, default: Date.now }
});

const riskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['Falls', 'Medication', 'Nutrition', 'Skin Integrity', 'Behavioral', 'Environmental', 'Medical', 'Other'], required: true },
  riskLevel: { type: String, enum: ['Very High', 'High', 'Medium', 'Low'], required: true },
  likelihood: { type: String, enum: ['Very Likely', 'Likely', 'Possible', 'Unlikely'], required: true },
  impact: { type: String, enum: ['Severe', 'Major', 'Moderate', 'Minor'], required: true },
  riskScore: { type: Number, min: 1, max: 25 }, // Calculated from likelihood x impact
  mitigationStrategies: [{ type: String }],
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  addedDate: { type: Date, default: Date.now }
});

const actionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['Direct Care', 'Health Management', 'Social Activities', 'Family Liaison', 'Environmental', 'Equipment', 'Other'], required: true },
  frequency: { type: String, enum: ['Continuous', 'Daily', 'Weekly', 'Monthly', 'As Required', 'One-off'], required: true },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
  priority: { type: String, enum: ['Urgent', 'High', 'Medium', 'Low'], required: true },
  status: { type: String, enum: ['Active', 'Completed', 'On Hold', 'Discontinued'], default: 'Active' },
  targetDate: { type: Date },
  completedDate: { type: Date },
  notes: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  addedDate: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
  reviewDate: { type: Date, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  changes: { type: String },
  nextReviewDate: { type: Date, required: true },
  reviewType: { type: String, enum: ['Scheduled', 'Ad-hoc', 'Incident Triggered', 'Regulatory'], required: true },
  residentInvolved: { type: Boolean, default: false },
  familyInvolved: { type: Boolean, default: false },
  notes: { type: String }
});

const readReceiptSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  readDate: { type: Date, default: Date.now },
  version: { type: Number, required: true }
});

const carePlanSchema = new mongoose.Schema({
  // Basic Information
  planId: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
  
  // Template Information
  templateUsed: {
    name: { type: String },
    category: { type: String },
    version: { type: String },
    isCustom: { type: Boolean, default: false }
  },
  
  // Plan Components
  strengths: [strengthSchema],
  needs: [needSchema],
  risks: [riskSchema],
  actions: [actionSchema],
  
  // Plan Status and Dates
  status: { 
    type: String, 
    enum: ['Draft', 'Active', 'Under Review', 'Archived', 'Superseded'], 
    default: 'Draft' 
  },
  planDate: { type: Date, required: true },
  reviewDate: { type: Date, required: true },
  nextReviewDate: { type: Date, required: true },
  effectiveDate: { type: Date },
  expiryDate: { type: Date },
  
  // Linked Documents and Assessments
  linkedRiskAssessments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' }],
  linkedGoals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Goal' }],
  linkedDocuments: [{
    name: { type: String, required: true },
    path: { type: String, required: true },
    type: { type: String, required: true },
    uploadedDate: { type: Date, default: Date.now }
  }],
  
  // Person-Centered Care
  residentPreferences: {
    communicationStyle: { type: String },
    culturalNeeds: [{ type: String }],
    religiousNeeds: [{ type: String }],
    dietaryPreferences: [{ type: String }],
    activityPreferences: [{ type: String }],
    routinePreferences: { type: String }
  },
  
  // Family and Support Network
  familyInvolvement: {
    primaryContact: { type: String },
    visitingArrangements: { type: String },
    communicationPreferences: { type: String },
    decisionMakingRole: { type: String }
  },
  
  // Digital Signatures
  residentSignature: {
    signedBy: { type: String }, // Resident name or representative
    signatureDate: { type: Date },
    signatureMethod: { type: String, enum: ['Digital', 'Scanned', 'Witnessed'], default: 'Digital' },
    witnessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    consentGiven: { type: Boolean, default: false },
    notes: { type: String }
  },
  
  // Review History
  reviews: [reviewSchema],
  
  // Read Receipts and Acknowledgments
  readReceipts: [readReceiptSchema],
  currentVersion: { type: Number, default: 1 },
  
  // Quality and Compliance
  cqcStandards: [{
    standard: { type: String, required: true },
    met: { type: Boolean, required: true },
    evidence: { type: String },
    notes: { type: String }
  }],
  
  // Audit Trail
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
  
  // Version Control
  previousVersions: [{
    version: { type: Number, required: true },
    archivedDate: { type: Date, default: Date.now },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    reasonForChange: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed } // Snapshot of the previous version
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
carePlanSchema.virtual('totalRisks').get(function() {
  return this.risks.length;
});

carePlanSchema.virtual('highRisks').get(function() {
  return this.risks.filter(risk => risk.riskLevel === 'Very High' || risk.riskLevel === 'High').length;
});

carePlanSchema.virtual('overdueTasks').get(function() {
  const today = new Date();
  return this.actions.filter(action => 
    action.status === 'Active' && 
    action.targetDate && 
    action.targetDate < today
  ).length;
});

carePlanSchema.virtual('isOverdueForReview').get(function() {
  return this.nextReviewDate && this.nextReviewDate < new Date();
});

carePlanSchema.virtual('daysUntilReview').get(function() {
  if (!this.nextReviewDate) return null;
  const today = new Date();
  const timeDiff = this.nextReviewDate.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

carePlanSchema.virtual('completionPercentage').get(function() {
  if (this.actions.length === 0) return 0;
  const completedActions = this.actions.filter(action => action.status === 'Completed').length;
  return Math.round((completedActions / this.actions.length) * 100);
});

// Indexes
carePlanSchema.index({ planId: 1 });
carePlanSchema.index({ resident: 1, status: 1 });
carePlanSchema.index({ facility: 1, status: 1 });
carePlanSchema.index({ nextReviewDate: 1 });
carePlanSchema.index({ 'templateUsed.name': 1 });

// Pre-save middleware for plan ID generation
carePlanSchema.pre('save', async function(next) {
  if (this.isNew && !this.planId) {
    const count = await this.constructor.countDocuments({ facility: this.facility });
    this.planId = `CP${(count + 1).toString().padStart(6, '0')}`;
  }
  
  // Calculate risk scores
  this.risks.forEach(risk => {
    const likelihoodScores = { 'Very Likely': 5, 'Likely': 4, 'Possible': 3, 'Unlikely': 2, 'Very Unlikely': 1 };
    const impactScores = { 'Severe': 5, 'Major': 4, 'Moderate': 3, 'Minor': 2, 'Negligible': 1 };
    
    const likelihoodScore = likelihoodScores[risk.likelihood] || 3;
    const impactScore = impactScores[risk.impact] || 3;
    risk.riskScore = likelihoodScore * impactScore;
  });
  
  next();
});

// Methods
carePlanSchema.methods.addReadReceipt = function(staffId) {
  // Remove existing read receipt for this staff member for current version
  this.readReceipts = this.readReceipts.filter(receipt => 
    !receipt.staff.equals(staffId) || receipt.version !== this.currentVersion
  );
  
  // Add new read receipt
  this.readReceipts.push({
    staff: staffId,
    version: this.currentVersion,
    readDate: new Date()
  });
  
  return this.save();
};

carePlanSchema.methods.createNewVersion = function(reasonForChange, updatedBy) {
  // Archive current version
  this.previousVersions.push({
    version: this.currentVersion,
    archivedBy: updatedBy,
    reasonForChange: reasonForChange,
    data: this.toObject()
  });
  
  // Increment version
  this.currentVersion += 1;
  this.updatedBy = updatedBy;
  
  // Clear read receipts for new version
  this.readReceipts = [];
  
  return this;
};

carePlanSchema.methods.getStaffReadStatus = function(staffId) {
  const receipt = this.readReceipts.find(r => 
    r.staff.equals(staffId) && r.version === this.currentVersion
  );
  return receipt ? receipt.readDate : null;
};

module.exports = mongoose.model('CarePlan', carePlanSchema);