param(
    [Parameter(Mandatory = $true)][string]$OutDir,
    [Parameter(Mandatory = $true)][string]$Stash
)

# Started when Cursor quits. If an update replaces main.js, put the startup hook back before Cursor opens again.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\CursorOpacityGuard", [ref]$created)
if (-not $created) { exit 0 }

$import = 'import"./cursor-opacity-runtime.mjs";'
$main = Join-Path $OutDir "main.js"
$files = "cursor-opacity-live.cjs", "cursor-opacity-runtime.mjs", "cursor-opacity-guard.cjs", "cursor-opacity-guard.ps1"

function Stamp {
    if (-not (Test-Path $main)) { return "" }
    $item = Get-Item $main
    return "$($item.Length)|$($item.LastWriteTimeUtc.Ticks)"
}

$initial = Stamp
$deadline = (Get-Date).AddMinutes(4)
$last = ""
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $now = Stamp
    if ($now -eq "" -or $now -eq $initial) { continue }
    # An update is writing files. Give it more time, and wait until main.js stops changing.
    $deadline = (Get-Date).AddMinutes(20)
    if ($now -ne $last) { $last = $now; continue }
    try {
        $text = [System.IO.File]::ReadAllText($main)
        if (-not $text.Contains($import)) {
            foreach ($name in $files) {
                $from = Join-Path $Stash $name
                if (Test-Path $from) { Copy-Item -Force $from (Join-Path $OutDir $name) }
            }
            # Cursor cannot start if main.js imports a file that is missing.
            if (-not (Test-Path (Join-Path $OutDir "cursor-opacity-runtime.mjs"))) { break }
            if (-not (Test-Path (Join-Path $OutDir "cursor-opacity-live.cjs"))) { break }
            if (-not $text.EndsWith("`n")) { $text += "`n" }
            $text += "$import`n"
            [System.IO.File]::WriteAllText($main, $text, (New-Object System.Text.UTF8Encoding($false)))
        }
        break
    } catch {
        $last = ""
    }
}
$mutex.ReleaseMutex()
