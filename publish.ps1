# One-shot publish to GitHub Pages. Run AFTER `gh auth login`.
$ErrorActionPreference = "Stop"
$env:Path += ";$env:LOCALAPPDATA\Microsoft\WinGet\Links;C:\Program Files\GitHub CLI"
Set-Location "C:\git\ai-print-estimator"

# refresh the published copy
Copy-Item paper_calculator.html index.html -Force
git add -A
git commit -m "publish: update live app" 2>$null

# create the repo if it does not exist, then push
$exists = gh repo view mounojitd/ai-print-estimator 2>$null
if (-not $exists) {
  gh repo create mounojitd/ai-print-estimator --public --source=. --remote=origin --push
} else {
  git push -u origin master
}

# enable GitHub Pages from master / root (ignore error if already enabled)
try {
  gh api -X POST "repos/mounojitd/ai-print-estimator/pages" -f "source[branch]=master" -f "source[path]=/" 2>$null
} catch {}

Write-Host ""
Write-Host "LIVE URL:  https://mounojitd.github.io/ai-print-estimator/" -ForegroundColor Green
Write-Host "(first build takes ~1 minute; then NKK sir just refreshes)"
