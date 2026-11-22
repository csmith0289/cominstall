# Runs docs/agents/ticket-loop.md on this machine, one iteration at a time, each in a fresh `claude -p` session.
# One agent, one ticket at a time: iterations never overlap.
# Start:  powershell -ExecutionPolicy Bypass -File scripts\ticket-loop.ps1
# Stop:   add the label "loop: stop" to the brief issue, or create a file named STOP in the repo root.
#         It also stops by itself when no ticket is in progress or ready for an agent.

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$logs = Join-Path $repo ".scratch\loop-logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

foreach ($tool in "claude", "gh", "git") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Write-Error "$tool is not on PATH."; exit 1 }
}

# Keep the machine awake while this script runs (no settings are changed; it ends with the script).
Add-Type -Namespace Loop -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[Loop.Power]::SetThreadExecutionState([uint32]"0x80000001") | Out-Null  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

$allowed = @(
  "Read", "Edit", "Write", "Glob", "Grep", "Agent", "Task", "TodoWrite", "WebFetch", "WebSearch",
  "Bash(pnpm:*)", "Bash(corepack:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(bash scripts/land-pr.sh:*)", "Bash(bash scripts/check.sh)", "Bash(bash scripts/check.sh:*)",
  "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git add:*)",
  "Bash(git commit:*)", "Bash(git checkout:*)", "Bash(git switch:*)", "Bash(git branch:*)",
  "Bash(git merge:*)", "Bash(git rebase:*)", "Bash(git revert:*)", "Bash(git fetch:*)", "Bash(git pull:*)",
  "Bash(git push origin:*)", "Bash(git push -u origin:*)", "Bash(git push --force-with-lease origin:*)",
  "Bash(git stash:*)", "Bash(git rm:*)", "Bash(git mv:*)", "Bash(gh:*)",
  "Bash(date:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(grep:*)",
  "Bash(find:*)", "Bash(mkdir:*)", "Bash(curl:*)"
) -join ","
$disallowed = "Bash(git push --force origin:*),Bash(git push -f:*),Bash(git push origin master --force:*),Bash(git reset --hard:*),Bash(rm -rf:*)"

$prompt = "Run exactly one iteration of docs/agents/ticket-loop.md, then stop. Nobody is watching: never ask a question. " +
  "Use 'corepack pnpm' if pnpm is not on PATH. Start from an up-to-date master (git fetch, git switch master, git pull --ff-only) before switching to the ticket's branch."

function Test-Stop {
  if (Test-Path (Join-Path $repo "STOP")) { Write-Host "STOP file found."; return $true }
  $stopped = gh issue list --label brief --label "loop: stop" --state open --json number --jq length
  if ($stopped -and $stopped -ne "0") { Write-Host "Brief issue has 'loop: stop'."; return $true }
  # Labels are read in PowerShell: Windows PowerShell mangles double quotes inside a --jq argument.
  $labels = gh issue list --label ticket --state open --limit 200 --json labels --jq '.[].labels[].name'
  if ($LASTEXITCODE -ne 0) { Write-Host "gh failed; carrying on."; return $false }
  $work = @($labels | Where-Object { $_ -eq "in-progress" -or $_ -eq "ready-for-agent" }).Count
  if ($work -eq 0) { Write-Host "No ticket is in progress or ready: nothing to do."; return $true }
  return $false
}

$iteration = 0
try {
  while (-not (Test-Stop)) {
    $iteration++
    $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
    $log = Join-Path $logs "$stamp-iteration-$iteration.log"
    Write-Host "[$stamp] iteration $iteration -> $log"
    claude -p $prompt --permission-mode acceptEdits --allowedTools $allowed --disallowedTools $disallowed *> $log
    if ($LASTEXITCODE -ne 0) {
      Write-Host "iteration $iteration exited $LASTEXITCODE (usage limit or error); waiting 30 minutes"
      Start-Sleep -Seconds 1800
    } else {
      Start-Sleep -Seconds 60
    }
  }
} finally {
  Remove-Item (Join-Path $repo "STOP") -ErrorAction SilentlyContinue
  [Loop.Power]::SetThreadExecutionState([uint32]"0x80000000") | Out-Null
  Write-Host "Loop stopped after $iteration iterations."
}
