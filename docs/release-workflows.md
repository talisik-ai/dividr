# Release Workflows Guide

This guide explains how to use the GitHub Actions workflows for building and releasing Dividr across different platforms.

## Table of Contents

1. [Overview](#overview)
2. [Workflow Files](#workflow-files)
3. [Tag Conventions](#tag-conventions)
4. [Platform-Specific Builds](#platform-specific-builds)
5. [Manual Triggers](#manual-triggers)
6. [GitHub Secrets Configuration](#github-secrets-configuration)
7. [Build Outputs](#build-outputs)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Dividr uses GitHub Actions for automated builds and releases. The workflows support:

- **Full releases** - Build all platforms (Windows, macOS, Linux) simultaneously
- **Platform-specific releases** - Build only one platform when needed
- **Manual triggers** - Run builds on-demand without creating tags
- **Code signing & notarization** - macOS builds are signed and notarized with Apple

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflows                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Tag: v1.0.0           Tag: v1.0.0-macos      Tag: v1.0.0-win   │
│       │                      │                      │           │
│       ▼                      ▼                      ▼           │
│  ┌─────────┐           ┌─────────┐            ┌─────────┐       │
│  │ release │           │ release │            │ release │       │
│  │  .yml   │           │ -macos  │            │-windows │       │
│  └────┬────┘           │  .yml   │            │  .yml   │       │
│       │                └────┬────┘            └────┬────┘       │
│       ▼                     ▼                      ▼            │
│  ┌─────────┐           ┌─────────┐            ┌─────────┐       │
│  │Windows  │           │ macOS   │            │ Windows │       │
│  │ macOS   │           │arm64/x64│            │  x64    │       │
│  │ Linux   │           │ Signed  │            │  NSIS   │       │
│  └─────────┘           └─────────┘            └─────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workflow Files

| File | Purpose | Trigger Tags |
|------|---------|--------------|
| `.github/workflows/release.yml` | Full multi-platform release | `v*` (e.g., `v1.0.0`) |
| `.github/workflows/release-macos.yml` | macOS only (signed + notarized) | `v*-macos`, `v*-mac` |
| `.github/workflows/release-windows.yml` | Windows only (NSIS installer) | `v*-windows`, `v*-win` |
| `.github/workflows/release-linux.yml` | Linux only (deb, rpm, zip) | `v*-linux` |

---

## Tag Conventions

### Full Release (All Platforms)

```bash
# Creates builds for Windows, macOS (arm64 + x64), and Linux
git tag v1.0.0
git push origin v1.0.0
```

### macOS Only

```bash
# Using -macos suffix
git tag v1.0.0-macos
git push origin v1.0.0-macos

# Or using -mac suffix
git tag v1.0.0-mac
git push origin v1.0.0-mac
```

### Windows Only

```bash
# Using -windows suffix
git tag v1.0.0-windows
git push origin v1.0.0-windows

# Or using -win suffix
git tag v1.0.0-win
git push origin v1.0.0-win
```

### Linux Only

```bash
# Using -linux suffix
git tag v1.0.0-linux
git push origin v1.0.0-linux
```

### Pre-release Tags

Tags containing `alpha`, `beta`, or `rc` are automatically marked as pre-releases:

```bash
git tag v1.0.0-beta.1
git tag v1.0.0-rc.1-macos
git tag v1.0.0-alpha-win
```

### Quick Reference Table

| Tag Pattern | Workflow Triggered | Platforms Built |
|-------------|-------------------|-----------------|
| `v1.0.0` | release.yml | Windows, macOS (arm64 + x64), Linux |
| `v1.0.0-macos` | release-macos.yml | macOS (arm64 + x64) |
| `v1.0.0-mac` | release-macos.yml | macOS (arm64 + x64) |
| `v1.0.0-windows` | release-windows.yml | Windows (x64) |
| `v1.0.0-win` | release-windows.yml | Windows (x64) |
| `v1.0.0-linux` | release-linux.yml | Linux (x64) |

---

## Platform-Specific Builds

### macOS Build Details

**Architectures:** arm64 (Apple Silicon) and x64 (Intel)

**Features:**
- Code signing with Developer ID certificate
- Notarization with Apple's notary service
- Hardened runtime enabled
- Entitlements configured for Electron apps

**Output Formats:**
- `.zip` - Portable application archive
- `.dmg` - Disk image installer (if configured)
- `.pkg` - macOS installer package (if configured)

**Build Time:** ~15-20 minutes per architecture (including notarization)

### Windows Build Details

**Architecture:** x64

**Features:**
- NSIS installer with customization options
- Desktop and Start Menu shortcuts
- Custom installation directory support
- Retry mechanism for network issues

**Output Formats:**
- `.exe` - NSIS installer
- `.zip` - Portable application archive

**Build Time:** ~10-15 minutes

### Linux Build Details

**Architecture:** x64

**Features:**
- Multiple package formats for different distributions
- Desktop integration files included

**Output Formats:**
- `.deb` - Debian/Ubuntu package
- `.rpm` - Fedora/RHEL/CentOS package
- `.zip` - Portable application archive

**Build Time:** ~8-12 minutes

---

## Manual Triggers

All workflows support manual triggering via the GitHub Actions UI.

### How to Trigger Manually

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Select the desired workflow from the left sidebar
4. Click **Run workflow** button
5. Configure options (if available)
6. Click **Run workflow** to start

### Manual Trigger Options

#### Release macOS

| Option | Values | Description |
|--------|--------|-------------|
| Architecture | `both`, `arm64`, `x64` | Which architecture(s) to build |
| Create GitHub Release | `true`, `false` | Whether to create a release |

#### Release Windows

| Option | Values | Description |
|--------|--------|-------------|
| Create GitHub Release | `true`, `false` | Whether to create a release |

#### Release Linux

| Option | Values | Description |
|--------|--------|-------------|
| Create GitHub Release | `true`, `false` | Whether to create a release |

### Use Cases for Manual Triggers

- **Testing builds** without creating a release
- **Building specific architecture** (e.g., only arm64 for macOS)
- **Re-running failed builds** without creating new tags
- **CI/CD debugging** and verification

---

## GitHub Secrets Configuration

### Required Secrets for All Platforms

| Secret | Required For | Description |
|--------|--------------|-------------|
| `GITHUB_TOKEN` | All | Automatically provided by GitHub Actions |

### Required Secrets for macOS Builds

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 certificate | Export from Keychain, run `base64 -i cert.p12 \| pbcopy` |
| `MACOS_CERTIFICATE_PWD` | Password for .p12 file | Password set during certificate export |
| `KEYCHAIN_PASSWORD` | Temporary keychain password | Generate with `openssl rand -base64 32` |
| `APPLE_IDENTITY` | Code signing identity | Run `security find-identity -v -p codesigning` |
| `APPLE_INSTALLER_IDENTITY` | Installer signing identity | Same as above, for Installer certificate |
| `APPLE_ID` | Apple Developer email | Your Apple ID |
| `APPLE_PASSWORD` | App-specific password | Generate at [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character Team ID | Find in Apple Developer portal |

### Setting Up Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the secret name and value
5. Click **Add secret**

### Verifying Secrets

To verify your macOS secrets are correctly configured:

```bash
# Test certificate locally
security find-identity -v -p codesigning

# Test notarization credentials
xcrun notarytool history \
  --apple-id "your-id@email.com" \
  --password "your-app-specific-password" \
  --team-id "YOUR_TEAM_ID"
```

---

## Build Outputs

### Artifacts

Each build creates artifacts that are:
1. Uploaded to GitHub Actions (available for 90 days)
2. Attached to the GitHub Release (permanent)

### Release Structure

A typical full release contains:

```
Release v1.0.0
├── dividr-1.0.0-setup.exe          # Windows NSIS installer
├── dividr-win32-x64-1.0.0.zip      # Windows portable
├── dividr-darwin-arm64-1.0.0.zip   # macOS Apple Silicon
├── dividr-darwin-x64-1.0.0.zip     # macOS Intel
├── dividr_1.0.0_amd64.deb          # Linux Debian/Ubuntu
├── dividr-1.0.0.x86_64.rpm         # Linux Fedora/RHEL
└── dividr-linux-x64-1.0.0.zip      # Linux portable
```

### Downloading Artifacts Without Release

If you ran a manual build without creating a release:

1. Go to **Actions** tab
2. Click on the completed workflow run
3. Scroll down to **Artifacts** section
4. Download the desired artifact

---

## Troubleshooting

### Common Issues

#### Windows: "GH_TOKEN is not set"

**Error:**
```
GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"
```

**Solution:** The workflow already includes `GH_TOKEN`. If this persists, check that `secrets.GITHUB_TOKEN` is accessible.

#### Windows: "Unexpected end of JSON input"

**Error:**
```
SyntaxError: Unexpected end of JSON input
```

**Cause:** Network issues when downloading NSIS binaries from GitHub.

**Solution:** The workflow includes retry logic (3 attempts) and NSIS caching. If it still fails:
- Re-run the workflow
- Check GitHub status for API issues

#### Linux: "could not find the Electron app binary"

**Error:**
```
could not find the Electron app binary at ".../dividr"
```

**Cause:** Mismatch between `executableName` in forge.config.ts and package name.

**Solution:** Ensure `executableName` is lowercase `dividr` in `forge.config.ts`.

#### macOS: "MAC verification failed"

**Error:**
```
security: SecKeychainItemImport: MAC verification failed
```

**Cause:** Incorrect certificate password or corrupted base64 encoding.

**Solution:**
1. Re-export the .p12 certificate from Keychain
2. Re-encode to base64: `base64 -i certificate.p12 | pbcopy`
3. Update the `MACOS_CERTIFICATE` secret

#### macOS: "Unable to notarize app"

**Error:**
```
Error: Unable to notarize app
```

**Solutions:**
1. Verify app-specific password (not your Apple ID password)
2. Check Team ID matches your certificate
3. Ensure Apple Developer account is in good standing
4. Test credentials locally:
   ```bash
   xcrun notarytool history --apple-id "..." --password "..." --team-id "..."
   ```

#### macOS: "Identity not found"

**Error:**
```
errSecInternalComponent
```

**Cause:** Certificate identity doesn't match `APPLE_IDENTITY` secret.

**Solution:**
1. List available identities: `security find-identity -v -p codesigning`
2. Copy the exact identity string (including quotes)
3. Update `APPLE_IDENTITY` secret

### Debugging Workflows

#### View Detailed Logs

1. Go to **Actions** tab
2. Click on the failed workflow run
3. Click on the failed job
4. Expand failed step to see logs

#### Re-run Failed Jobs

1. Go to the failed workflow run
2. Click **Re-run failed jobs** or **Re-run all jobs**

#### Enable Debug Logging

Add these secrets to enable verbose logging:
- `ACTIONS_RUNNER_DEBUG`: `true`
- `ACTIONS_STEP_DEBUG`: `true`

### Getting Help

If you encounter issues not covered here:

1. **Check existing issues** in the repository
2. **Review workflow logs** for specific error messages
3. **Create a new issue** with:
   - Workflow name and run URL
   - Error message
   - Steps to reproduce

---

## Best Practices

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)
- Increment MAJOR for breaking changes
- Increment MINOR for new features
- Increment PATCH for bug fixes

### Release Process

1. **Update version** in `package.json`
2. **Commit changes**: `git commit -m "Bump version to 1.0.0"`
3. **Create tag**: `git tag v1.0.0`
4. **Push changes**: `git push origin main --tags`

### Testing Before Release

1. Run manual build without release
2. Download and test artifacts locally
3. Create release tag once verified

### Hotfix Releases

For quick platform-specific fixes:

```bash
# Fix only affects Windows
git tag v1.0.1-win
git push origin v1.0.1-win
```

---

## Configuration Files

### forge.config.ts

Key settings for builds:

```typescript
// macOS code signing (activated by APPLE_IDENTITY env var)
...(process.env.APPLE_IDENTITY && {
  osxSign: {
    identity: process.env.APPLE_IDENTITY,
    optionsForFile: () => ({
      hardenedRuntime: true,
      entitlements: './entitlements.plist',
      'entitlements-inherit': './entitlements.plist',
    }),
  },
}),
```

### entitlements.plist

Required entitlements for macOS:

| Entitlement | Purpose |
|-------------|---------|
| `com.apple.security.cs.allow-jit` | Required for Electron |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Required for Electron |
| `com.apple.security.cs.disable-library-validation` | Load non-Apple dylibs |
| `com.apple.security.files.user-selected.read-write` | File access for editing |
| `com.apple.security.device.audio-input` | Audio recording |
| `com.apple.security.device.camera` | Video capture |

---

## Appendix

### Complete Tag Examples

```bash
# Full releases
git tag v1.0.0                    # All platforms
git tag v1.0.0-beta.1             # Pre-release, all platforms

# macOS only
git tag v1.0.0-macos              # Both architectures
git tag v1.0.0-mac                # Both architectures
git tag v1.0.0-beta-macos         # Pre-release

# Windows only
git tag v1.0.0-windows            # x64
git tag v1.0.0-win                # x64
git tag v1.0.0-rc.1-win           # Pre-release

# Linux only
git tag v1.0.0-linux              # x64
git tag v1.0.0-alpha-linux        # Pre-release
```

### Workflow Permissions

All workflows require these permissions:

```yaml
permissions:
  contents: write  # Create releases, upload assets
```

### Build Matrix

| Platform | Runner | Architecture | Signed | Notarized |
|----------|--------|--------------|--------|-----------|
| Windows | `windows-latest` | x64 | No | N/A |
| macOS | `macos-latest` | arm64, x64 | Yes | Yes |
| Linux | `ubuntu-latest` | x64 | No | N/A |

---

*Last updated: December 2024*
