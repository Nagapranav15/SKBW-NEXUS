# SKBW Nexus rebuild: assessment and plan (Phase 0)

Status: assessment only. No data models or business logic have been rewritten yet. The only code changes so far are the security fixes in section 2.

Decision already made: **MongoDB + Mongoose stays.** The new core is built alongside the running system and each module is migrated only after it is proven.


## Status (updated)

| Phase | State |
|---|---|
| 0 Assessment and security fixes | Done |
| 1 Foundation | Done: auth, company isolation, users and company assignment (/users), CORS allowlist, rate limiting, security headers, authenticated realtime stream |
| 2 Stock engine | Done (`/api/v3/stock`): append-only ledger, moving average, transactions, reels, valuation, reconcile |
| 3 Factory conversions | Done (`/api/v3/conversions`): sheeting with the cutting-slip maths, generic slitting/ruling/printing/binding. Real rates and rules still needed |
| 4 Recipe engine | Done (`/api/v3/recipes`) as rules-as-data. Needs real notebook specs, wastage, rates |
| 5 Factory screens | **Removed on request.** The backend (stock, conversions, recipes) remains |
| 6 Sales | Done (`/api/v3/sales`): party ledger, invoices to receivables (auto-posted from the existing invoice screens), payments with allocation and advances, reversals, opening balances, credit limits, statements, ageing |
| 7 Management | Done: `/api/v3/reports` and the Management page (/management): KPIs, ageing, order-to-cash pipeline, sales by month, customer statement. Role management is the Users & Access page. Profit/margin is not reported yet (legacy invoice lines are not linked to stock items) |
| 8 Migration | Tooling done and tested (`scripts/migrate_to_core.js`, see `docs/MIGRATION.md`). A dry run has been run on the live company; **nothing has been applied** |
| 9 | Not defined in the brief (it has phases 1 to 8) |

Tests: `npm run test:all` in `erp-backend` runs the whole suite (costing, sheeting, stock engine, conversions, recipes, sales, reports, migration, company isolation, security) on a transactional in-memory MongoDB.
See `docs/COSTING_RULES.md` for the rules and `docs/MIGRATION.md` for the migration.

## 1. What exists today (measured)

| Area | Finding |
|---|---|
| Size | ~99k lines TS/TSX frontend; ~14k lines backend controllers; 31 Mongoose models; 18 route groups |
| Largest backend files | `mfgInventoryV2Controller` 3.8k lines, `productionOrderController` 1.6k, `mfgPurchaseV2Controller` 1.4k, `cuttingSlipController` 0.8k, `mfgSalesOrderV2Controller` 0.8k |
| Tests | None meaningful: `test_backend.js` and `test_uom_conversion.js` only |
| Stock stores | At least 6 overlapping: `Inventory`, `InventoryLedger`, `InventoryLedgerV2`, `StockMovement`, `SkuV2.presentStock`, plus per-location balances in `WarehouseLocationV2`. Two legacy item models (`Item`, `SkuV2`) and two sales order models (`SalesOrder`, `SalesOrderV2`) |
| Cost fields | `purchasePrice`, `ratePerKg`, `avgRate`, `avgCost`, `costPrice`, `standardCost`, `costPerPiece`, `valuationRate` are each read in 2-20 files. The same value is resolved differently per screen |
| Loose schemas | `strict: false` on `SkuV2`, `SalesInvoice`, `DeliveryChallan`; `Mixed` fields in SKU, production order (18), invoice, challan, cutting slip |
| Client-side business data | 33 frontend files use `localStorage`; invoices fall back to a localStorage store (`skbw_sales_invoices_*`) |

## 2. Security findings and what was fixed

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | MongoDB connection string **with password** hard-coded in `server.js` and two scripts, present in git history (8 commits) | Critical | Removed from code. **Rotation is still required (see below)** |
| 2 | JWT secret fallback `"supersecret"` in `server.js` and `realtimeRoutes.js`; anyone can forge tokens if the env var is unset | Critical | Fixed: server refuses to start unless `JWT_SECRET` is set and 32+ chars; fallback removed |
| 3 | `POST /api/auth/register` was **public** and accepted `roleName` from the body, so anyone could create an `admin` account | Critical | Fixed: now requires auth + `MANAGE_USERS`; only an admin can create or assign the admin role (also closed in `createUser` / `updateUser`) |
| 4 | **No company isolation.** Users had no company field and the JWT held no company; any logged-in user could read or write any company by changing an ID | Critical | **Fixed (Phase 1 slice):** `User.companies`; super admin (role `admin`) sees all companies, everyone else only their assigned ones. Enforced centrally in `src/core/companyScope.js` (request middleware + global Mongoose plugin), so by-ID reads/updates/deletes are covered too. 11 automated tests (`npm run test:isolation`) |
| 5 | CORS allowed every origin | Medium | **Fixed:** allowlist (skbw.in, www.skbw.in, api.skbw.in, localhost dev) plus `CORS_ORIGINS` env |
| 6 | No rate limiting on login, no security headers | Medium | **Fixed:** login limited to 10 failed attempts per 15 min per IP, API 1000/min, helmet headers, JSON API CSP, realtime stream now requires a token and company membership |
| 7 | Free-form `Mixed`/`strict:false` on money-bearing collections | Medium | Addressed by the new schemas |

### Actions only you can do
1. **Rotate the MongoDB user password in Atlas** and update `MONGO_URI` on the Hostinger server and in `erp-backend/.env`. The old password is in git history and was also printed in this session's tool output, so treat it as burned.
2. Set `JWT_SECRET` (32+ random chars) on the Hostinger server **before deploying this change**, otherwise the backend will intentionally refuse to start. Setting it invalidates existing logins, which is expected.
3. History purge (`git filter-repo` / BFG plus force-push) is destructive and shared-state, so I have not done it. Rotation makes it much less urgent.

