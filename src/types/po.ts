/**
 * Purchase Orders, carried over from the Access PURCHASE-ORDERS-MASTER
 * database (see docs/po-system-spec.md). Field comments name the Access field.
 */

export type PoStatus = '' | 'OPEN' | 'CLOSED' | 'PENDING' | 'VOID';

/** What a PO does to the job (WO) on the board. */
export type PoKind = 'nde' | 'os' | 'none';

/** One line of the PO (Access: Inventory Transactions + Products). */
export interface PoLine {
  date?: string; // TransactionDate, YYYY-MM-DD
  units?: number | null; // UnitsOrdered
  prodDescrip?: string; // PROD_DESCRIP
  spec?: string; // SPEC
  rev?: string; // REV?
  partNumber?: string; // PART#-DWG-JF
  unitPrice?: number | null; // UnitPrice
  wo?: string; // "WO" (Access stores it in UnitsReceived) = the J&F JOB#
}

/** A file attached to the PO (Access: M-T-R attachment field). */
export interface PoFile {
  name: string;
  path: string; // Firebase Storage path, served by /api/file?path=
  size?: number;
}

/** A job the PO moved on the board (sent out / brought back). */
export interface PoJobMove {
  wo: string;
  jobId: string;
  action: 'sent' | 'received' | 'note';
  fromDept?: string;
  toDept?: string;
  at: string;
}

export interface PurchaseOrder {
  id: string; // String(poNumber)
  poNumber: number; // PURCHASEORDERID
  supplierId: string; // SupplierID
  supplierName: string;
  description: string; // PurchaseOrderDescription
  employeeId: string; // EmployeeID ("Authorized By")
  employeeName: string; // "Last, First"
  orderDate: string; // OrderDate
  eta: string; // DateRequired
  timeOrder: string; // TIME ORDER, HH:MM:SS
  shippingMethodId: string; // ShippingMethodID
  shippingMethod: string;
  materialCondition: string; // MATERIAL IN CONDITION?
  heatNumber: string; // HT#
  partDwg: string; // PART-DWG-JF ("DWG# & PART")
  matType: string; // MAT-TYPE
  hotRush: string; // HOT-RUSH
  active: boolean; // ACTIVE (checked = out, shows on OUTSIDE)
  notes: string; // NOTES
  employeeReceived: string; // EMPLOYEE RECEIVED
  receivedDate: string; // ORDER RECIVED
  status: PoStatus; // OPEN//CLOSE
  lines: PoLine[];
  mtr: PoFile[];
  workOrders: string[]; // WO of every line (for search / job links)
  total: number; // sum of units x unit price
  // WOs already sent out by this PO (so editing the PO later never yanks a
  // job back), and the board moves it made.
  sentWos?: string[];
  jobMoves?: PoJobMove[];
  source: 'access' | 'app';
  legacy?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Row of the PO lists (no lines / files): what OUTSIDE and OLD FILES show. */
export type PoSummary = Pick<
  PurchaseOrder,
  | 'id'
  | 'poNumber'
  | 'supplierId'
  | 'supplierName'
  | 'description'
  | 'employeeName'
  | 'orderDate'
  | 'eta'
  | 'shippingMethod'
  | 'heatNumber'
  | 'partDwg'
  | 'matType'
  | 'hotRush'
  | 'active'
  | 'status'
  | 'receivedDate'
  | 'employeeReceived'
  | 'workOrders'
  | 'total'
> & { lineText: string; hasMtr: boolean };

export interface PoSupplier {
  id: string; // SupplierID
  name: string;
  contactName: string;
  contactTitle: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  fax: string;
  email: string;
  paymentTerms: string;
  notes: string;
  // What this supplier's POs do to the job when the Description alone
  // doesn't say (e.g. a plating PO whose description is the spec number).
  kind: PoKind;
}

export interface PoEmployee {
  id: string; // EmployeeID
  firstName: string;
  lastName: string;
  title: string;
  workPhone: string;
  extension: string;
  email: string;
}

export interface PoShippingMethod {
  id: string;
  name: string;
}

export interface PoCompany {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  fax: string;
  email: string;
}

/** Everything the PO screens need besides the POs themselves. */
export interface PoLookups {
  suppliers: PoSupplier[];
  employees: PoEmployee[];
  shippingMethods: PoShippingMethod[];
  company: PoCompany;
}

/** One PO line for the TONY-ONLY cost reports. */
export interface PoReportRow {
  poNumber: number;
  orderDate: string;
  supplierId: string;
  supplierName: string;
  employeeName: string;
  description: string;
  prodDescrip: string;
  units: number;
  unitPrice: number;
  priced: boolean; // false = Unit Price empty / 0 ("PRICE NEEDS")
}
