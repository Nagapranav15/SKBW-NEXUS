/** Shared HTTP helpers for the new core routes: company resolution, validation errors, uniform responses. */
const mongoose = require("mongoose");
const { z, ZodError } = require("zod");
const { StockError } = require("./stock/stockService");

const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");
const qty = z.number().positive().finite();
const money = z.number().min(0).finite();
const text = z.string().trim().max(500);
const idemKey = z.string().trim().min(8).max(100);

/** Company for this request: from the user's own scope; a super admin must name one explicitly. */
function companyOf(req) {
  const scope = req.companyScope;
  const requested = req.body?.companyId || req.query.companyId;
  if (scope && !scope.superAdmin) {
    if (requested) return String(requested); // already verified against the user's companies by the scope middleware
    if (scope.companyIds.length === 1) return scope.companyIds[0];
    throw new StockError("companyId is required", 400, "COMPANY_REQUIRED");
  }
  if (!requested || !mongoose.isValidObjectId(requested)) throw new StockError("companyId is required", 400, "COMPANY_REQUIRED");
  return String(requested);
}

const created = (body) => ({ __status: 201, body });

const handler = (fn) => async (req, res) => {
  try {
    const companyId = companyOf(req);
    const actor = { userId: req.user?.id, userName: req.user?.username };
    const out = await fn({ req, companyId, actor });
    res.status(out && out.__status ? out.__status : 200).json(out && out.__status ? out.body : out);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ msg: "Invalid request", code: "VALIDATION", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    if (err instanceof StockError) return res.status(err.status).json({ msg: err.message, code: err.code, details: err.details });
    console.error("core route error:", err);
    res.status(500).json({ msg: "Operation failed" });
  }
};

module.exports = { id, qty, money, text, idemKey, companyOf, created, handler };
