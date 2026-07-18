# Beta Version V2: Testing & Input Payload Guide

This guide provides test cases, instructions, and copy-paste payloads to help you verify and test the new V2 features (Item Master, Purchases, and Batch Stock List) in the beta manufacturing module.

---

## 📦 Module 1: Item Master

### Bulk Import Payload (JSON Array)
Use the **"Import Items"** button on the Item Master page. Copy and paste the JSON array below to import a mix of raw materials, semi-finished sheets, and finished notebooks:

```json
[
  {
    "skuCode": "RM-REEL-MAP58-64",
    "name": "Century Maplitho Reel 58 GSM 64cm",
    "category": "Raw Material",
    "unit": "kg",
    "gsm": 58,
    "width": 64,
    "brand": "Century"
  },
  {
    "skuCode": "SF-SHEET-P5770",
    "name": "Plain Insert Sheet 57 x 70",
    "category": "Semi Finished",
    "unit": "Sheets",
    "gsm": 52,
    "width": 57,
    "length": 70
  },
  {
    "skuCode": "FG-NOTE-1727-112P",
    "name": "Classmate Notebook 17x27 112 Pages",
    "category": "Finished Goods",
    "unit": "pcs",
    "brand": "Classmate",
    "pages": 112,
    "booksGbl": 240
  },
  {
    "skuCode": "FG-REG-2130-192P",
    "name": "Navneet Register 21x30 192 Pages",
    "category": "Finished Goods",
    "unit": "pcs",
    "brand": "Navneet",
    "pages": 192,
    "booksGbl": 160
  }
]
```

### Manual Creation Test
1. Click **"+ Add Item"**.
2. Select **"Finished Goods"** as the category.
3. Observe that the **Pages** and **Books / GBL** input fields dynamically appear at the bottom.
4. Input testing values:
   - Name: `BILT Premium Notebook 144P`
   - Pages: `144`
   - Books / GBL: `200`
5. Save and verify that they render correctly in the Item list table.

---

## 🛒 Module 2: Purchases (procurement & inwarding)

### Inwarding Raw Material Reels with Sub-items
To test the dynamic **Reels Editor** inside the Purchase form:

1. Click **"+ New Purchase"**.
2. Choose a Supplier (e.g., *BILT Papers Ltd.*).
3. Select a Reel SKU (e.g., `Century Maplitho Reel 58 GSM 64cm`).
4. Select a storage location (e.g., *Upper Left Rack*).
5. Input a Lot Number (e.g., `LOT-B1`).
6. Observe that a sub-panel **"Reel details editor"** appears for the raw material item row.
7. Click **"+ Add Reel"** three times to generate reel slots. Input the following test values:
   
   | Reel Number | GSM | Width (cm) | Weight (KG) |
   | :--- | :--- | :--- | :--- |
   | `R-0001` | `58` | `64` | `350` |
   | `R-0002` | `58` | `64` | `375` |
   | `R-0003` | `58` | `64` | `360` |

8. Notice that the parent **Qty** field automatically aggregates to `1085` KG (the sum of the reel weights) and locks from manual input.
9. Enter a **Cost Per Unit** (e.g., `68` per KG).
10. In the totals block, enter additional batch charges:
    - **Freight**: `12500`
    - **Crane Charges**: `2500`
    - **Other Charges**: `500`
11. Submit the inward.

### Batch Details Verification
- In the Purchase List table, click the newly generated batch (e.g., `PB2607001`).
- The drawer will slide open showing:
  - **Left panel**: Details of the supplier invoice, lot quantities, unit rate, custom charges (Freight, Crane, etc.), and the calculated **Total Bill Value**.
  - **Right panel**: The breakdown list of the 3 reels entered (`R-0001`, `R-0002`, `R-0003`) along with their individual weights.

---

## 🗂️ Module 3 & 3(A): Batch Stock List & Location Tree

### View verification
1. Open the **"Batch Stock List"** in the sidebar.
2. In **List View**, search for your purchase lot or supplier invoice number (e.g., `PB2607001`). Verify the `1085` KG stock balance is accurately tracked to the allocated bin.
3. Switch to **"Location Summary Tree"**.
4. Navigate and expand the warehouse tree down to the specific storage location where the lot was inwarded (e.g., `Factory -> Floor -> Zone -> Upper Left Rack`).
5. Verify that the reel material lot shows up nested under the storage rack with its exact available weight.
6. Click **"Audit Ledger"** to view the timeline transaction logs, verifying that the stock entry matches the initial `Purchase` transaction.
