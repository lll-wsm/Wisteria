import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'path': 'path-browserify',
      'zlib': path.resolve(__dirname, 'src/mocks/zlib.js'),
      'url': path.resolve(__dirname, 'src/mocks/url.js')
    }
  },
  define: {
    'process.env': {}
  }
})
