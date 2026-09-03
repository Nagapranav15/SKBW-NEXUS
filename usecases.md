# SKU Master & Item Creation — Manual Testing Use Cases & Input Matrix

This document provides a step-by-step test guide and input matrix for manually testing the **Item Master Module** (`SkuMasterV2` & `AddSkuDrawerV2`).

---

## 📋 Table of Contents
1. [General Setup & Prerequisites](#1-general-setup--prerequisites)
2. [Suite 1: Category Selection & Auto SKU ID Sequencing](#suite-1-category-selection--auto-sku-id-sequencing)
3. [Suite 2: Adding Finished Goods (Products Tab)](#suite-2-adding-finished-goods-products-tab)
4. [Suite 3: Adding Raw Materials (Materials Tab)](#suite-3-adding-raw-materials-materials-tab)
5. [Suite 4: Adding Semi-Finished Goods (Semi Tab)](#suite-4-adding-semi-finished-goods-semi-tab)
6. [Suite 5: Alternate UOM (AUOM) & Manual Conversion Rate](#suite-5-alternate-uom-auom--manual-conversion-rate)
7. [Suite 6: Bill of Materials (BOM) Recipe Builder](#suite-6-bill-of-materials-bom-recipe-builder)
8. [Suite 7: Column Customizer Tool (`⚙️ Columns`)](#suite-7-column-customizer-tool-⚙️-columns)
9. [Suite 8: Direct Row Click & Direct Edit Drawer (`✏️ Edit`)](#suite-8-direct-row-click--direct-edit-drawer-✏️-edit)
10. [Suite 9: Number Field Mouse-Wheel Scroll Prevention](#suite-9-number-field-mouse-wheel-scroll-prevention)
11. [Master Input Data Matrix (Quick Copy-Paste)](#11-master-input-data-matrix-quick-copy-paste)

---

## 1. General Setup & Prerequisites
1. Open the ERP App in browser (`http://localhost:5174` or active deployment URL).
2. Navigate to **Masters ➔ Item Master** from the left navigation sidebar.
3. Verify that the 3 primary section tabs exist at the top:
   - **`Products`** (Finished Goods)
   - **`Materials`** (Raw Materials)
   - **`Semi`** (Semi-Finished Materials)

---

## Suite 1: Category Selection & Auto SKU ID Sequencing

### TC-01: Auto SKU ID for Finished Goods
- **Precondition**: Click on the **`Products`** tab.
- **Action**: Click **`+ Add Finished Good`** (or `+ Add Item`).
- **Expected Result**:
  - The drawer opens titled **"New Finished Goods Item"**.
  - **Category** dropdown defaults to **`Finished Goods`**.
  - **SKU Code** auto-generates with `FG-` prefix (e.g., `FG-001`, `FG-002`).

### TC-02: Auto SKU ID for Raw Materials
- **Precondition**: Click on the **`Materials`** tab.
- **Action**: Click **`+ Add Raw Material`**.
- **Expected Result**:
  - The drawer opens titled **"New Raw Material Item"**.
  - **Category** dropdown defaults to **`Raw Material`**.
  - **SKU Code** auto-generates with `RM-` prefix (e.g., `RM-001`, `RM-002`).

### TC-03: Auto SKU ID for Semi-Finished Materials
- **Precondition**: Click on the **`Semi`** tab.
- **Action**: Click **`+ Add Semi Finished Material`**.
- **Expected Result**:
  - The drawer opens titled **"New Semi Finished Item"**.
  - **Category** dropdown defaults to **`Semi Finished`**.
  - **SKU Code** auto-generates with `SEM-` prefix (e.g., `SEM-001`, `SEM-002`).

---

## Suite 2: Adding Finished Goods (Products Tab)

### TC-04: Full Creation of a Long Book (Finished Goods)
- **Navigation**: `Products` Tab ➔ Click `+ Add Finished Good`.
- **Test Inputs**:
  | Field Name | Test Value |
  | :--- | :--- |
  | **Category** | `Finished Goods` |
  | **Item Name** | `172P Deluxe King Longbook` |
  | **Primary UOM** | `Pcs` |
  | **Pages / Sheets** | `172` |
  | **Paper Grade / Type** | `Maplitho 58 GSM` |
  | **GSM** | `58` |
  | **Trimmed Size** | `18 x 24 CM` |
  | **Ruling & Spec** | `Single Line Ruled` |
  | **Binding Type** | `Center Pinning / Soft Cover` |
  | **Brand** | `Skbw Bestfriend` |
  | **Opening Stock** | `1000` |
  | **Min Stock Level** | `200` |
  | **Reorder Level** | `50` |
- **Action**: Fill in inputs and click **`Save SKU Item`**.
- **Expected Result**:
  - Success toast message: `"SKU Created Successfully!"`.
  - Item appears under `Products` table with ID `FG-XXX`.
  - `STOCK` column displays `1,000 Pcs` badge (emerald color).

---

## Suite 3: Adding Raw Materials (Materials Tab)

### TC-05: Full Creation of Paper Reel (Raw Material)
- **Navigation**: `Materials` Tab ➔ Click `+ Add Raw Material`.
- **Test Inputs**:
  | Field Name | Test Value |
  | :--- | :--- |
  | **Category** | `Raw Material` |
  | **Item Name** | `Writing Paper Reel 52 GSM 61 CM` |
  | **Primary UOM** | `KG` |
  | **Paper Grade** | `Maplitho` |
  | **GSM** | `52` |
  | **Reel Width / Size** | `61 CM` |
  | **Core Diameter** | `3 Inch` |
  | **Opening Stock** | `5000` |
  | **Min Stock Level** | `1000` |
- **Action**: Click **`Save SKU Item`**.
- **Expected Result**:
  - Item saved successfully under `Materials` tab with prefix `RM-XXX`.
  - Icon shows paper reel domain icon (`🗞️`).

### TC-06: Full Creation of Cover Board (Raw Material)
- **Navigation**: `Materials` Tab ➔ Click `+ Add Raw Material`.
- **Test Inputs**:
  | Field Name | Test Value |
  | :--- | :--- |
  | **Category** | `Raw Material` |
  | **Item Name** | `Duplex Board 230 GSM 70x100 CM` |
  | **Primary UOM** | `Sheet` |
  | **GSM** | `230` |
  | **Size** | `70 x 100 CM` |
  | **Opening Stock** | `2500` |
- **Action**: Click **`Save SKU Item`**.
- **Expected Result**: Item created under `Materials` with unit `Sheet`.

---

## Suite 4: Adding Semi-Finished Goods (Semi Tab)

### TC-07: Full Creation of Inner Printed Signature (Semi Finished)
- **Navigation**: `Semi` Tab ➔ Click `+ Add Semi Finished Material`.
- **Test Inputs**:
  | Field Name | Test Value |
  | :--- | :--- |
  | **Category** | `Semi Finished` |
  | **Item Name** | `16P Single Line Ruled Signature Form` |
  | **Primary UOM** | `Form` |
  | **Pages** | `16` |
  | **GSM** | `54` |
  | **Trimmed Size** | `18 x 24 CM` |
  | **Opening Stock** | `4000` |
- **Action**: Click **`Save SKU Item`**.
- **Expected Result**:
  - Item created under `Semi` tab with code prefix `SEM-XXX`.
  - Icon displays semi-finished signature icon (`📑`).

---

## Suite 5: Alternate UOM (AUOM) & Manual Conversion Rate

### TC-08: Item WITHOUT Alternate UOM (Leave Blank)
- **Action**: Create or Edit an item without entering Alternate UOM (`altUnit`).
- **Inputs**:
  - **Primary UOM**: `Pcs`
  - **Alternate UOM (AUOM)**: `[ Leave Empty / Unassigned ]`
  - **Conversion Rate**: `[ Leave Empty ]`
- **Expected Result**:
  - In the table row, **`AUOM`** column shows **`-`** (completely blank).
  - In the table row, **`CON RATE`** column shows **`-`** (completely blank).
  - No default text like "Box" or "1:10" should auto-fill!

### TC-09: Item WITH Manual Alternate UOM & Manual Conversion Rate
- **Action**: Create/Edit an item with Alternate UOM.
- **Inputs**:
  - **Primary UOM**: `Pcs`
  - **Alternate UOM (AUOM)**: `Box`
  - **Conversion Rate**: `12` *(Manual Entry Field)*
- **Expected Result**:
  - In the table row, **`AUOM`** displays **`Box`**.
  - In the table row, **`CON RATE`** displays **`1:12`**.
  - `CONVERSION RATE` input in drawer is editable with numbers.

---

## Suite 6: Bill of Materials (BOM) Recipe Builder

### TC-10: Adding BOM Recipe for Finished Goods & Semi-Finished Items
- **Navigation**: Open Add/Edit Drawer for a `Finished Goods` or `Semi Finished` item.
- **Action**: Scroll down to **Bill of Materials (BOM Recipe)** section.
- **Sub-Tests**:
  1. **Customizable Batch Yield Quantity & Dynamic Unit**:
     - Change `"This recipe makes [ 1 ] <UNIT>"` input to `50`.
     - Verify that `<UNIT>` dynamically matches the item's **Primary UOM** (e.g. `Pcs` or `Form`).
  2. **Filtered Material Dropdown**:
     - Click **`+ Add Ingredient Row`**.
     - Open the Material Dropdown selector.
     - **Verification**: The dropdown MUST list ONLY `Raw Materials` and `Semi Finished` items. Finished Goods (`FG-`) MUST NOT appear in the ingredients dropdown.
  3. **Empty Initial Inputs**:
     - Verify that newly added ingredient rows have **EMPTY** input fields for `QTY` and `NOTES` (no pre-filled numbers or text).
- **Test Ingredients Input**:
  | Ingredient Item | Qty | UOM | Notes |
  | :--- | :--- | :--- | :--- |
  | `Writing Paper Reel 52 GSM` | `15.5` | `KG` | `Inner paper reel` |
  | `Duplex Board 230 GSM` | `1` | `Sheet` | `Front & back cover` |
- **Action**: Click **`Save SKU Item`**.
- **Expected Result**:
  - Item saves with BOM.
  - Table row under `BOM` column displays badge **`✓ 2 items`** (or `Defined`).

---

## Suite 7: Column Customizer Tool (`⚙️ Columns`)

### TC-11: Column Visibility Toggle (On / Off)
- **Navigation**: Click **`[⚙️ Columns]`** toolbar button.
- **Action**:
  1. Uncheck **`AUOM (Alt Unit)`** and **`Con Rate`**.
- **Expected Result**:
  - `AUOM` and `CON RATE` columns immediately hide from the main table view.
  - `Columns (11)` badge updates count.
- **Action 2**: Re-check **`AUOM`** and **`Con Rate`**.
- **Expected Result**: Columns reappear in table.

### TC-12: Popover Card Drag & Drop Column Reordering
- **Navigation**: Open **`[⚙️ Columns]`** popover.
- **Action**:
  1. Click and drag the **`GSM`** column card.
  2. Notice the pop-out visual animation (`shadow-xl border-purple-500 scale-[1.02]`).
  3. Drag and drop **`GSM`** above **`Category`**.
- **Expected Result**:
  - `GSM` card moves above `Category` in the popover list.
  - The main table headers AND all row cells instantly shift so `GSM` displays before `Category`.
- **Action 2**: Click **`Reset default`** in the popover.
- **Expected Result**: Column order restores to default initial order.

---

## Suite 8: Direct Row Click & Direct Edit Drawer (`✏️ Edit`)

### TC-13: Direct Row Click to Edit
- **Action**: Click anywhere on any item row in the Item Master table.
- **Expected Result**:
  - The **Edit SKU Drawer** (`AddSkuDrawerV2`) opens directly on the right side of the screen.
  - All existing fields for that item (Code, Name, Category, UOM, AUOM, Con Rate, Stock, BOM, etc.) are pre-populated.
  - No separate intermediate popups open.

### TC-14: Action Column Direct Edit Button (`✏️`)
- **Action**: Click the purple **Edit (`✏️`)** icon in the `ACTIONS` column for any item row.
- **Expected Result**: Opens the Edit SKU Drawer with all parameters pre-loaded.

---

## Suite 9: Number Field Mouse-Wheel Scroll Prevention

### TC-15: Mouse Wheel Scroll Suppression on Numeric Fields
- **Action**:
  1. Open Add/Edit SKU Drawer.
  2. Click inside any numeric input field (e.g. `Opening Stock`, `GSM`, `Conversion Rate`, `Min Stock Level`, `BOM Qty`).
  3. Type a number (e.g., `100`).
  4. Scroll the mouse wheel up and down while hovering over the number field.
- **Expected Result**:
  - The number in the input field MUST NOT change (does not increment/decrement).
  - Page scrolls normally without accidental number modifications.

---

## 11. Master Input Data Matrix (Quick Copy-Paste)

### Category 1: Finished Goods (Notebooks & Diaries)
```json
{
  "category": "Finished Goods",
  "name": "A4 140P Hard Bound Notebook",
  "unit": "Pcs",
  "altUnit": "Box",
  "altUnitConversion": "20",
  "pages": 140,
  "gsm": 60,
  "paperType": "Maplitho High Bright",
  "width": 21,
  "length": 29.7,
  "ruleType": "Single Line Ruled",
  "bindingType": "Hard Bound / Case Bound",
  "openingStock": 500,
  "minStockLevel": 100,
  "reorderLevel": 30
}
```

### Category 2: Raw Material (Paper Reels & Boards)
```json
{
  "category": "Raw Material",
  "name": "Creamwove Paper Reel 56 GSM 86 CM",
  "unit": "KG",
  "altUnit": "",
  "altUnitConversion": "",
  "gsm": 56,
  "paperType": "Creamwove",
  "width": 86,
  "openingStock": 12000,
  "minStockLevel": 2000,
  "reorderLevel": 500
}
```

### Category 3: Semi Finished Material (Printed Sheets & Signatures)
```json
{
  "category": "Semi Finished",
  "name": "32P Uncut Printed Sheet 54 GSM (A4)",
  "unit": "Sheet",
  "altUnit": "Bundle",
  "altUnitConversion": "500",
  "pages": 32,
  "gsm": 54,
  "width": 61,
  "length": 86,
  "openingStock": 3500,
  "minStockLevel": 500,
  "reorderLevel": 100
}
```

---
*Created for manual QA testing on SKBW ERP Item Master.*
