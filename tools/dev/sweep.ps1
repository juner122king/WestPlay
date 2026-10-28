# Clean up any leftover processes before running dev
Get-Process -Name "westplay" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
