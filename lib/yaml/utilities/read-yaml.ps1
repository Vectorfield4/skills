#Requires -Version 5.1
<#
.SYNOPSIS
    Reads a YAML domain file, validates it against its TypeScript contract and
    prints JSON, so the result pipes into ConvertFrom-Json in a skill chain.

.DESCRIPTION
    Thin PowerShell wrapper over read-yaml.mjs in the same directory. It exists
    for chaining: every other skill in this repo prints JSON on stdout and uses
    exit code 0/1/2, and this keeps that contract in a PowerShell session.

    -Type takes a domain path inside the skills repo lib/ (for example
    "content/precedent-questionnaire") or a path to a .ts file.
    -File defaults to stdin, so `Get-Content x.yaml | .\read-yaml.ps1 -Type t` works.

    Exit codes: 0 valid, 1 schema violations, 2 broken YAML, type or arguments.

.EXAMPLE
    $q = .\read-yaml.ps1 -Type content/precedent-questionnaire -File data\content\precedent-questionnaire.yaml | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "questionnaire is not valid" }
    $q.results.primary | Format-Table name, baseline, after

.EXAMPLE
    .\read-yaml.ps1 -Type content/precedent-questionnaire -File x.yaml -Report -Pretty
#>
[CmdletBinding()]
param(
    # Contract: "content/precedent-questionnaire" (lib/<domain>/<name>.ts) or a path to a .ts file.
    [Parameter(Position = 0)]
    [string]$Type,

    # YAML to read. Omit to read stdin.
    [Parameter(Position = 1)]
    [string]$File,

    # Entry interface, when the contract declares more than one root.
    [string]$Entry,

    # Unknown fields and null-where-not-allowed become errors.
    [switch]$Strict,

    # Print the validation report instead of the document.
    [switch]$Report,

    # Indented JSON output.
    [switch]$Pretty,

    # No summary and no findings on stderr.
    [switch]$Quiet,

    # Convert YAML to JSON only; -Type becomes optional.
    [switch]$NoValidate,

    # Override the skills repo lib/ root used to resolve -Type.
    [string]$Lib,

    # Anything else goes straight to read-yaml.mjs.
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

if (-not $NoValidate -and [string]::IsNullOrWhiteSpace($Type)) {
    Write-Error "read-yaml.ps1: -Type is required unless -NoValidate is passed"
    exit 2
}

$scriptPath = Join-Path $PSScriptRoot "read-yaml.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "read-yaml.ps1: cannot find read-yaml.mjs next to this script ($scriptPath)"
    exit 2
}

$nodeArgs = New-Object System.Collections.Generic.List[string]
$nodeArgs.Add($scriptPath)
if (-not [string]::IsNullOrWhiteSpace($Type)) { $nodeArgs.Add("--type=$Type") }
if (-not [string]::IsNullOrWhiteSpace($File)) { $nodeArgs.Add("--file=$File") }
if (-not [string]::IsNullOrWhiteSpace($Entry)) { $nodeArgs.Add("--entry=$Entry") }
if (-not [string]::IsNullOrWhiteSpace($Lib)) { $nodeArgs.Add("--lib=$Lib") }
if ($Strict) { $nodeArgs.Add("--strict") }
if ($Report) { $nodeArgs.Add("--report") }
if ($Pretty) { $nodeArgs.Add("--pretty") }
if ($Quiet) { $nodeArgs.Add("--quiet") }
if ($NoValidate) { $nodeArgs.Add("--no-validate") }
foreach ($extra in $Rest) { $nodeArgs.Add($extra) }

& node @nodeArgs
$status = $LASTEXITCODE
exit $status
