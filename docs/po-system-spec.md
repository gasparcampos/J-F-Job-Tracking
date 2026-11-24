# Purchase Orders: Access → app (spec)

Source: `\\JF-MACHINE\Main\J&F PURCHASE ORDERS\PURCHASE-ORDERS-MASTER.accdb`, read from a
password-free copy on 2026-11-24 (read-only: OLEDB `Mode=Read`, DAO read-only, form text
exported with macros disabled).

## Tables (what is really used)

| Access table | Rows | Becomes |
|---|---|---|
| `Purchase Orders` (PK `PURCHASEORDERID`, autonumber 50030 → 57260) | 6,925 | `purchaseOrders` doc, id = PO# |
| `Inventory Transactions` (the PO lines, FK `PurchaseOrderID`) | 22,241 (18 orphans) | `lines[]` inside the PO |
| `Products` (one row per line, never reused) | 22,386 | merged into each line |
| `Suppliers` | 198 | `poSuppliers` |
| `Employees` | 8 | `poEmployees` |
| `Shipping Methods` | 9 | `poShippingMethods` |
| `My Company Information` | 1 | PO print header |
| `M-T-R` attachment field on PO | 135 files / 131 POs / 76.7 MB | Firebase Storage, linked on the PO |

Not carried over: `Categories` (Northwind leftovers: Beverages, Seafood…), `PO-MASTER` (empty),
`MATETRIAL QUOTE PRICE RANGES` (4 rows; quotes live in QUOTES.accdb), `Reports` (report list),
`MILL` (multi-value, empty on all 6,925 POs), `PurchaseOrderNumber` (empty on all; the PO# is
`PURCHASEORDERID`), `DatePromised`, `ShipDate`, `FreightCharge`, `JF-PART#-DGW#`, `DWG-PART-JF`
(old/unused; kept in the migrated doc as `legacy` so nothing is lost).

### Field map: PO header (`Purchase Orders` form)

| Form label | Access field | Notes |
|---|---|---|
| PO NUMBER | `PURCHASEORDERID` | autonumber; app continues at max+1 (57261) |
| Supplier | `SupplierID` → Suppliers | combo sorted by name; shows supplier name next to it |
| Contact Name | `Suppliers.ContactName` | **edits the supplier record**, not the PO |
| Description | `PurchaseOrderDescription` | required; free text with suggestions (see list below) |
| Authorized By | `EmployeeID` → Employees | required; "Last, First" |
| TIME ORDER | `TIME ORDER` | default = time created, locked |
| Order Date | `OrderDate` | required, default today |
| ETA | `DateRequired` | required |
| Shipping Method | `ShippingMethodID` | required |
| MATERIAL IN CONDITION? | `MATERIAL IN CONDITION?` | list: "", N/A, MATERIAL-ANNELLED, MATERIAL BY SPEC, MATERIAL FOR REFERENCE ONLY (free text allowed) |
| HT# | `HT#` | |
| DWG# & PART | `PART-DWG-JF` | on enter: "PLEASE Put ALL The DWG# Or Part#…"; on exit: "Please Attach the (MTR)" |
| MAT-TYPE | `MAT-TYPE` | on enter: "PLEASE PUT MATERIAL TYPE" |
| HOT-RUSH | `HOT-RUSH` | list: HO-HOT, HOT-RUSH PLEASE, HOT-HOT-HOT, NEED BACK,SAME DAY (free text allowed) |
| ACTIVE / INACTIVE | `ACTIVE` | checked = PO is out (shows on the OUTSIDE screen); on enter: "PUT NOTES" reminder |
| NOTES | `NOTES` | memo |
| EMPLOYEE RECEIVED | `EMPLOYEE RECEIVED` | list: GASPAR, KARINA, MARK, WILLIE. On change: ORDER RECIVED = today and ACTIVE unchecked |
| ORDER RECIVED | `ORDER RECIVED` | date received |
| OPEN//CLOSE | `OPEN//CLOSE` | OPEN, CLOSED, PENDING, VOID |
| M-T-R | attachment | mill test reports (PDF/TIF/…) |

Access bug kept in mind: the receive code does `ACTIVE.Value = tru` (typo) which ends up
**unchecking** ACTIVE. That is the real behaviour people rely on (received POs drop off OUTSIDE),
so the app does the same on purpose.

### Field map: PO lines (`Purchase Orders Subform`)

| Label | Field | Notes |
|---|---|---|
| Date | `TransactionDate` | default = PO Order Date |
| Units Ordered | `UnitsOrdered` | |
| PROD_DESCRIP | `Products.PROD_DESCRIP` | |
| SPEC | `Products.SPEC` | warning if empty: "PLEASE (ADD SPEC TO THIS FIELD)" |
| REV | `Products.REV?` | |
| PART# | `Products.PART#-DWG-JF` | |
| Unit Price | `UnitPrice` | currency |
| Subtotal | = Units × Unit Price | |
| TOTAL | = sum of subtotals | |
| **WO** | `UnitsReceived` (!) | the J&F JOB#; filled on 9,631 lines |

