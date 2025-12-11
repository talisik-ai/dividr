// import { MakerPKG } from '@electron-forge/maker-pkg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack:
        '**/node_modules/{@ffmpeg-installer,ffmpeg-static,ffprobe-static}/**/*',
    },
    icon: './favicon.ico',
    name: 'Dividr',
    executableName: 'dividr',
    extraResource: ['./src/frontend/assets/logo', './src/backend/scripts'],
    // macOS code signing - uses APPLE_IDENTITY env variable
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
    ignore: [
      // Git and docs
      /^\/\.gitignore$/,
      /^\/\.git\//,
      /^\/README\.md$/,
      /^\/docs\//,

      // Large binary directories (user must install separately)
      /^\/whisper-bin\//,
      /^\/whisper-models\//,
      /^\/ffmpeg-bin\//,

      // Python environment (user must install separately)
      /^\/venv\//,
      /^\/\.venv\//,
      /^\/env\//,
      /^\/\.env\//,
      /^\/requirements\.txt$/,
      /^\/setup-python\.(bat|sh)$/,

      // Public assets that aren't needed in production
      /^\/public\/sprite-sheets\//,
      /^\/public\/thumbnails\//,

      // Test files
      /\.test\.(ts|tsx|js|jsx)$/,
      /\.spec\.(ts|tsx|js|jsx)$/,
      /__tests__\//,

      // Source maps in production
      /\.map$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    // macOS PKG installer
    /* new MakerPKG({
      identity: null, // Set to null for development, add your Apple Developer ID for production
      signing: {
        identity: null, // Same as above
        "entitlements": null,
        "entitlements-inherit": null,
        "gatekeeper-assess": false,
      },
    }),*/

    // Windows NSIS installer
    {
      name: '@felixrieseberg/electron-forge-maker-nsis',
      config: {
        name: 'Dividr',
        description:
          'A powerful video editing application built with Electron and FFmpeg',
        manufacturer: 'Talisik',
        appDirectory: undefined,
        outputDirectory: undefined,
        installerIcon: './favicon.ico',
        uninstallerIcon: './favicon.ico',
        exe: 'dividr.exe',
        setupIcon: './favicon.ico',
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        runAfterFinish: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Dividr',
        deleteAppDataOnUninstall: false,
        menuCategory: false,
        language: 'English',
      },
    },

    // Cross-platform ZIP packages
    new MakerZIP({}, ['darwin', 'win32', 'linux']),

    // Linux DEB package (Debian/Ubuntu)
    new MakerDeb({
      options: {
        name: 'dividr',
        productName: 'Dividr',
        genericName: 'Video Editor',
        description:
          'A powerful video editing application built with Electron and FFmpeg',
        maintainer: 'Dividr Team <dividr@gmail.com>',
        homepage: 'https://github.com/talisik-ai/dividr',
        icon: './favicon.ico',
        categories: ['AudioVideo', 'Video', 'AudioVideoEditing'],
      },
    }),

    // Linux RPM package (Fedora/RHEL/CentOS)
    new MakerRpm({
      options: {
        name: 'dividr',
        productName: 'Dividr',
        genericName: 'Video Editor',
        description:
          'A powerful video editing application built with Electron and FFmpeg',
        homepage: 'https://github.com/talisik-ai/dividr',
        icon: './favicon.ico',
        categories: ['AudioVideo', 'Video', 'AudioVideoEditing'],
      },
    }),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
