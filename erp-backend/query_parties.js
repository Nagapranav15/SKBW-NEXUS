const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority';

const partySchema = new mongoose.Schema({
  type: String,
  firmName: String,
  contactName: String,
  ownerName: String,
  phone: String,
  city: String,
  district: String,
  status: String,
  company: mongoose.Schema.Types.ObjectId,
  companies: [mongoose.Schema.Types.ObjectId]
}, { timestamps: true });

const Party = mongoose.model('Party', partySchema);

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    const all = await Party.find({}).limit(100);
    console.log(`Total parties in DB: ${all.length}`);
    all.forEach(p => {
      console.log(`_id: ${p._id}, type: ${p.type}, firmName: ${p.firmName}, phone: ${p.phone}, company: ${p.company}, companies: ${JSON.stringify(p.companies)}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
