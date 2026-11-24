# One-off: export the Access PURCHASE-ORDERS-MASTER database (a password-free
# copy) to JSON for scripts/legacy/import-pos.mjs. Read-only: DAO opens the
# file read-only; M-T-R attachments are saved as files next to the JSON.
#
# Usage: powershell -File scripts/legacy/export-pos.ps1 -Source <copy.accdb> -Out <folder>
param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Out)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$mtrDir = Join-Path $Out 'mtr'
New-Item -ItemType Directory -Force $mtrDir | Out-Null

$engine = New-Object -ComObject DAO.DBEngine.120
$d = $engine.OpenDatabase($Source, $false, $true)

function D($v) { if ($v -is [datetime]) { $v.ToString('yyyy-MM-dd') } else { $null } }
function T($v) { if ($v -is [datetime]) { $v.ToString('HH:mm:ss') } else { $null } }
function S($v) { if ($null -eq $v -or $v -is [System.DBNull]) { $null } else { $s = "$v".Trim(); if ($s) { $s } else { $null } } }
function N($v) { if ($null -eq $v -or $v -is [System.DBNull]) { $null } else { [double]$v } }

function Rows($sql) {
  $rs = $d.OpenRecordset($sql, 4)
  $out = New-Object System.Collections.Generic.List[object]
  while (-not $rs.EOF) {
    $o = @{}
    foreach ($f in $rs.Fields) { if ($f.Type -ne 101 -and $f.Type -ne 109) { $o[$f.Name] = $f.Value } }
    $out.Add($o); $rs.MoveNext()
  }
  $rs.Close(); $out
}

$company = (Rows 'SELECT * FROM [My Company Information]') | Select-Object -First 1
$companyOut = [ordered]@{
  name = S $company.CompanyName; address = S $company.Address; city = S $company.City
  state = S $company.StateOrProvince; postalCode = S $company.PostalCode; country = S $company.Country
  phone = S $company.PhoneNumber; fax = S $company.FaxNumber
  email = if ($company.EMAIL) { ("$($company.EMAIL)" -split '#')[0] } else { $null }
}

$employees = foreach ($r in Rows 'SELECT * FROM Employees') {
  [ordered]@{ id = $r.EmployeeID; firstName = S $r.FirstName; lastName = S $r.LastName; title = S $r.Title
    email = if ($r.EmailName) { ("$($r.EmailName)" -split "#")[0].Trim() } else { $null }; extension = S $r.Extension; workPhone = S $r.WorkPhone }
}
$shipping = foreach ($r in Rows 'SELECT * FROM [Shipping Methods]') { [ordered]@{ id = $r.ShippingMethodID; name = S $r.ShippingMethod } }
$suppliers = foreach ($r in Rows 'SELECT * FROM Suppliers') {
  [ordered]@{ id = $r.SupplierID; name = S $r.SupplierName; contactName = S $r.ContactName; contactTitle = S $r.ContactTitle
    address = S $r.Address; city = S $r.City; postalCode = S $r.PostalCode; state = S $r.StateOrProvince; country = S $r.Country
    phone = S $r.PhoneNumber; fax = S $r.FaxNumber; paymentTerms = S $r.PaymentTerms
    email = if ($r.EmailAddress) { ("$($r.EmailAddress)" -split '#')[0].Trim() } else { $null }; notes = S $r.Notes }
}

# Lines, grouped by PO.
$lines = @{}
$lineSql = 'SELECT t.*, p.PROD_DESCRIP, p.SPEC, p.[PART#-DWG-JF] AS PartNo, p.[REV?] AS Rev, p.SerialNumber, p.LeadTime FROM [Inventory Transactions] t LEFT JOIN Products p ON t.ProductID = p.ProductID ORDER BY t.TransactionID'
foreach ($r in Rows $lineSql) {
  $po = $r.PurchaseOrderID
  if ($null -eq $po -or $po -is [System.DBNull]) { continue }
  if (-not $lines.ContainsKey($po)) { $lines[$po] = New-Object System.Collections.Generic.List[object] }
  $lines[$po].Add([ordered]@{
    transactionId = $r.TransactionID; date = D $r.TransactionDate; units = N $r.UnitsOrdered; unitPrice = N $r.UnitPrice
    wo = S $r.UnitsReceived; prodDescrip = S $r.PROD_DESCRIP; spec = S $r.SPEC; partNumber = S $r.PartNo; rev = S $r.Rev
    transactionDescription = S $r.TransactionDescription; serialNumber = S $r.SerialNumber; leadTime = S $r.LeadTime })
}

