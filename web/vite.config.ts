import { inspectorServer } from '@react-dev-inspector/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { appName } from './src/conf.json';

// Inject code location data attributes for react-dev-inspector
const inspectorBabelPlugin = (): import('vite').Plugin => ({
  name: 'inspector-babel',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    if (id.includes('node_modules')) return;
    if (!/\.[jt]sx$/.test(id)) return;

    // Dynamically import babel transform to inject data attributes
    const { transform } = await import('@react-dev-inspector/babel-plugin');
    return {
      code: transform({
        filePath: id,
        sourceCode: code,
      }),
      map: null,
    };
  },
});

type MinifyValue = boolean | 'esbuild' | 'terser';

function resolveMinify(value: string | undefined): MinifyValue {
  if (value === undefined) return 'terser';
  const lower = value.toLowerCase();
  if (lower === 'false') return false;
  if (lower === 'esbuild') return 'esbuild';
  if (lower === 'terser') return 'terser';
  return 'terser';
}

function createProxyTarget(host: string, port: number) {
  return `http://${host}:${port}/`;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from .env file (also loads .env.local, .env.[mode], .env.[mode].local)
  const env = loadEnv(mode, process.cwd(), '');

  // Try to load from .env file explicitly if API_PROXY_SCHEME not found
  let proxyScheme = env.API_PROXY_SCHEME;
  if (!proxyScheme) {
    try {
      const envLocal = loadEnv('', process.cwd(), '');
      proxyScheme = envLocal.API_PROXY_SCHEME;
    } catch {
      // ignore
    }
  }
  proxyScheme = proxyScheme || 'python';

  const proxyHost = env.API_PROXY_HOST || '127.0.0.1';

  console.log(
    `[vite.config] mode: ${mode}, API_PROXY_SCHEME: ${proxyScheme}, API_PROXY_HOST: ${proxyHost}`,
  );

  const proxySchemes = {
    python: {
      '/api/v1/admin': {
        target: createProxyTarget(proxyHost, 9381),
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: createProxyTarget(proxyHost, 9380),
        changeOrigin: true,
        ws: true,
      },
      '/v1': {
        target: createProxyTarget(proxyHost, 9380),
        changeOrigin: true,
        ws: true,
      },
    },
    hybrid: {
      '^(/v1/kb)|^(/v1/document)|^(/v1/llm/list)|^(/api/v1/datasets)|^(/api/v1/memories)|^(/v1/user)|^(/v1/user/tenant_info)|^(/v1/tenant/list)|^(/v1/system/config)|^(/v1/user/login)|^(/v1/user/logout)|^(/api/v1/files)':
        {
          target: createProxyTarget(proxyHost, 9384),
          changeOrigin: true,
          ws: true,
        },
      '^(/api/v1/admin/sandbox)|^(/api/v1/admin/roles)|^(/api/v1/admin/roles/owner/permission)|^(/api/v1/admin/roles_with_permission)|^(/api/v1/admin/whitelist)|^(/api/v1/admin/variables)':
        {
          target: createProxyTarget(proxyHost, 9381),
          changeOrigin: true,
          ws: true,
        },
      '/api/v1/admin': {
        target: createProxyTarget(proxyHost, 9383),
        changeOrigin: true,
        ws: true,
      },
      '/api/v1/users/me/models': {
        target: createProxyTarget(proxyHost, 9380),
        changeOrigin: true,
        ws: true,
      },
      '^(/api/v1/users)|^(/api/v1/auth)|^(/api/v1/system/config)|^(/api/v1/system/version)|^(/api/v1/tenants)|^(/api/v1/chats)|^(/api/v1/searches)|^(/api/v1/files)|^(/api/v1/agents)':
        {
          target: createProxyTarget(proxyHost, 9384),
          changeOrigin: true,
          ws: true,
        },
      '/api': {
        target: createProxyTarget(proxyHost, 9380),
        changeOrigin: true,
        ws: true,
      },
      '/v1': {
        target: createProxyTarget(proxyHost, 9380),
        changeOrigin: true,
        ws: true,
      },
    },
    go: {
      '/api/v1/admin': {
        target: createProxyTarget(proxyHost, 9383),
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: createProxyTarget(proxyHost, 9384),
        changeOrigin: true,
        ws: true,
      },
      '/v1': {
        target: createProxyTarget(proxyHost, 9384),
        changeOrigin: true,
        ws: true,
      },
    },
  };

  const proxy = proxySchemes[proxyScheme] || proxySchemes.python;

  return {
    define: {
      // Expose to client code via import.meta.env
      'import.meta.env.API_PROXY_SCHEME': JSON.stringify(proxyScheme),
      'import.meta.env.API_PROXY_HOST': JSON.stringify(proxyHost),
      // Keep backward compatibility
      __API_PROXY_SCHEME__: JSON.stringify(proxyScheme),
    },
    plugins: [
      inspectorBabelPlugin(),
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'src/conf.json',
            dest: './',
          },
          {
            src: 'node_modules/monaco-editor/min/vs/',
            dest: './',
          },
        ],
      }),
      createHtmlPlugin({
        inject: {
          data: {
            title: appName,
          },
        },
      }),
      inspectorServer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@parent': path.resolve(__dirname, '../'),
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      postcss: './postcss.config.js',
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          additionalData: `
            @import "@/less/variable.less";
            @import "@/less/mixins.less";
          `,
          modifyVars: {
            hack: `true; @import "@/less/index.less";`,
          },
        },
      },
    },
    server: {
      port: Number(env.PORT) || 9222,
      strictPort: false,
      hmr: {
        overlay: false,
      },
      proxy,
    },
    assetsInclude: ['**/*.md'],
    base: env.VITE_BASE_URL,
    publicDir: 'public',
    cacheDir: './node_modules/.vite-cache',
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router',
        'axios',
        'lodash',
        'dayjs',
      ],
      exclude: [],
      force: false,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      assetsInlineLimit: 4096,
      experimentalMinChunkSize: 30 * 1024,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'EMPTY_BUNDLE') {
            return;
          }
          warn(warning);
        },
        output: {
          manualChunks(id) {
            // if (id.includes('src/components')) {
            //   return 'components';
            // }

            if (id.includes('src/locales/') && id.endsWith('.ts')) {
              const match = id.match(/src\/locales\/([^/]+)\.ts$/);
              if (match) {
                return `locale-${match[1]}`;
              }
            }

            if (id.includes('node_modules')) {
              if (id.includes('node_modules/d3')) {
                return 'd3';
              }
              if (id.includes('node_modules/ajv')) {
                return 'ajv';
              }
              if (id.includes('node_modules/@antv')) {
                return 'antv';
              }
              const name = id
                .toString()
                .split('node_modules/')[1]
                .split('/')[0]
                .toString();
              if (['lodash', 'dayjs', 'date-fns', 'axios'].includes(name)) {
                return 'utils';
              }
              if (['@xmldom', 'xmlbuilder '].includes(name)) {
                return 'xml-js';
              }
              return name;
            }
          },
          chunkFileNames: 'chunk/js/[name]-[hash].js',
          entryFileNames: 'entry/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
        plugins: [],
        treeshake: true,
      },
      minify: resolveMinify(env.VITE_MINIFY),
      terserOptions: {
        compress: {
          drop_console: true, // delete console
          drop_debugger: true, // delete debugger
          pure_funcs: ['console.log'],
        },
        mangle: {
          // properties: {
          //   regex: /^_/,
          // },
          properties: false,
        },
        format: {
          comments: false, // Delete comments
        },
      },
      sourcemap: env.VITE_BUILD_SOURCEMAP !== 'false',
      cssCodeSplit: true,
      target: 'es2015',
    },
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          strict: false,
          noImplicitAny: false,
          skipLibCheck: true,
        },
      },
    },
    entries: ['./src/main.tsx'],
  };
});
