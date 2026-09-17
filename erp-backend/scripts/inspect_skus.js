require('dotenv').config();
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority';
const connectDB = require('../src/config/db');
const SkuV2 = require('../src/models/skuV2Model');
const Company = require('../src/models/companyModel');

async function check() {
  await connectDB();
  const companies = await Company.find({});
  console.log('Companies count:', companies.length);

  for (const c of companies) {
    const allSkus = await SkuV2.find({ company: c._id });
    const active = allSkus.filter(s => !s.isDeleted);
    console.log('Company: ' + c.name + ' (' + c._id + '): Total SKUs = ' + allSkus.length + ', Active = ' + active.length);
    const codes = active.map(s => s.skuCode);
    console.log('  Codes sample: ' + JSON.stringify(codes.slice(0, 15)) + ' ... ' + JSON.stringify(codes.slice(-5)));
  }
  process.exit(0);
}
check();