# POs + M-T-R attachments.
$pos = New-Object System.Collections.Generic.List[object]
$rs = $d.OpenRecordset('SELECT * FROM [Purchase Orders] ORDER BY PURCHASEORDERID', 4)
while (-not $rs.EOF) {
  $f = $rs.Fields
  $id = $f.Item('PURCHASEORDERID').Value
  $mtr = New-Object System.Collections.Generic.List[object]
  $att = $f.Item('M-T-R').Value
  while (-not $att.EOF) {
    $name = $att.Fields.Item('FileName').Value
    $safe = ($name -replace '[^A-Za-z0-9._-]', '_')
    $dir = Join-Path $mtrDir "$id"
    New-Item -ItemType Directory -Force $dir | Out-Null
    $path = Join-Path $dir $safe
    if (-not (Test-Path $path)) { $att.Fields.Item('FileData').SaveToFile($path) }
    $mtr.Add([ordered]@{ name = $name; file = "mtr/$id/$safe"; size = (Get-Item $path).Length })
    $att.MoveNext()
  }
  $att.Close()
  $v = { param($n) $f.Item($n).Value }
  # Typed array: a one-line PO must stay a list, not unroll into the line itself.
  [object[]]$poLines = @()
  if ($lines.ContainsKey($id)) { $poLines = $lines[$id].ToArray() }
  $pos.Add([ordered]@{
    id = $id; supplierId = & $v 'SupplierID'; employeeId = & $v 'EmployeeID'
    description = S (& $v 'PurchaseOrderDescription'); orderDate = D (& $v 'OrderDate'); eta = D (& $v 'DateRequired')
    datePromised = D (& $v 'DatePromised'); shipDate = D (& $v 'ShipDate'); shippingMethodId = & $v 'ShippingMethodID'
    freightCharge = N (& $v 'FreightCharge'); notes = S (& $v 'NOTES'); materialCondition = S (& $v 'MATERIAL IN CONDITION?')
    receivedDate = D (& $v 'ORDER RECIVED'); employeeReceived = S (& $v 'EMPLOYEE RECEIVED'); total = N (& $v 'TOTAL')
    heatNumber = S (& $v 'HT#'); jfPartDwg = S (& $v 'JF-PART#-DGW#'); status = S (& $v 'OPEN//CLOSE')
    timeOrder = T (& $v 'TIME ORDER'); active = [bool](& $v 'ACTIVE'); dwgPartJf = S (& $v 'DWG-PART-JF')
    hotRush = S (& $v 'HOT-RUSH'); partDwg = S (& $v 'PART-DWG-JF')
    matType = S (& $v 'MAT-TYPE'); poNumberText = S (& $v 'PurchaseOrderNumber')
    mtr = $mtr; lines = $poLines })
  $rs.MoveNext()
}
$rs.Close()
$d.Close()

$data = [ordered]@{ exportedAt = (Get-Date).ToString('s'); source = $Source; company = $companyOut
  employees = @($employees); shippingMethods = @($shipping); suppliers = @($suppliers); purchaseOrders = $pos }
$json = $data | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText((Join-Path $Out 'pos.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
"POs: $($pos.Count)  lines: $(($pos | ForEach-Object { $_.lines.Count } | Measure-Object -Sum).Sum)  suppliers: $(@($suppliers).Count)  employees: $(@($employees).Count)  mtr files: $(($pos | ForEach-Object { $_.mtr.Count } | Measure-Object -Sum).Sum)"
