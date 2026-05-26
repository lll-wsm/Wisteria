const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

app.name = 'Wisteria'
app.setName('Wisteria')

// Set dock icon early for macOS using a PNG for better compatibility in dev mode
if (process.platform === 'darwin') {
  try {
    const iconPath = path.join(__dirname, 'icons', 'icon_512x512.png')
    if (fs.existsSync(iconPath)) {
      const image = nativeImage.createFromPath(iconPath)
      app.dock.setIcon(image)
    }
  } catch (err) {
    console.error('Failed to set dock icon:', err)
  }
}

let currentFilePath = null

function createMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-preferences') } },
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
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-open-folder') } },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-save') } },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-save-as') } },
        { type: 'separator' },
        { label: 'Export PDF', accelerator: 'CmdOrCtrl+E', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-pdf') } },
        { label: 'Export HTML', accelerator: 'CmdOrCtrl+Shift+H', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-html') } },
        ...(!isMac ? [
          { type: 'separator' },
          { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: (menuItem, browserWindow) => { const win = browserWindow || BrowserWindow.getFocusedWindow(); if (win) win.webContents.send('menu-preferences') } }
        ] : []),
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
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'icons', 'wisteria.icns')
    : path.join(__dirname, 'icons', 'icon_256x256.png')

  const win = new BrowserWindow({
    width: 1020,
    height: 800,
    title: 'Wisteria',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
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

ipcMain.handle('save-asset', async (event, buffer, extension, options = {}) => {
  if (options.mode !== 'global' && !currentFilePath) {
    return { success: false, error: 'File must be saved before adding assets' }
  }

  try {
    let filePath
    let returnPath

    if (options.mode === 'global' && options.globalPath) {
      const globalDir = options.globalPath
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true })
      }
      const filename = `image-${Date.now()}.${extension || 'png'}`
      filePath = path.join(globalDir, filename)
      returnPath = pathToFileURL(filePath).toString() // Converts to file:///... URL
    } else {
      const dir = path.dirname(currentFilePath)
      const assetsDir = path.join(dir, 'assets')
      
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true })
      }

      const filename = `image-${Date.now()}.${extension || 'png'}`
      filePath = path.join(assetsDir, filename)
      returnPath = `./assets/${filename}`
    }
    
    fs.writeFileSync(filePath, Buffer.from(buffer))
    return { success: true, path: returnPath }
  } catch (error) {
    console.error('Failed to save asset:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('select-image-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  })
  
  if (canceled || filePaths.length === 0) {
    return { success: false }
  }
  return { success: true, path: filePaths[0] }
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

// Helper to build folder tree JSON recursively
function buildTree(dirPath) {
  try {
    const stats = fs.statSync(dirPath)
    if (!stats.isDirectory()) return null

    const node = {
      name: path.basename(dirPath),
      path: dirPath,
      isDir: true,
      children: []
    }

    const files = fs.readdirSync(dirPath)
    for (const file of files) {
      if (['.git', 'node_modules', '.antigravitycli', '.DS_Store'].includes(file)) {
        continue
      }
      
      const fullPath = path.join(dirPath, file)
      let fileStats
      try {
        fileStats = fs.statSync(fullPath)
      } catch (err) {
        continue
      }

      if (fileStats.isDirectory()) {
        const childTree = buildTree(fullPath)
        if (childTree) {
          node.children.push(childTree)
        }
      } else {
        const ext = path.extname(file).toLowerCase()
        if (['.md', '.markdown', '.txt'].includes(ext)) {
          node.children.push({
            name: file,
            path: fullPath,
            isDir: false
          })
        }
      }
    }

    // Sort: directories first, then files, both alphabetically
    node.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })

    return node
  } catch (error) {
    console.error(`Failed to build tree for ${dirPath}:`, error)
    return null
  }
}

let folderWatcher = null
let currentWatchedPath = null

function watchFolder(dirPath, eventSender) {
  if (folderWatcher) {
    folderWatcher.close()
    folderWatcher = null
  }
  if (!dirPath) return

  currentWatchedPath = dirPath
  
  try {
    let debounceTimer
    folderWatcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename && (
        filename.includes('.git/') || 
        filename.includes('node_modules/') || 
        filename.includes('.DS_Store')
      )) {
        return
      }

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (currentWatchedPath === dirPath) {
          const tree = buildTree(dirPath)
          eventSender.send('folder-update', tree)
        }
      }, 300)
    })
  } catch (error) {
    console.error(`Failed to watch folder ${dirPath}:`, error)
  }
}

// Sidebar API Handlers
ipcMain.handle('open-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  })
  
  if (canceled || filePaths.length === 0) {
    return { success: false }
  }

  const dirPath = filePaths[0]
  const tree = buildTree(dirPath)
  watchFolder(dirPath, event.sender)
  return { success: true, path: dirPath, tree }
})

ipcMain.handle('get-folder-tree', async (event, dirPath) => {
  const tree = buildTree(dirPath)
  return { success: true, tree }
})

ipcMain.handle('watch-folder', async (event, dirPath) => {
  watchFolder(dirPath, event.sender)
  return { success: true }
})

ipcMain.handle('open-file-with-path', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    currentFilePath = filePath
    return { success: true, content, path: filePath }
  } catch (error) {
    console.error(`Failed to open file ${filePath}:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('save-file-with-path', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    currentFilePath = filePath
    return { success: true, path: filePath }
  } catch (error) {
    console.error(`Failed to save file ${filePath}:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('create-file', async (event, parentPath, name) => {
  try {
    let filename = name.endsWith('.md') ? name : `${name}.md`
    const filePath = path.join(parentPath, filename)
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'File already exists' }
    }
    fs.writeFileSync(filePath, '', 'utf8')
    return { success: true, path: filePath }
  } catch (error) {
    console.error(`Failed to create file:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('create-folder', async (event, parentPath, name) => {
  try {
    const dirPath = path.join(parentPath, name)
    if (fs.existsSync(dirPath)) {
      return { success: false, error: 'Folder already exists' }
    }
    fs.mkdirSync(dirPath, { recursive: true })
    return { success: true, path: dirPath }
  } catch (error) {
    console.error(`Failed to create folder:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('rename-path', async (event, oldPath, newPath) => {
  try {
    if (fs.existsSync(newPath)) {
      return { success: false, error: 'Destination already exists' }
    }
    fs.renameSync(oldPath, newPath)
    if (currentFilePath === oldPath) {
      currentFilePath = newPath
    }
    return { success: true, path: newPath }
  } catch (error) {
    console.error(`Failed to rename path:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('trash-path', async (event, filePath) => {
  try {
    await shell.trashItem(filePath)
    if (currentFilePath === filePath) {
      currentFilePath = null
    }
    return { success: true }
  } catch (error) {
    console.error(`Failed to trash path:`, error)
    return { success: false, error: error.message }
  }
})

