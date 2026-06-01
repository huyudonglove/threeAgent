Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Write-Check {
  param(
    [string]$Name,
    [scriptblock]$Probe,
    [switch]$Optional
  )

  try {
    $value = & $Probe
    $text = ($value | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
      Write-Host ("ok   {0}" -f $Name)
    } else {
      Write-Host ("ok   {0}: {1}" -f $Name, ($text -replace "`r?`n", "; "))
    }
  } catch {
    $level = if ($Optional) { 'info' } else { 'warn' }
    Write-Host ("{0} {1}: {2}" -f $level, $Name, $_.Exception.Message)
  }
}

function Invoke-Native {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments = @(),
    [switch]$Optional
  )

  try {
    $resolvedCommand = (Get-Command $Command -ErrorAction Stop).Source
    $isCmdScript = $resolvedCommand -match '\.(cmd|bat)$'
    $escapedArguments = ($Arguments | ForEach-Object {
      if ($_ -match '[\s"]') {
        '"' + ($_ -replace '"', '\"') + '"'
      } else {
        $_
      }
    }) -join ' '

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($isCmdScript) {
      $psi.FileName = $env:ComSpec
      $psi.Arguments = '/d /s /c "' + '"' + $resolvedCommand + '" ' + $escapedArguments + '"'
    } else {
      $psi.FileName = $resolvedCommand
      $psi.Arguments = $escapedArguments
    }
    $psi.WorkingDirectory = if ($Command -like 'npm*') { $env:TEMP } else { (Get-Location).Path }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    if ($Command -like 'npm*') {
      $npmEnvKeys = @($psi.Environment.Keys | Where-Object { $_ -like 'npm_config_*' })
      foreach ($key in $npmEnvKeys) {
        [void]$psi.Environment.Remove($key)
      }
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $exitCode = $process.ExitCode
    $text = (($stdout, $stderr | Where-Object { $_ }) -join "`n").Trim()
    if ($exitCode -eq 0) {
      if ([string]::IsNullOrWhiteSpace($text)) {
        Write-Host ("ok   {0}" -f $Name)
      } else {
        Write-Host ("ok   {0}: {1}" -f $Name, ($text -replace "`r?`n", "; "))
      }
    } else {
      $level = if ($Optional) { 'info' } else { 'warn' }
      Write-Host ("{0} {1}: exit {2}{3}" -f $level, $Name, $exitCode, $(if ($text) { ": $text" } else { '' }))
    }
  } catch {
    $level = if ($Optional) { 'info' } else { 'warn' }
    Write-Host ("{0} {1}: {2}" -f $level, $Name, $_.Exception.Message)
  }
}

Write-Host 'AgentThee machine doctor'
Write-Host ("cwd: {0}" -f (Get-Location).Path)
Write-Host ''

Write-Check 'PowerShell' { $PSVersionTable.PSVersion.ToString() }
Write-Check 'ExecutionPolicy CurrentUser' { Get-ExecutionPolicy -Scope CurrentUser }
Invoke-Native 'node' 'node' @('-v')
Invoke-Native 'npm.cmd' 'npm.cmd' @('-v')
Invoke-Native 'corepack' 'corepack' @('--version')
Invoke-Native 'corepack pnpm' 'corepack' @('pnpm', '-v')
Invoke-Native 'pnpm.cmd direct shim' 'pnpm.cmd' @('-v') -Optional
Invoke-Native 'git' 'git' @('--version')
Invoke-Native 'git-lfs' 'git' @('lfs', 'version')
Write-Check 'VS Code command' { (Get-Command code -ErrorAction Stop).Source } -Optional
Invoke-Native 'VS Code version' 'code' @('--version') -Optional
Invoke-Native 'Docker client' 'docker' @('--version') -Optional
Invoke-Native 'Docker compose' 'docker' @('compose', 'version') -Optional
Invoke-Native 'Conda' 'D:\ailearing\miniconda3\Scripts\conda.exe' @('--version') -Optional
Invoke-Native 'Conda Python' 'D:\ailearing\miniconda3\python.exe' @('--version') -Optional

Write-Host ''
Write-Host 'PATH duplicates:'
$duplicates = $env:Path -split ';' | Where-Object { $_ } | Group-Object | Where-Object Count -gt 1
if ($duplicates) {
  $duplicates | ForEach-Object { Write-Host ("warn duplicate x{0}: {1}" -f $_.Count, $_.Name) }
} else {
  Write-Host 'ok   no duplicate PATH entries in this process'
}

Write-Host ''
Write-Host 'Git global identity:'
$gitName = git config --global user.name
$gitEmail = git config --global user.email
if ($gitName) { Write-Host ("ok   user.name: {0}" -f $gitName) } else { Write-Host 'warn user.name is not set' }
if ($gitEmail) { Write-Host ("ok   user.email: {0}" -f $gitEmail) } else { Write-Host 'warn user.email is not set' }

Write-Host ''
Write-Host 'Notes:'
Write-Host '- In Codex sandbox sessions, prefer corepack pnpm even if bare pnpm works in a normal terminal.'
Write-Host '- Docker daemon must be running for docker version server checks to pass.'
