#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the product-match engine (tags.mjs) in the same directory.
.DESCRIPTION
    Thin PowerShell wrapper over tags.mjs. Forwards every argument and nothing
    else, so the engine owns flag parsing and prints exactly one JSON document
    on stdout.
#>
$ErrorActionPreference = "Stop"

$engine = Join-Path $PSScriptRoot "tags.mjs"
if (-not (Test-Path -LiteralPath $engine)) {
    [Console]::Error.WriteLine("tags.ps1: engine not found: $engine")
    exit 2
}

& node $engine @args
exit $LASTEXITCODE