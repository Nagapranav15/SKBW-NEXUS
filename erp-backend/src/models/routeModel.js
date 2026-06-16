const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  areas: [{ type: String }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  status: { type: String, enum: ['active', 'inactive', 'on-hold'], default: 'active' },
  assignedAgent: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema);
