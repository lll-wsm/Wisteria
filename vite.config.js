import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'path': 'path-browserify',
      'url': path.resolve(__dirname, 'muya-core/src/mocks/url.js'),
      'zlib': path.resolve(__dirname, 'muya-core/src/mocks/zlib.js'),
      'stream': 'stream-browserify',
      'buffer': 'buffer'
    }
  },
  define: {
    'process.env': {},
    'global': 'window'
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
