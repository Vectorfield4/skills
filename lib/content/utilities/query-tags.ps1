#Requires -Version 5.1
<#
.SYNOPSIS
    Reads the tag registry (status or list) as JSON on stdout.
.DESCRIPTION
    Thin PowerShell wrapper over query-tags.mjs in the same directory.
.EXAMPLE
    $status = .\query-tags.ps1 status --file data\hello-robot.ru\tags.yaml | ConvertFrom-Json
    if (-not $status.fresh) { throw "registry is stale" }
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "query-tags.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "query-tags.ps1: cannot find query-tags.mjs next to this script ($scriptPath)"
    exit 2
}

& node $scriptPath @Rest
exit $LASTEXITCODE