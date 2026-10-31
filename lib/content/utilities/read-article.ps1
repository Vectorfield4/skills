#Requires -Version 5.1
<#
.SYNOPSIS
    Reads one article file as JSON, so the result pipes into ConvertFrom-Json.

.DESCRIPTION
    Thin PowerShell wrapper over read-article.mjs in the same directory. It
    forwards every argument and nothing else: the engine owns flag parsing and
    prints exactly one JSON document on stdout.

    Exit codes: 0 read, 1 unreadable file, 2 bad usage.

.EXAMPLE
    $a = .\read-article.ps1 --file articles\agco-deal.ru.md | ConvertFrom-Json
    if (-not $a.ok) { throw $a.error }
    $a.article.tags

.EXAMPLE
    .\read-article.ps1 --file articles\agco-deal.ru.md --field tags
#>
$ErrorActionPreference = "Stop"

$engine = Join-Path $PSScriptRoot "read-article.mjs"
if (-not (Test-Path -LiteralPath $engine)) {
    [Console]::Error.WriteLine("read-article.ps1: engine not found: $engine")
    exit 2
}

& node $engine @args
exit $LASTEXITCODE
