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
    name: 'DiviDr',
    executableName: 'DiviDr',
    extraResource: [
      './src/frontend/assets/logo',
      './src/backend/python/scripts',
      // dividr-tools is now downloaded on-demand from GitHub Releases
      // to reduce installer size from ~1.3GB to ~200MB
    ],
    ignore: [
      // Git and docs
      /^\/\.gitignore$/,
      /^\/\.git\//,
      /^\/README\.md$/,
      /^\/docs\//,

      // Large binary directories (not packaged with app)
      /^\/ffmpeg-bin\//,
      /^\/dividr-tools-bin\//,
      /^\/build\//,

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
    // Windows NSIS installer
    {
      name: '@felixrieseberg/electron-forge-maker-nsis',
      config: {
        name: 'DiviDr',
        description:
          'A powerful video editing application built with Electron and FFmpeg',
        manufacturer: 'Talisik',
        appDirectory: undefined,
        outputDirectory: undefined,
        installerIcon: './favicon.ico',
        uninstallerIcon: './favicon.ico',
        exe: 'DiviDr.exe',
        setupIcon: './favicon.ico',
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        runAfterFinish: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'DiviDr',
        deleteAppDataOnUninstall: false,
        menuCategory: false,
        language: 'English',
      },
    },

    // Cross-platform ZIP packages
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
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
