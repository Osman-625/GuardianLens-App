# Starts the GuardianLens API (port 8000) and the website (port 3000) in the background.
# Run it from a terminal where the conda environment is active:
#     conda activate Guardianlens_venv
# (see environment.yml for how to create it). The API runs with that environment's Python.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $env:CONDA_PREFIX) { throw "Activate the conda environment first: conda activate Guardianlens_venv" }
$ApiPython = Join-Path $env:CONDA_PREFIX "python.exe"
if (-not (Test-Path -LiteralPath $ApiPython)) { throw "No python.exe in the active conda environment ($env:CONDA_PREFIX). Create it from environment.yml." }
$Api = Start-Process -WindowStyle Hidden -FilePath $ApiPython -ArgumentList "-m", "uvicorn", "api.main:app", "--reload", "--port", "8000" -WorkingDirectory $Root -PassThru
$Web = Start-Process -WindowStyle Hidden -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $Root "frontend") -PassThru
Write-Host "GuardianLens API: http://localhost:8000"
Write-Host "GuardianLens web: http://localhost:3000"
Write-Host "Press Ctrl+C, then stop process IDs $($Api.Id) and $($Web.Id) if they remain running."
Wait-Process -Id $Api.Id, $Web.Id
