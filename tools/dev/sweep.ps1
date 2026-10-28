# Clean up any leftover processes before running dev
Get-Process -Name "westplay" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$pids = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $pids) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
