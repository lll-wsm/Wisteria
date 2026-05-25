const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

let currentFilePath = null

function createMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-new') } },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-open') } },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-save') } },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-save-as') } },
        { type: 'separator' },
        { label: 'Export PDF', accelerator: 'CmdOrCtrl+E', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-pdf') } },
        { label: 'Export HTML', accelerator: 'CmdOrCtrl+Shift+H', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-html') } },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1020,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Pipe renderer console logs to terminal
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`)
  })
  
  // Try to load from Vite server (development), fallback to built files (production/standalone)
  const http = require('http')
  const req = http.get('http://localhost:5173', (res) => {
    win.loadURL('http://localhost:5173')
  })
  
  req.on('error', () => {
    const indexPath = path.join(__dirname, 'dist', 'index.html')
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath)
    } else {
      // Fallback if not built yet
      win.loadURL('http://localhost:5173')
    }
  })
}

app.whenReady().then(() => {
  createMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('save-file', async (event, content) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!currentFilePath) {
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled) return { success: false }
    currentFilePath = filePath
  }
  
  if (currentFilePath) {
    try {
      fs.writeFileSync(currentFilePath, content, 'utf8')
      return { success: true, path: currentFilePath }
    } catch (error) {
      console.error('Failed to save file:', error)
      return { success: false, error: error.message }
    }
  }
  return { success: false }
})

ipcMain.handle('save-file-as', async (event, content) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (canceled) return { success: false }
  
  currentFilePath = filePath
  try {
    fs.writeFileSync(currentFilePath, content, 'utf8')
    return { success: true, path: currentFilePath }
  } catch (error) {
    console.error('Failed to save file as:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('new-file', () => {
  currentFilePath = null
  return { success: true }
})

ipcMain.handle('open-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  
  if (canceled || filePaths.length === 0) {
    return { success: false }
  }
  
  const filePath = filePaths[0]
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    currentFilePath = filePath
    return { success: true, content, path: filePath }
  } catch (error) {
    console.error('Failed to open file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('save-asset', async (event, buffer, extension) => {
  if (!currentFilePath) {
    return { success: false, error: 'File must be saved before adding assets' }
  }

  try {
    const dir = path.dirname(currentFilePath)
    const assetsDir = path.join(dir, 'assets')
    
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true })
    }

    const filename = `image-${Date.now()}.${extension || 'png'}`
    const filePath = path.join(assetsDir, filename)
    
    fs.writeFileSync(filePath, Buffer.from(buffer))
    
    return { success: true, path: `./assets/${filename}` }
  } catch (error) {
    console.error('Failed to save asset:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('export-pdf', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size: 10px; width: 100%; text-align: center;">Wisteria Editor</div>',
    footerTemplate: '<div style="font-size: 10px; width: 100%; text-align: center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '50px', bottom: '50px' }
  })
  const { filePath } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (filePath) {
    fs.writeFileSync(filePath, pdfBuffer)
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('export-html', async (event, html) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePath } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (filePath) {
    fs.writeFileSync(filePath, html)
    return { success: true }
  }
  return { success: false }
})
