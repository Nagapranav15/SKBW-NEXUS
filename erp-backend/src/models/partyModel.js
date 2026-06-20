const mongoose = require("mongoose");

const partySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["customer", "vendor", "staff", "employee", "agent", "market", "transporter"],
    required: true
  },
  firmName: {
    type: String,
    default: ""
  },
  ownerName: {
    type: String,
    default: ""
  },
  contactName: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: false
  },
  altPhone: {
    type: String,
    default: ""
  },
  email: {
    type: String,
    default: "",
    trim: true,
    lowercase: true
  },
  doorNo: { type: String, default: "" },
  streetName: { type: String, default: "" },
  address1: { type: String, default: "" },
  area: { type: String, default: "" },
  landmark: { type: String, default: "" },
  city: { type: String, default: "" },
  district: { type: String, default: "" },
  state: { type: String, default: "" },
  pincode: { type: String, default: "" },
  agentAssigned: { type: String, default: "" },
  assignedMarket: { type: String, default: "" },
  group: { type: String, default: "" },
  designation: { type: String, default: "" },
  department: { type: String, default: "" },
  whatsapp: { type: String, default: "" },
  vendorType: { type: String, default: "" },
  remarks: { type: String, default: "" },
  code: { type: String, default: "" },
  gstNumber: { type: String, default: "" },
  aadharNumber: { type: String, default: "" },
  openingBalance: {
    type: Number
  },
  route: { type: String, default: '' },
  creditLimit: { type: Number },
  creditDays: { type: Number, default: 0 },
  outstanding: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
  preferredTransport: { type: String, default: '' },
  gpsLocation: { type: String, default: '' },
  customerPhoto: { type: String, default: '' },
  shopPhoto: { type: String, default: '' },
  status: {
    type: String,
    enum: ["active", "inactive", "on-hold"],
    default: "active"
  },
  companies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  }],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: false
  },
  tags: {
    type: [String],
    default: []
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Pre-save: keep company field synced with companies[0]
partySchema.pre("save", function () {
  if (this.companies && this.companies.length > 0 && !this.company) {
    this.company = this.companies[0];
  }
  if (this.company && (!this.companies || this.companies.length === 0)) {
    this.companies = [this.company];
  }
});

module.exports = mongoose.model("Party", partySchema);
