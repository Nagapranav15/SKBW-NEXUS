const mongoose = require("mongoose");

const quoteItemSchema = new mongoose.Schema({
  itemId: String,
  itemName: String,
  quantity: Number,
  price: Number,
  total: Number
}, { _id: true });

const quoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Party"
  },
  customerName: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  validUntil: {
    type: String,
    required: true
  },
  items: [quoteItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["draft", "sent", "accepted", "rejected", "expired"],
    default: "draft"
  },
  notes: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Quote", quoteSchema);