Local setup: `erp-backend/.env` was created (git-ignored) with the existing connection string moved out of source and a new random `JWT_SECRET`. See `.env.example`.

## 3. Keep / refactor / rebuild / remove

| Component | Decision | Notes |
|---|---|---|
| Cutting-slip maths (theoretical vs actual sheets, scrap credit, cost per sheet and per 4-up) | **Keep the concepts, re-implement as pure functions with tests** | Currently interleaved with HTTP and DB code in `cuttingSlipController` |
| UoM conversion (GBL / PCS) | **Keep, consolidate** | Logic exists on both backend and frontend; make backend the only source |
| Sales order, challan, invoice flow and numbering sequences | **Refactor** | Flow is right; strict schemas, one SO model, server-side payments |
| Party (customer/vendor), routes, roles/permissions | **Refactor** | Add `companyId` ownership and per-user company membership |
| Stock (6 stores), costing (8 cost fields), reservations | **Rebuild** | One ledger plus server-side moving average (section 4) |
| Production orders and BOM | **Rebuild** on the recipe engine | Keep the real-world notebook specs as seed data |
| Frontend list/screens (Dispatch, Invoices, Item Master, Sales) | **Keep for now**, re-point to new endpoints module by module | No big-bang UI rewrite |
| localStorage as a data store (invoices, payments) | **Remove** | Server is the only source of truth |
| Legacy `Item`, `SalesOrder`, `Inventory`, `StockMovement` models | **Remove after migration** | |

## 4. Target architecture (summary; each gets a detailed design before its phase)

**Stock ledger.** One append-only `StockLedger` per company: `companyId, itemId, locationId, txnType, referenceType/Id, qtyIn, qtyOut, unit, unitCost, value, runningQty, runningValue, avgCost, createdBy, createdAt`. Balances are derived from, or atomically maintained with, ledger entries inside a MongoDB transaction. Nothing else writes stock.

**Moving average.** `newAvg = (oldValue + receiptValue) / (oldQty + receiptQty)`, computed on the server in the same transaction as the receipt. Issues and consumption are valued at the current average; conversions carry cost through inputs, processing charges and wastage to outputs. Exactly one cost field is authoritative (`avgCost` on the ledger/balance); the other seven fields are retired.

**Conversions.** A single `Conversion` document type (sheeting, slitting, ruling, index printing, cover printing, binding) holding inputs, outputs, wastage, scrap, processing/job-work charges, user, date and reference, so output cost and traceability are derivable.

**Reels.** `Reel` records (ID/QR, GSM, width, weight, supplier, purchase ref, location, status, remaining qty, cost) linked purchase -> reel -> cutting -> sheets -> production -> finished goods through ledger references.

**Recipe engine.** `Recipe` = size, pages, ups, GSM, ruling, index, cover, binding, pieces per bundle (all configurable). Output: paper/sheets/index/cover/wire requirement, wastage, cost per notebook and per bundle. No hard-coded factory rules; real values to be supplied (section 6).

**Company isolation.** `User.companies[]` (+ active company chosen at login/switch, signed into the JWT). A single `companyScope` middleware sets `req.companyId` from the authenticated user and rejects any client-supplied company the user doesn't belong to. A model plugin injects `companyId` into every query and every create. Automated tests: Company A user reading/writing Company B data is denied for every route.

**Security baseline.** Env-validated config, helmet, restricted CORS, login/register rate limiting, request validation (zod), audit log for stock/cost/payment/invoice/role changes.

**Workflow UI.** Guided step flows (Buy Paper, Cut Reel, Slit, Ruling, Index, Covers, Make Notebook, Pack Bundle), beginner/expert modes, built on the new endpoints.

**Testing.** Jest + mongodb-memory-server (replica set for transactions). Pure-function tests for costing/cutting/recipes using real SKBW numbers; API tests for company isolation on every route; migration tests reconciling totals against the old data.

**Migration.** Read-only scripts first: inventory of existing data, duplicate/corrupt detection, dry-run totals report. Migrate only validated data (items, parties, opening stock, reels, open orders/invoices), reconcile quantities and values against the old system before cut-over per module.

## 5. Phases (unchanged from the brief)
1. Foundation (auth, company isolation, validation, logging) 2. Stock engine 3. Factory conversions 4. Recipe engine 5. Factory screens 6. Sales 7. Management/reports 8. Migration. Each phase ships behind tests and is migrated only after acceptance.

## 6. Decisions and inputs needed from you before Phase 1 can safely start

1. ~~Which users belong to which companies?~~ **Decided:** super admin sees everything; all other users are isolated. Existing non-admin users have **no company assigned yet and are blocked until you assign one**: `node scripts/assign_user_companies.js` (lists users) then `node scripts/assign_user_companies.js <username> <company>`.
2. **Real factory data** (section 24 of the brief): notebook sizes, ups (2/4/8), sheets per book, page counts, index and cover requirements, pieces per bundle, ruling types and rates, index/cover printing rates, job-work charges, wastage and scrap rules, plus 2-3 real purchase bills, 1 sales order, 1 challan, 1 invoice to validate calculations.
3. **Allowed frontend origins** for CORS (e.g. `https://www.skbw.in`, `https://skbw.in`, your Vercel domains).
4. **Where to build the new core:** I suggest a new `erp-backend/src/core/` module tree inside the existing backend (shared DB, strangler pattern), mounted under `/api/v3`, rather than a separate service.
5. **Rotation done?** Confirm when the Atlas password is rotated and `JWT_SECRET` is set on the Hostinger server, so the security fixes can be deployed safely.
