#Requires -Version 5.1
<#
.SYNOPSIS
    Read-only geo domain guard: does this project's TS/domain layer match its
    map groups and fixtures? Prints JSON on stdout, exit 1 when a check fails.

.DESCRIPTION
    Thin PowerShell wrapper over check-domain.mjs in the same directory. Keeps the
    utility chainable in a PowerShell session: JSON on stdout, exit 0/1/2.

.EXAMPLE
    $report = .\check-domain.ps1 --project D:\docs\GitHub\vodaizrodnika | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "geo domain checks failed" }
#>
[CmdletBinding()]
param(
    [string]$Project,
    [string]$Out,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "check-domain.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "check-domain.ps1: cannot find check-domain.mjs next to this script ($scriptPath)"
    exit 2
}

$nodeArgs = New-Object System.Collections.Generic.List[string]
$nodeArgs.Add($scriptPath)
if (-not [string]::IsNullOrWhiteSpace($Project)) { $nodeArgs.Add("--project=$Project") }
if (-not [string]::IsNullOrWhiteSpace($Out)) { $nodeArgs.Add("--out=$Out") }
foreach ($extra in $Rest) { $nodeArgs.Add($extra) }

& node @nodeArgs
exit $LASTEXITCODE