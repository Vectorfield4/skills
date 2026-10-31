#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the product-match engine (aliases.mjs) in the same directory.
.DESCRIPTION
    Thin PowerShell wrapper over aliases.mjs. Forwards every argument and nothing
    else, so the engine owns flag parsing and prints exactly one JSON document
    on stdout.
#>
$ErrorActionPreference = "Stop"

$engine = Join-Path $PSScriptRoot "aliases.mjs"
if (-not (Test-Path -LiteralPath $engine)) {
    [Console]::Error.WriteLine("aliases.ps1: engine not found: $engine")
    exit 2
}

& node $engine @args
exit $LASTEXITCODE