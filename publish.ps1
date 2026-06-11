# Push the latest estimator to the live site. NKK sir just refreshes after this.
$ErrorActionPreference = "Stop"
Set-Location "C:\git\ai-print-estimator"
Copy-Item paper_calculator.html index.html -Force
git add -A
git commit -m "publish: update live app" 2>$null
git push origin main
Write-Host "Published → https://mounojitd.github.io/mounojitd-ai-print-estimator/  (refresh in ~1 min)" -ForegroundColor Green
