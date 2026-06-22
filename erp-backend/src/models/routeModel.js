const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  areas: [{ type: String }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  status: { type: String, enum: ['active', 'inactive', 'on-hold'], default: 'active' },
  assignedAgent: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Database Indexes for performance optimization
routeSchema.index({ company: 1, isDeleted: 1 });
routeSchema.index({ company: 1, name: 1, isDeleted: 1 });
routeSchema.index({ company: 1, assignedAgent: 1, isDeleted: 1 });

module.exports = mongoose.model('Route', routeSchema);
