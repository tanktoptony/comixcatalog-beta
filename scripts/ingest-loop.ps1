#!/usr/bin/env pwsh
# ingest-loop.ps1 - unattended cover ingest across all gap files.
#
# Loops the ingester across gap-featured / gap-manual / gap-width / gap-depth.
# After each invocation, measures the done-ledger size delta to decide if
# the file actually had work. A file is considered exhausted only after 3
# CONSECUTIVE invocations where the ledger didn't grow -- this fixes a
# previous version that incorrectly counted every cycle as empty.
#
# Ctrl+C is safe at any time. The .ingest-done.json ledger persists, so
# resuming with the same command picks up exactly where you stopped.

$ErrorActionPreference = "Stop"

$Targets = @(
    "gap-featured.json",
    "gap-manual.json",
    "gap-width.json",
    "gap-depth.json"
)

# Cooldown between cycles. CV's rolling-window quota replenishes ~one slot
# per 18s; 30 min is comfortably full budget.
$CooldownSeconds = 1800

# Per-file consecutive-empty counter. Resets on any progress.
$EmptyCycles = @{}
foreach ($t in $Targets) { $EmptyCycles[$t] = 0 }

function Get-LedgerSize {
    if (-not (Test-Path ".ingest-done.json")) { return 0 }
    try {
        return [int](& python -c "import json; print(len(json.load(open('.ingest-done.json', encoding='utf-8'))))")
    } catch {
        return 0
    }
}

$cycle = 0
while ($true) {
    $cycle++
    Write-Host ""
    Write-Host "================================================================"
    Write-Host "  CYCLE $cycle  ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
    Write-Host "================================================================"

    $anyProgressThisCycle = $false

    foreach ($target in $Targets) {
        if (-not (Test-Path $target)) {
            Write-Host "  skip: $target not present"
            continue
        }

        if ($EmptyCycles[$target] -ge 3) {
            Write-Host "  $target -- 3 consecutive empty runs, skipping"
            continue
        }

        Write-Host ""
        Write-Host "---- $target ----"

        $ledgerBefore = Get-LedgerSize
        & python comicvine_api_to_supabase.py --targets $target --skip-existing
        $exit = $LASTEXITCODE
        $ledgerAfter = Get-LedgerSize
        $delta = $ledgerAfter - $ledgerBefore

        Write-Host "  (exit: $exit, ledger delta: +$delta, total: $ledgerAfter)"

        if ($delta -gt 0) {
            $EmptyCycles[$target] = 0
            $anyProgressThisCycle = $true
        } else {
            $EmptyCycles[$target] += 1
        }
    }

    if (-not $anyProgressThisCycle) {
        # If no file made progress this cycle, we've likely exhausted the
        # current gap files. Don't sleep through cooldown -- bail.
        $stalled = $true
        foreach ($t in $Targets) {
            if ($EmptyCycles[$t] -lt 3) { $stalled = $false; break }
        }
        if ($stalled) {
            Write-Host ""
            Write-Host "No progress this cycle and all files exhausted. Exiting."
            break
        }
        Write-Host ""
        Write-Host "No progress this cycle, but some files still have retry budget."
        Write-Host "Sleeping $($CooldownSeconds / 60) min before next attempt..."
    } else {
        Write-Host ""
        Write-Host "Progress made. Sleeping $($CooldownSeconds / 60) min for CV rate cooldown..."
    }
    Write-Host "  (Ctrl+C to stop; ledger is safe -- resume any time.)"
    Start-Sleep -Seconds $CooldownSeconds
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  INGEST LOOP COMPLETE  ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
Write-Host "================================================================"
