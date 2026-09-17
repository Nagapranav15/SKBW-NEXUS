require('dotenv').config();
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority';
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');
const SkuV2 = require('../src/models/skuV2Model');
const Company = require('../src/models/companyModel');
const Sequence = require('../src/models/sequenceModel');

async function fixAllCompaniesNumbering() {
  await connectDB();
  const companies = await Company.find({});
  console.log(`Found ${companies.length} companies to process`);

  for (const comp of companies) {
    const companyId = comp._id;
    console.log(`\n========================================`);
    console.log(`Processing company: ${comp.name} (${companyId})`);

    // Fetch all SKUs including soft-deleted
    const allSkus = await SkuV2.find({ company: companyId });
    const activeSkus = allSkus.filter(s => !s.isDeleted);
    const deletedSkus = allSkus.filter(s => s.isDeleted);

    console.log(`  Total: ${allSkus.length}, Active: ${activeSkus.length}, Deleted: ${deletedSkus.length}`);

    // Step 1: Temporarily prefix all deleted SKUs so they never collide with active codes
    const deletedOps = deletedSkus.map((s, idx) => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { skuCode: `DEL-${idx + 1}-${Date.now()}-${String(s._id).slice(-4)}` } }
      }
    }));
    if (deletedOps.length > 0) {
      await SkuV2.bulkWrite(deletedOps);
    }

    // Step 2: Classify active SKUs
    const fgList = [];
    const smList = [];
    const rmList = [];

    for (const sku of activeSkus) {
      const cat = (sku.category || '').trim().toLowerCase();
      const code = (sku.skuCode || '').trim().toUpperCase();
      const name = (sku.name || '').trim().toLowerCase();

      if (
        cat.includes('semi') || 
        cat.includes('wip') || 
        cat === 'semi finished' || 
        cat.includes('sub') || 
        code.startsWith('SM') || 
        code.startsWith('SEM') || 
        code.startsWith('SFG') || 
        name.includes('ruled cut') || 
        name.includes('inner signature') || 
        name.includes('book block')
      ) {
        smList.push(sku);
      } else if (
        cat.includes('raw') || 
        cat.includes('material') || 
        cat === 'raw material' || 
        cat.includes('reel') || 
        cat.includes('board') || 
        code.startsWith('RM') || 
        name.includes('reel') || 
        name.includes('wire') || 
        name.includes('adhesive') || 
        name.includes('glue')
      ) {
        rmList.push(sku);
      } else {
        fgList.push(sku);
      }
    }

    // Sort stably: if existing code has a number, use that number; otherwise use createdAt
    const getSkuNum = (sku) => {
      const m = (sku.skuCode || '').match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 999999;
    };
    const sortFn = (a, b) => {
      const numA = getSkuNum(a);
      const numB = getSkuNum(b);
      if (numA !== numB && numA !== 999999 && numB !== 999999) {
        return numA - numB;
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    };

    fgList.sort(sortFn);
    smList.sort(sortFn);
    rmList.sort(sortFn);

    console.log(`  Classification -> FG: ${fgList.length}, SM: ${smList.length}, RM: ${rmList.length}`);

    // Step 3: Temporary intermediate rename to avoid unique index violation
    const tempOps = activeSkus.map((s, idx) => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { skuCode: `TEMP-FIX-${idx + 1}-${Date.now()}-${String(s._id).slice(-4)}` } }
      }
    }));
    if (tempOps.length > 0) {
      await SkuV2.bulkWrite(tempOps);
    }

    // Step 4: Final Sequential Renumbering starting at 001
    const finalOps = [];
    fgList.forEach((s, idx) => {
      finalOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { skuCode: `FG-${String(idx + 1).padStart(3, '0')}` } }
        }
      });
    });

    smList.forEach((s, idx) => {
      finalOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { skuCode: `SM-${String(idx + 1).padStart(3, '0')}` } }
        }
      });
    });

    rmList.forEach((s, idx) => {
      finalOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { skuCode: `RM-${String(idx + 1).padStart(3, '0')}` } }
        }
      });
    });

    if (finalOps.length > 0) {
      await SkuV2.bulkWrite(finalOps);
    }

    // Step 5: Update Sequence records
    if (Sequence) {
      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_FG` },
        { sequence: fgList.length },
        { upsert: true }
      ).catch(() => {});

      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_SM` },
        { sequence: smList.length },
        { upsert: true }
      ).catch(() => {});

      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_RM` },
        { sequence: rmList.length },
        { upsert: true }
      ).catch(() => {});
    }

    console.log(`  ✓ Successfully renumbered ${finalOps.length} items in ${comp.name}!`);
    console.log(`    FG range: ${fgList.length > 0 ? `FG-001 to FG-${String(fgList.length).padStart(3, '0')}` : 'none'}`);
    console.log(`    SM range: ${smList.length > 0 ? `SM-001 to SM-${String(smList.length).padStart(3, '0')}` : 'none'}`);
    console.log(`    RM range: ${rmList.length > 0 ? `RM-001 to RM-${String(rmList.length).padStart(3, '0')}` : 'none'}`);
  }

  console.log(`\nAll companies renumbered successfully!`);
  process.exit(0);
}

fixAllCompaniesNumbering().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
