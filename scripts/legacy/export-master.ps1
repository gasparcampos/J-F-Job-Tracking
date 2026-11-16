param([string]$OutDir)
$sw = [Diagnostics.Stopwatch]::StartNew()
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=\\JF-MACHINE\Main\ACCESS-101\ACCESS_FRONTEND.accdb;Mode=Read"
$c = New-Object System.Data.OleDb.OleDbConnection $cs; $c.Open()
$cmd = $c.CreateCommand(); $cmd.CommandText = "SELECT * FROM [MASTER]"
$rd = $cmd.ExecuteReader()
$fc = $rd.FieldCount
$names = @(); $seen = @{}
for ($i=0;$i -lt $fc;$i++){ $n=$rd.GetName($i); if($seen.ContainsKey($n)){$seen[$n]++; $n="$n#$($seen[$n])"}else{$seen[$n]=1}; $names+=$n }
$map = @{ 'JOB#'='jobNumber'; 'COMPANY'='customer'; 'DWG#'='dwgNumber'; 'PART#'='partNumber'; 'PO##'='poNumber';
  'NAME'='name'; 'QTY'='quantity'; 'NOTESSS'='productionNotes'; 'OERDER DATE'='orderDate'; 'DUE DATE'='dueDate';
  'SHIPPING'='shippedAt'; 'LINE ITEM'='line'; 'MASTER-PO'='materialPo'; 'HEAT#'='heatNumber'; 'MAT_ROUGHOUT_HRC'='hrc';
  'DEVIATION_DETAILS'='deviation'; 'OUTSERV'='outService'; 'ACTIVE'='legacyActive' }
function SizeOf($v){ if($v -is [string]){ return [Text.Encoding]::UTF8.GetByteCount($v)+1 } elseif($v -is [bool]){return 1} else {return 8} }
$docs = New-Object System.Collections.Generic.List[object]
$totalDoc=0L; $totalIdx=0L; $active=0; $maxDoc=0
while ($rd.Read()) {
  $id = "legacy-" + $rd.GetValue($rd.GetOrdinal('ID'))
  $doc = [ordered]@{}; $legacy = [ordered]@{}
  for ($i=0;$i -lt $fc;$i++) {
    if ($rd.IsDBNull($i)) { continue }
    $v = $rd.GetValue($i)
    if ($v -is [datetime]) { $v = $v.ToString('yyyy-MM-dd') }
    elseif ($v -is [string]) { $v = $v.Trim(); if ($v -eq '') { continue } }
    elseif ($v -is [bool]) { if (-not $v) { continue } }
    elseif ($v -is [byte[]]) { continue }
    else { $v = [string]$v }
    $n = $names[$i]
    if ($map.ContainsKey($n)) { $doc[$map[$n]] = $v } elseif ($n -ne 'ID') { $legacy[$n] = $v }
  }
  if ($doc['legacyActive']) { $active++ }
  $doc['title'] = "$($doc['jobNumber']) $($doc['name'])".Trim()
  $doc['shipped'] = $true; $doc['source'] = 'access-master'; $doc['legacyId'] = $id
  $doc['legacy'] = $legacy
  # Firestore storage size formula: doc name + fields + 32 overhead
  $s = 32 + 16 + $id.Length + 1
  $idx = 0
  foreach($k in $doc.Keys){ if($k -eq 'legacy'){ continue }; $fs = ($k.Length+1) + (SizeOf $doc[$k]); $s += $fs; $idx += 2*(32 + 16 + $id.Length + 1 + $fs) }
  $s += 7 + 1
  foreach($k in $legacy.Keys){ $s += ($k.Length+1) + (SizeOf $legacy[$k]) }
  $totalDoc += $s; $totalIdx += $idx; if($s -gt $maxDoc){$maxDoc=$s}
  $docs.Add($doc)
}
$rd.Close(); $c.Close()
$readSecs = $sw.Elapsed.TotalSeconds
$json = $docs | ConvertTo-Json -Depth 5 -Compress
$path = Join-Path $OutDir 'master_export.json'
[IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
"rows=$($docs.Count) activeFlag=$active"
"readAndMapSecs=$([math]::Round($readSecs,1)) totalSecs=$([math]::Round($sw.Elapsed.TotalSeconds,1))"
"jsonMB=$([math]::Round((Get-Item $path).Length/1MB,2))"
"firestoreDocsMB=$([math]::Round($totalDoc/1MB,2)) indexMB(est, legacy not indexed)=$([math]::Round($totalIdx/1MB,2)) maxDocKB=$([math]::Round($maxDoc/1KB,1))"
"avgDocKB=$([math]::Round($totalDoc/$docs.Count/1KB,2))"
