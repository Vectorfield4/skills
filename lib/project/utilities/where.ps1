#Requires -Version 5.1
<#
.SYNOPSIS
    Prints the project root and its skill config as JSON on stdout.
.DESCRIPTION
    Thin PowerShell wrapper over where.mjs in the same directory.
.EXAMPLE
    $info = .\where.ps1 | ConvertFrom-Json
    $info.root
#>
[CmdletBinding()]
param(
    [string]$Config,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "where.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "where.ps1: cannot find where.mjs next to this script ($scriptPath)"
    exit 2
}

$nodeArgs = New-Object System.Collections.Generic.List[string]
$nodeArgs.Add($scriptPath)
if (-not [string]::IsNullOrWhiteSpace($Config)) { $nodeArgs.Add("--config=$Config") }
foreach ($extra in $Rest) { $nodeArgs.Add($extra) }

& node @nodeArgs
exit $LASTEXITCODE