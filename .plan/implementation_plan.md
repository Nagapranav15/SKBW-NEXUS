# Inventory Auto-Deduction, Transaction Linking, and RBAC Overhaul

## Problem Statement

The current ERP system has several critical gaps:
1. **No inventory deduction on sales** - Creating a sale order does not reduce stock
2. **No stock_movements audit trail** - All stock changes are direct overwrites with no history
3. **Transaction linking is fragile** - Auto-created transactions silently fail without rollback
4. **RBAC is incomplete** - Transactions, Inventory, and Analyzer are hardcoded as admin-only in the sidebar (`hasRole('admin')`)
5. **No atomicity** - Sale order creation, stock deduction, and transaction creation are not transactional

## IMPORTANT: MongoDB Transactions

This plan uses MongoDB sessions/transactions for atomicity. This requires MongoDB to be running as a **replica set** (even a single-node replica set works). If your MongoDB is running as a standalone instance, I'll add fallback logic that uses manual rollback instead.

## IMPORTANT: Seed Script

The seed script will be updated to add new permissions (`MANAGE_INVENTORY`, `VIEW_INVENTORY`, `VIEW_TRANSACTIONS`). You'll need to re-run `node seed.js` to update roles after the changes.

## Open Questions

1. **Stock location for sales deduction**: Currently inventory is tracked per-warehouse per-section. When a sale is created, which warehouse/section should stock be deducted from?
   - **(A)** Deduct from the Item model's `stock` field (simpler, global stock count) - **Recommended for now**
   - **(B)** Require the user to specify warehouse + section per item in the sale order

2. **Existing orders**: Should we back-fill stock movements for existing sale orders? Or start fresh?

3. **Manager transaction access**: Managers can "View transactions". Should they also create manual transactions?

---

## Proposed Changes

### Component 1: Stock Movement Model (NEW FILE)

**File: `erp-backend/src/models/stockMovementModel.js`**

New model tracking every stock change with fields:
- item, quantity (positive=IN, negative=OUT), movement_type, source_type, source_id, date, notes, company, createdBy

### Component 2: Shared Inventory Service (NEW FILE)

**File: `erp-backend/src/services/inventoryService.js`**

Shared service used by ALL modules:
- `validateStock(items, companyId)` - Check sufficient stock
- `deductStock(items, sourceType, sourceId, companyId, userId, session)` - Decrease + record movement
- `addStock(items, sourceType, sourceId, companyId, userId, session)` - Increase + record movement
- `adjustStock(itemId, quantity, reason, companyId, userId, session)` - Manual adjustments
- `getStockMovements(itemId, companyId)` - Audit trail

### Component 3: Sales Order Controller (MODIFY)

**File: `erp-backend/src/controllers/salesOrderController.js`**

Rewrite `createSalesOrder` with atomic operations:
1. Start MongoDB session
2. Validate stock via inventoryService
3. Create sale order in session
4. Deduct stock in session
5. Create transaction in session
6. Commit or rollback all

### Component 4: RBAC Permission Updates (MODIFY)

**File: `erp-backend/seed.js`**

New permissions: MANAGE_INVENTORY, VIEW_INVENTORY, VIEW_TRANSACTIONS

| Permission | Admin | Manager | Sales |
|---|---|---|---|
| MANAGE_INVENTORY | Yes | Yes | No |
| VIEW_INVENTORY | Yes | Yes | Yes |
| VIEW_TRANSACTIONS | Yes | Yes | No |

### Component 5: Route Updates (MODIFY)

- `inventoryRoutes.js`: Use MANAGE_INVENTORY/VIEW_INVENTORY, add stock-movements route
- `transactionRoutes.js`: Add VIEW_TRANSACTIONS permission
- `salesOrderRoutes.js`: Permission cleanup

### Component 6: Inventory Controller (MODIFY)

- Use inventoryService for all stock operations
- Add getStockMovements endpoint
- Add reconcileStock endpoint

### Component 7: Frontend Updates (MODIFY)

- `Layout.tsx`: Replace `hasRole('admin')` with `hasPermission(...)` for sidebar
- `InventoryManagement.tsx`: RBAC-gated buttons, stock movement panel
- `SalesOrders.tsx`: Show stock availability, handle insufficient stock errors
- `inventoryApi.ts`: Add stock movements API call

---

## Verification Plan

1. Re-seed database with `node seed.js`
2. Login as admin - create sale order - verify stock decreases + transaction appears
3. Login as manager - verify inventory visible + can add stock + cannot delete
4. Login as sales - verify inventory read-only + can create orders + blocked if insufficient stock
5. Test atomicity: order with insufficient stock should create no partial records
6. Verify stock_movements collection matches Item.stock values
