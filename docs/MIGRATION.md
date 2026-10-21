# Migrating legacy data into the new ledgers

Nothing here changes or deletes legacy data. Everything is idempotent: re-running skips what is already migrated.

## What is migrated
| Data | Source | Becomes |
|---|---|---|
| Opening stock | legacy `InventoryLedger` (status not Cancelled), IN minus OUT per item and location, the same figure the Stock & Inventory screen shows | one `OPENING` receipt per item and location in the new stock ledger |
| Customer balances | `Party.outstandingBalance` (or the older `outstanding` when that is empty) | one opening item per customer in the party ledger, settled by later payments |
| Old invoices | not migrated | their value is already inside the customer's opening balance. Invoices created from now on post to the ledger automatically |

## What is NOT migrated until fixed in the legacy data
Items are skipped and listed, never guessed:
- `NEGATIVE_STOCK`: a location (or the total) is below zero
- `NO_COST`: no cost in any of the eight legacy cost fields
- `COST_CONFLICT`: the cost fields disagree by more than 1% (the report lists every candidate). `--allow-cost-conflicts` migrates using the first field in priority order: avgCost, avgRate, purchasePrice, ratePerKg, costPrice, standardCost, rate, valuationRate
- `UNIT_MISMATCH`: ledger entries use a different unit from the item master
- `BALANCE_FIELDS_DIFFER` (customers): `outstanding` and `outstandingBalance` are both set and differ. Choose with `--party-field`

## Running it
```
cd erp-backend
node scripts/migrate_to_core.js --company "<name or id>"                 # dry run, read-only, writes a JSON report
node scripts/migrate_to_core.js --company "<name or id>" --apply --yes --cutover 2026-10-01
node scripts/migrate_to_core.js --company "<name or id>" --reconcile     # compare new ledgers with legacy
```
Reports go to `erp-backend/migration-reports/` (git-ignored; they contain customer names and balances).

## Recommended order
1. Fix the blocked items in the legacy data (or accept conflicts on purpose) and re-run the dry run until the list is what you expect.
2. Choose the cut-over date. From that day, stop using the old payment screens for customer money: use `/api/v3/sales/payments`, otherwise the old `outstanding` figure and the new ledger drift apart. `GET /api/v3/sales/parties/:id/reconcile` and the migration `--reconcile` show any drift.
3. Apply, then reconcile. Totals must match to the paisa.

## Dry run on the live company (21 Oct 2026)
- Stock: 15 items have legacy stock movements and 8 currently show stock above zero. 3 are ready to migrate (FG-372, RM-001, SM-026: about 60,455 rupees, quantities in mixed units). The others are blocked: 5 with a negative location (FG-001, FG-088, FG-102, SM-025, SM-027), 2 with conflicting costs (FG-088, RM-027), 2 with unit mismatch (FG-088, SM-028).
- FG-088 has an average cost of 17.73 per GBL but a purchase price of 2,058: one of them is wrong and it decides a value of about 8.7 thousand versus 10 lakh rupees.
- Customers: 23 owe money, 81,17,425 rupees in total. Two customers account for almost all of it: A T C Marketing (69,44,730) and Harish Book Emporium (11,57,730). Please confirm these are real balances and not test data before applying.
