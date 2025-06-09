const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['photo', 'video'], required: true },
  path: { type: String, required: true },
  filename: { type: String, required: true },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  description: { type: String }
});

const chartDataSchema = new mongoose.Schema({
  chartType: { 
    type: String, 
    enum: ['food', 'fluid', 'bloodPressure', 'heartRate', 'temperature', 'weight', 'mood', 'sleep', 'pain', 'mobility', 'bowel', 'waterlow', 'must', 'oxygen'], 
    required: true 
  },
  value: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be string, number, or object
  unit: { type: String },
  time: { type: Date, default: Date.now },
  notes: { type: String }
});

const dailyLogSchema = new mongoose.Schema({
  // Basic Information
  logId: { type: String, unique: true, required: true },
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
  carer: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  
  // Log Details
  category: {
    type: String,
    enum: [
      'Personal Care',
      'Health & Medical',
      'Nutrition & Hydration',
      'Medication',
      'Social & Activities',
      'Behavioral Observation',
      'Communication',
      'Safety & Incidents',
      'Mobility & Exercise',
      'Sleep & Rest',
      'Emotional Wellbeing',
      'Family Contact',
      'Professional Visits',
      'General Care',
      'Other'
    ],
    required: true
  },
  
  item: { type: String, required: true },
  details: { type: String, required: true },
  
  // Additional Information
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  mood: { type: String, enum: ['Very Happy', 'Happy', 'Content', 'Neutral', 'Anxious', 'Sad', 'Distressed'] },
  painLevel: { type: Number, min: 0, max: 10 },
  
  // Time and Location
  logTime: { type: Date, required: true },
  shift: { type: String, enum: ['Day', 'Evening', 'Night'], required: true },
  location: { type: String },
  
  // Media Attachments
  media: [mediaSchema],
  
  // Chart Data Integration
  chartData: [chartDataSchema],
  
  // Links and References
  linkedGoals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Goal' }],
  linkedCarePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan' }],
  linkedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  
  // Incident/Event Flags
  isIncident: { type: Boolean, default: false },
  incidentType: { 
    type: String, 
    enum: ['Fall', 'Medication Error', 'Behavior Issue', 'Injury', 'Missing Person', 'Equipment Failure', 'Other'],
    required: function() { return this.isIncident; }
  },
  requiresFollowUp: { type: Boolean, default: false },
  followUpBy: { type: Date },
  followUpAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  
  // Handover and Communication
  isForHandover: { type: Boolean, default: false },
  handoverPriority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  readByHandover: [{ 
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // Quality and Compliance
  requiresManagerReview: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  reviewedAt: { type: Date },
  reviewNotes: { type: String },
  
  // Additional Comments and Updates
  comments: [{
    comment: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    addedAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
  }],
  
  // Status and Workflow
  status: { 
    type: String, 
    enum: ['Active', 'Archived', 'Flagged', 'Under Review'], 
    default: 'Active' 
  },
  
  // AI Enhancement Fields
  aiGenerated: { type: Boolean, default: false },
  aiConfidence: { type: Number, min: 0, max: 1 },
  aiSuggestions: [{
    type: { type: String, required: true },
    suggestion: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1 },
    applied: { type: Boolean, default: false }
  }],
  
  // Voice-to-Text
  voiceToText: {
    originalTranscript: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
    wasEdited: { type: Boolean, default: false }
  },
  
  // Tags and Keywords
  tags: [{ type: String }],
  keywords: [{ type: String }],
  
  // Audit Trail
  facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  lastModified: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
dailyLogSchema.virtual('hasMedia').get(function() {
  return this.media && this.media.length > 0;
});

dailyLogSchema.virtual('isRecent').get(function() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.logTime > twentyFourHoursAgo;
});

dailyLogSchema.virtual('isOverdue').get(function() {
  return this.requiresFollowUp && this.followUpBy && this.followUpBy < new Date();
});

dailyLogSchema.virtual('timeSinceLog').get(function() {
  const now = new Date();
  const logTime = new Date(this.logTime);
  const diffMs = now - logTime;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
});

// Indexes for performance
dailyLogSchema.index({ logId: 1 });
dailyLogSchema.index({ resident: 1, logTime: -1 });
dailyLogSchema.index({ facility: 1, logTime: -1 });
dailyLogSchema.index({ carer: 1, logTime: -1 });
dailyLogSchema.index({ category: 1, logTime: -1 });
dailyLogSchema.index({ shift: 1, logTime: -1 });
dailyLogSchema.index({ isIncident: 1, logTime: -1 });
dailyLogSchema.index({ isForHandover: 1, logTime: -1 });
dailyLogSchema.index({ requiresFollowUp: 1, followUpBy: 1 });
dailyLogSchema.index({ tags: 1 });

// Text search index
dailyLogSchema.index({ 
  details: 'text', 
  item: 'text', 
  'comments.comment': 'text',
  tags: 'text' 
});

// Pre-save middleware
dailyLogSchema.pre('save', async function(next) {
  // Generate log ID
  if (this.isNew && !this.logId) {
    const count = await this.constructor.countDocuments({ facility: this.facility });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.logId = `LOG${date}${(count + 1).toString().padStart(4, '0')}`;
  }
  
  // Auto-determine shift based on log time
  if (this.isNew || this.isModified('logTime')) {
    const hour = new Date(this.logTime).getHours();
    if (hour >= 6 && hour < 14) this.shift = 'Day';
    else if (hour >= 14 && hour < 22) this.shift = 'Evening';
    else this.shift = 'Night';
  }
  
  // Auto-flag for manager review if incident or high priority
  if (this.isIncident || this.priority === 'Urgent') {
    this.requiresManagerReview = true;
  }
  
  // Update last modified
  this.lastModified = new Date();
  
  next();
});

// Methods
dailyLogSchema.methods.addComment = function(comment, staffId, isPrivate = false) {
  this.comments.push({
    comment: comment,
    addedBy: staffId,
    isPrivate: isPrivate
  });
  return this.save();
};

dailyLogSchema.methods.markAsRead = function(staffId) {
  if (!this.readByHandover.some(r => r.staff.equals(staffId))) {
    this.readByHandover.push({ staff: staffId });
    return this.save();
  }
  return Promise.resolve(this);
};

dailyLogSchema.methods.linkToGoal = function(goalId) {
  if (!this.linkedGoals.includes(goalId)) {
    this.linkedGoals.push(goalId);
    return this.save();
  }
  return Promise.resolve(this);
};

dailyLogSchema.methods.addChartData = function(chartType, value, unit, notes) {
  this.chartData.push({
    chartType: chartType,
    value: value,
    unit: unit,
    notes: notes
  });
  return this.save();
};

dailyLogSchema.methods.generateAISummary = function() {
  // Placeholder for AI integration
  return {
    summary: `${this.category} log for ${this.item}`,
    sentiment: this.mood || 'neutral',
    keyPoints: [this.details.substring(0, 50) + '...'],
    suggestedActions: []
  };
};

// Static methods
dailyLogSchema.statics.getLogsForHandover = function(facilityId, shift) {
  return this.find({
    facility: facilityId,
    isForHandover: true,
    shift: shift,
    status: 'Active'
  }).populate('resident carer').sort({ logTime: -1 });
};

dailyLogSchema.statics.getIncidentLogs = function(facilityId, dateFrom, dateTo) {
  const query = {
    facility: facilityId,
    isIncident: true,
    status: 'Active'
  };
  
  if (dateFrom || dateTo) {
    query.logTime = {};
    if (dateFrom) query.logTime.$gte = new Date(dateFrom);
    if (dateTo) query.logTime.$lte = new Date(dateTo);
  }
  
  return this.find(query).populate('resident carer').sort({ logTime: -1 });
};

dailyLogSchema.statics.getResidentTimeline = function(residentId, dateFrom, dateTo) {
  const query = {
    resident: residentId,
    status: 'Active'
  };
  
  if (dateFrom || dateTo) {
    query.logTime = {};
    if (dateFrom) query.logTime.$gte = new Date(dateFrom);
    if (dateTo) query.logTime.$lte = new Date(dateTo);
  }
  
  return this.find(query).populate('carer').sort({ logTime: -1 });
};

module.exports = mongoose.model('DailyLog', dailyLogSchema);