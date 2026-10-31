#Requires -Version 5.1
<#
.SYNOPSIS
    Reads the pending image queue (list or get) as JSON on stdout.
.DESCRIPTION
    Thin PowerShell wrapper over query-queue.mjs in the same directory.
.EXAMPLE
    $pending = .\query-queue.ps1 list --kind article | ConvertFrom-Json
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "query-queue.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "query-queue.ps1: cannot find query-queue.mjs next to this script ($scriptPath)"
    exit 2
}

& node $scriptPath @Rest
exit $LASTEXITCODE