# Costing and stock rules (new core, `erp-backend/src/core`)

There is exactly one source of truth for stock and cost: the **stock ledger** (`StockLedger`), with `ItemCost` (company-wide quantity, value, moving-average cost per item) and `StockBalance` (quantity per location) updated **in the same MongoDB transaction** as every ledger entry. Nothing else may change them. The frontend only displays what the backend returns.

## Moving average
- Receipt: `new qty = qty + received`, `new value = value + receipt value`, `average = new value / new qty`.
- Issue / consumption: leaves at the current average. The movement that takes the last unit takes the remaining value exactly, so no rounding residue is left.
- Transfer between locations: no change to quantity, value or average.
- Quantities round to 3 decimals, money to 2, rates to 4.
- Negative stock is refused by default (per item and per location). If it is ever allowed, a later receipt first covers the shortfall.
- Adjustments require a reason and are audited. Found stock is valued at the current average unless a cost is given.

## Cost components
| Term | Meaning |
|---|---|
| Purchase cost | what the bill says; enters stock as a receipt |
| Moving-average cost | `ItemCost.avgCost`, the one authoritative cost of an item |
| Conversion cost | value of the inputs consumed (at average) |
| Processing / job-work cost | charges recorded on a conversion |
| Wastage | not credited: its cost is absorbed by the good output |
| Scrap credit | scrap kg x rate + cores x rate, deducted from the conversion's net cost |
| Finished-product cost | net cost of the conversion that produced it, which then becomes the receipt cost of the output |

Net cost of a conversion = input value + charges - scrap credit. With several outputs the net cost is shared by `costShare` (default: quantity) and the last output takes the remainder so the shares always add up exactly.

## Sheeting (cutting slip)
- Theoretical sheets = weight kg x 10,000,000 / (width cm x length cm x GSM), rounded.
- Sheets per cut = reels on stand x slits; machine sheets = cuts x sheets per cut.
- Actual good sheets may exceed the theoretical maximum by at most 0.5%; anything more is rejected.
- Reams = sheets / sheets per ream (default 500). Cost per sheet = net cost / actual sheets. Cost per 4-up piece = cost per sheet / 4.
- **Open point:** the legacy cutting slip stored the scrap credit but posted it as zero. The new code deducts it. Confirm this is wanted.

## Immutability
Ledger entries and posted conversions cannot be edited or deleted; corrections are new, opposite entries. Duplicate submissions are prevented with idempotency keys.

## Recipes
All factory rules are data on the recipe (pages per leaf, ups, pieces per bundle, wastage, rates). Nothing is assumed. Every recipe edit creates a new version.

## Receivables (party ledger)
- The party ledger is append-only. DR = customer owes more (invoice, opening balance), CR = owes less (payment, reversal). A balance above zero means the customer owes us; below zero is an advance.
- An invoice creates one open item and one DR entry. Cancelling posts the opposite entry, and is refused while payments are allocated to it.
- A payment posts a CR entry for the full amount and settles open items oldest due date first (or exactly as chosen). Any remainder stays as an advance and is applied automatically to the next invoice. Reversing a payment posts a DR entry and reopens what it settled.
- Invariant, checked by `reconcile`: balance = sum of open items - sum of advances.
- Credit: `creditLimit` set and above 0 = limited credit; `0` = cash customer (only an advance covers a sale); not set = unrestricted but flagged `NO_LIMIT_SET`.
- Ageing buckets are days past the due date (due date = invoice date + the customer's credit days unless the invoice states one).
