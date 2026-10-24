param(
  [ValidateSet('Start', 'Stop', 'Status', 'Build')]
  [string]$Action = 'Start',
  [string]$BuildId
)
$ErrorActionPreference = 'Stop'

function Invoke-Eas {
  param([string[]]$CliArguments)
  & npx.cmd --yes eas-cli@25.2.0 @CliArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Expo command failed. Check the output above for login, simulator access, or build errors.'
  }
}

Push-Location (Split-Path $PSScriptRoot)
try {
  switch ($Action) {
    'Build' {
      Write-Host 'Building a native iOS Simulator app on EAS using the appetize-ios profile.'
      Write-Host 'This profile connects to the production backend. EAS build quota applies.'
      Invoke-Eas -CliArguments @('build', '--platform', 'ios', '--profile', 'appetize-ios', '--non-interactive')
    }
    'Status' {
      Invoke-Eas -CliArguments @('sim:list', '--platform', 'ios', '--limit', '5', '--non-interactive')
    }
    'Stop' {
      # The CLI reads the last session ID from mobile/.env.eas-simulator.
      Invoke-Eas -CliArguments @('sim:stop', '--non-interactive')
    }
    'Start' {
      if (-not $BuildId) {
        $buildOutput = Invoke-Eas -CliArguments @('build:list', '--platform', 'ios', '--status', 'finished', '--limit', '20', '--json', '--non-interactive')
        $builds = ($buildOutput -join "`n") | ConvertFrom-Json
        $build = $builds | Where-Object {
          $_.isForIosSimulator -and $_.artifacts.applicationArchiveUrl -and
          (-not $_.expirationDate -or [DateTimeOffset]::Parse($_.expirationDate) -gt [DateTimeOffset]::UtcNow)
        } | Select-Object -First 1
        if (-not $build) { throw 'No completed iOS Simulator build found. Run this script with -Action Build first.' }
        $BuildId = $build.id
        Write-Host "Using simulator build $BuildId from $($build.createdAt). Rebuild to include newer code."
      }
      Write-Host 'Starting a hosted native iOS Simulator. Expo simulator access and available quota are required.'
      Write-Host 'Open the preview URL printed below. Stop the session when finished to end usage.'
      Invoke-Eas -CliArguments @('sim:start', '--platform', 'ios', '--build-id', $BuildId, '--name', 'STARVNT-iOS', '--type', 'web-preview-only', '--max-idle-time-minutes', '5', '--non-interactive')
    }
  }
} finally {
  Pop-Location
}