### Screens

- **OUTSIDE** (startup): list of ACTIVE POs: PO ID, Supplier, Description, Shipping Method,
  Order Date, Date Required, Employee, **DAYS OVER** = today − Date Required. Search box
  (PO#, DWG-PART, Supplier), buttons NEW PO, SUPPLIER, OLD FILES (→ MAIN-VIEW), Quit.
  Refreshes on a timer. Click a PO# → opens the PO.
- **MAIN-VIEW** ("OLD FILES"): every PO, newest first, split view. Search 1: PO# / DWG-PART /
  Supplier. Search 2: MAT-TYPE / HT# / PART-DWG. Buttons: NEW PO, SUPPLIER, active (only
  ACTIVE), VIEW (→ TONY-ONLY), CLOSE (→ OUTSIDE), VIEW REPORTS.
- **Purchase Orders**: the PO form above + PDF Preview / Print Order, ADD NEW PO, Close, and a
  "go to PO#" box.
- **Suppliers**: Supplier ID, Supplier Name, Contact Name, Contact Title, Address, City
  (HOUSTON, KATY, TOMBALL, SUGARLAND, PEARLAND + free), State (TX, NY + free), Postal Code,
  Country, Phone, Fax, Email, Notes. Buttons: previous / next, Add Record, Close.
- **Employees**: ID, First, Last, Title, Work Phone, Extension, Email.
- **Shipping Methods**: ID, name (Federal Express, UPS, OUR TRUCK, VENDOR DELIVERY, WE PICK IT
  UP, WE DELIVERY, HOT SHOT, THEY PICK IT UP, OTHER).
- **My Company Information**: J&F MACHINE SHOP INC, 6300 W. LITTLE YORK RD SUITE 112,
  HOUSTON TX 77091, 713-466-1760, frontlobby@…
- **TONY-ONLY** (cost reports, each asks Start/End date; some ask Supplier or "All"):
  COMPANY (by supplier, with totals), EMPLOYEES (by employee), Categories BY DETAILS,
  Categories BY TOTAL (grouped by Description), PRICE NEEDS. All: PO, date, PROD_DESCRIP,
  units, unit price, total, grand total.

Not carried over: `MASTER-FORM` (old menu), `Products`, `Products Subform`, `Categories`,
`Provide Feedback`, `Report Date Range`, the 2000-era Product reports (all broken / Northwind).

## Printed PO (`Purchase Order` report)

Header: "Purchase Order" + Number, company phone/email, date/time printed. Supplier name,
contact, address, City, ST ZIP, phone. Order Date, ETA, Employee (Last, First), Ship Via,
Description, MAT-TYPE, HT#, HOT-RUSH, TIME ORDER, OPEN//CLOSE, EMPLOYEE RECEIVED, ORDER RECIVED.
Lines: Units, PROD_DESCRIP, SPEC, PART#, REV, WO#, Unit Price, Subtotal. Order Total. NOTES.
Page X of Y.

## Automation (new; not in Access)

Description decides what happens to the job (WO) on the board:

| Kind | Descriptions (examples from the data) | On save (ACTIVE) | On received |
|---|---|---|---|
| NDE | WET MAG, LP, WET MAG & PHOSPHATE*, TESTING, TEST PC | job → **NDE** + note | job → **KARINA** |
| Outside service | COATING, PHOSPHATE, HEAT TREAT, HEATTREAT & CARB, CARBURIZE, DRILLING & HONE, DRILL // HONE, DRILL, HONE, EDM, QPQ, plating… | job → **O.S** + note | job → **READY TO SHIP**; heat treat / stress relief (or a heat-treat supplier when the description names no process) → **WOOD PALLET**, except anything carburized (CARBURIZE, HEATTREAT & CARB) → **READY TO SHIP**; EDM (or an EDM supplier when the description names no process) → **KARINA** |
| No move | RAW MATERIAL, NEW MATERIAL, MATERIAL, TOOLING, Tools, SUPPLIES, MAINTENANCE, CALIBRATION, THREAD PROTECTORS | nothing | nothing |

Note format: `@ SUPPLIER MM/DD PO# NNNNN ETA MM/DD`. Every move is written to the job History
("PO# 57258"). Unknown descriptions: no move, flagged in the daily summary.

## Migration

One script (re-runnable, upserts by PO#): Access copy → Firestore + Storage. Run once now to
test, then again on cut-over day from a fresh copy so POs typed in Access in between are not
lost. Check counts: 6,925 POs / 22,223 lines / 198 suppliers / 135 MTR files.
