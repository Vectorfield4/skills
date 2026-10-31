#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the sales-report engine (report.mjs) in the same directory.
.DESCRIPTION
    Thin PowerShell wrapper over report.mjs. Forwards every argument and nothing
    else, so the engine owns flag parsing and prints its report on stdout.
#>
$ErrorActionPreference = "Stop"

$engine = Join-Path $PSScriptRoot "report.mjs"
if (-not (Test-Path -LiteralPath $engine)) {
    [Console]::Error.WriteLine("report.ps1: engine not found: $engine")
    exit 2
}

& node $engine @args
exit $LASTEXITCODE