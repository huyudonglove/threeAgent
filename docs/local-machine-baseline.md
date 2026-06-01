# Local Machine Baseline

Last checked: 2026-06-01

This machine is usable for AgentThee and similar Node/Electron projects. The reliable default command style for Codex sessions is:

```powershell
corepack pnpm run doctor
corepack pnpm dev
corepack pnpm test
corepack pnpm build
```

## Confirmed Tools

- Windows: Windows 10 Home China
- PowerShell: 5.1
- PowerShell profile: configured for UTF-8 console IO
- Node: `v24.11.1`
- npm: `11.6.2`
- Corepack: `0.34.2`
- pnpm via Corepack: `10.33.0`
- Git: `2.34.1.windows.1`
- Git LFS: `3.0.2`
- VS Code: installed and on PATH
- Docker CLI and Compose: installed
- Miniconda: `D:\ailearing\miniconda3`, conda `26.1.1`, Python `3.13.12`

## Package Manager Baseline

- npm user registry: `https://mirrors.huaweicloud.com/repository/npm/`
- pnpm global registry: `https://mirrors.huaweicloud.com/repository/npm/`
- npm global prefix: `C:\Users\37914\AppData\Roaming\npm`
- This project pins `pnpm@10.33.0` in `package.json`.
- This project keeps Electron and electron-builder downloads on mirrors through `.npmrc` and wrapper scripts.

## Known Differences Between Normal Terminal And Codex Sandbox

- In the elevated/normal user environment, `npm`, `pnpm`, Docker CLI, and Docker Compose work.
- In Codex sandboxed shell sessions, bare `pnpm`, bare `npm`, or Docker config reads may fail because user profile directories and PowerShell script policy state can be isolated.
- Use `corepack pnpm ...` in Codex sessions to avoid those sandbox differences.

## Known Watch Points

- Docker Desktop daemon was not running during the audit. Docker CLI exists, but server checks fail until Docker Desktop is started.
- Global Git `user.email` is set, but global `user.name` was not set during the audit. Set it before making commits that should carry a human name.
- System Git has `core.autocrlf=true`. Project `.gitattributes` pins text files to LF and Windows scripts to CRLF to reduce line-ending churn.
- PATH contains duplicate nvm-related entries in the current process: `D:\Users\37914\AppData\Local\nvm` and `D:\nvm4w\nodejs`.
- PowerShell 5.1 does not support `&&`; use semicolons or separate commands in scripts intended for the default terminal.

## Repeatable Checks

Run the project doctor:

```powershell
corepack pnpm run doctor
```

Run the broader machine doctor:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\machine-doctor.ps1
```
