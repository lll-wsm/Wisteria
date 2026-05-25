const { spawn } = require('child_process')
const http = require('http')

console.log('Starting Vite development server...')
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true })

function checkViteReady() {
  http.get('http://localhost:5173', (res) => {
    console.log('Vite server is ready. Starting Electron in development mode...')
    const electron = spawn('npx', ['electron', '.', '--enable-logging'], { stdio: 'inherit', shell: true })
    
    electron.on('close', (code) => {
      vite.kill()
      process.exit(code)
    })
  }).on('error', () => {
    setTimeout(checkViteReady, 100)
  })
}

checkViteReady()
