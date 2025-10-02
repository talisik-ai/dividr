// import { MakerPKG } from '@electron-forge/maker-pkg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
// import fs from 'fs/promises';
// import path from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{@ffmpeg-installer,ffmpeg-static,ffprobe-static}/**/*',
    },
    icon: './favicon.ico',
    name: 'Dividr',
    executableName: 'Dividr',
    extraResource: ['./src/frontend/assets/logo'],
    // Ensure native modules and ffmpeg binaries are included
    ignore: [/^\/\.gitignore$/, /^\/README\.md$/, /^\/docs\//],
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

    // Windows Squirrel installer
    new MakerSquirrel({
      iconUrl: 'https://example.com/icon.ico', // Replace with your actual icon URL
      setupIcon: './favicon.ico',
      name: 'Dividr',
      authors: 'Dividr Team',
      description:
        'A powerful video editing application built with Electron and FFmpeg',
    }),

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
