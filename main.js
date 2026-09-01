const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const iconv = require('iconv-lite')
const jschardet = require('jschardet')
const ENCODINGS = require('./shared/encodings.json')

let mainWindow = null
let currentFilePath = null

// ===================== Settings (language / theme) =====================
let settings = { language: 'en-US', theme: 'system' }

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

// ===================== Theme registry (pluggable themes) =====================
// Built-in themes live in <app>/themes/*.theme.json (shipped with the app);
// user themes live in <userData>/themes/*.theme.json. Deleting a file removes
// the theme; a missing/renamed theme falls back to 'system'.
const USER_THEME_DIR = path.join(app.getPath('userData'), 'themes')

function builtinThemeDir() {
  return path.join(__dirname, 'themes')
}

function readThemeDir(dir) {
  let files = []
  try {
    fs.mkdirSync(dir, { recursive: true })
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.theme.json'))
  } catch (e) {
    return []
  }
  const themes = []
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const data = JSON.parse(raw)
      if (data && typeof data.name === 'string' && data.colors) {
        themes.push({
          name: data.name,
          label: data.label || data.name,
          dark: !!data.dark,
          file,
          dir
        })
      }
    } catch (e) {
      console.error('Invalid theme file:', file, e)
    }
  }
  return themes
}

function listThemes() {
  // User themes override built-in themes with the same name.
  const byName = new Map()
  for (const t of readThemeDir(builtinThemeDir())) byName.set(t.name, t)
  for (const t of readThemeDir(USER_THEME_DIR)) byName.set(t.name, t)
  return [...byName.values()]
}

function getThemeContent(name) {
  const theme = listThemes().find((t) => t.name === name)
  if (!theme) return null
  try {
    const raw = fs.readFileSync(path.join(theme.dir, theme.file), 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to read theme:', name, e)
    return null
  }
}

function themeExists(name) {
  return listThemes().some((t) => t.name === name)
}

function defaultLanguage() {
  try {
    const preferred = app.getPreferredSystemLanguages()
    if (preferred && preferred.length > 0) {
      return String(preferred[0]).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
    }
  } catch (error) {
    console.error('Failed to detect preferred language:', error)
  }
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsFilePath(), 'utf8')
    settings = { ...settings, ...JSON.parse(raw) }
  } catch {
    settings.language = defaultLanguage()
  }
  if (!['zh-CN', 'en-US'].includes(settings.language)) {
    settings.language = defaultLanguage()
  }
  if (!['light', 'dark', 'system'].includes(settings.theme) && !themeExists(settings.theme)) {
    settings.theme = 'system'
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFilePath()), { recursive: true })
    fs.writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

function broadcastToAll(channel, ...args) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

// ===================== i18n (main process) =====================
const dicts = {
  'zh-CN': require('./locales/zh-CN.json'),
  'en-US': require('./locales/en-US.json')
}

function t(key, vars) {
  let str = (dicts[settings.language] && dicts[settings.language][key]) || dicts['en-US'][key] || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v)
    }
  }
  return str
}

function setLanguage(lang) {
  if (!['zh-CN', 'en-US'].includes(lang) || lang === settings.language) return
  settings.language = lang
  saveSettings()
  buildMenu()
  sendToRenderer('language-changed', lang)
}

// ===================== History =====================
const MAX_HISTORY = 20
let history = []

function historyFilePath() {
  return path.join(app.getPath('userData'), 'history.json')
}

function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(historyFilePath(), 'utf8'))
    history = Array.isArray(raw) ? raw : []
  } catch {
    history = []
  }
}

function persistHistory() {
  try {
    fs.mkdirSync(path.dirname(historyFilePath()), { recursive: true })
    fs.writeFileSync(historyFilePath(), JSON.stringify(history, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to save history:', error)
  }
}

function addHistory(type, entryPath) {
  history = history.filter((h) => !(h.type === type && h.path === entryPath))
  history.unshift({ type, path: entryPath, time: Date.now() })
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY)
  persistHistory()
}

function clearHistory() {
  history = []
  persistHistory()
}

// ===================== Encoding =====================
const fileEncodings = new Map() // path -> { encoding, bom }

function normalizeDetectedEncoding(enc) {
  if (!enc) return 'utf-8'
  const lower = String(enc).toLowerCase()
  const map = {
    'utf-8': 'utf-8',
    ascii: 'utf-8',
    'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be',
    gb2312: 'gb18030',
    gbk: 'gb18030',
    gb18030: 'gb18030',
    big5: 'big5',
    shift_jis: 'shiftjis',
    'euc-jp': 'euc-jp',
    'euc-kr': 'euc-kr',
    'windows-1252': 'cp1252',
    'iso-8859-1': 'latin1',
    'koi8-r': 'koi8-r'
  }
  const mapped = map[lower] || lower
  return iconv.encodingExists(mapped) ? mapped : 'utf-8'
}

function detectFileEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf-8', bom: 'utf-8' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf-16le', bom: 'utf-16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf-16be', bom: 'utf-16be' }
  }
  let detected = null
  try {
    detected = jschardet.detect(buffer)
  } catch (error) {
    console.error('Encoding detection failed:', error)
  }
  return { encoding: normalizeDetectedEncoding(detected && detected.encoding), bom: null }
}

function decodeBuffer(buffer, encoding) {
  let content = iconv.decode(buffer, encoding)
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  return content
}

function encodeContent(content, encoding, bom) {
  let buf = iconv.encode(content, encoding)
  if (bom === 'utf-8') buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf])
  else if (bom === 'utf-16le') buf = Buffer.concat([Buffer.from([0xff, 0xfe]), buf])
  else if (bom === 'utf-16be') buf = Buffer.concat([Buffer.from([0xfe, 0xff]), buf])
  return buf
}

function readFileWithEncoding(filePath, encodingOverride) {
  const buffer = fs.readFileSync(filePath)
  let info
  if (encodingOverride) {
    info = { encoding: encodingOverride, bom: detectFileEncoding(buffer).bom }
  } else {
    info = detectFileEncoding(buffer)
  }
  const content = decodeBuffer(buffer, info.encoding)
  fileEncodings.set(filePath, info)
  return { content, encoding: info.encoding, bom: info.bom }
}

function writeFileWithEncoding(filePath, content) {
  const info = fileEncodings.get(filePath) || { encoding: 'utf-8', bom: null }
  fs.writeFileSync(filePath, encodeContent(content, info.encoding, info.bom))
  return { encoding: info.encoding, bom: info.bom }
}

// ===================== Menu =====================
function sendToRenderer(channel, ...args) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

function buildOpenRecentSubmenu() {
  const valid = history.filter((h) => fs.existsSync(h.path))
  if (valid.length === 0) {
    return [{ label: t('menu.noRecent'), enabled: false }]
  }
  return [
    ...valid.map((h) => ({
      label: path.basename(h.path),
      click: () => sendToRenderer(h.type === 'file' ? 'menu-open-recent' : 'menu-open-recent-folder', h.path)
    })),
    { type: 'separator' },
    {
      label: t('menu.clearRecent'),
      click: () => {
        clearHistory()
        buildMenu()
      }
    }
  ]
}

function buildEncodingSubmenu() {
  const current = currentFilePath ? (fileEncodings.get(currentFilePath) || {}).encoding : null
  return ENCODINGS.map((e) => ({
    label: e.label,
    type: 'checkbox',
    checked: current === e.value,
    click: () => sendToRenderer('menu-reopen-encoding', e.value)
  }))
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [
          {
            label: t('app.name'),
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: t('menu.settings'), accelerator: 'Cmd+,', click: () => openSettingsWindow() },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.newFile'), accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('menu-new') },
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => sendToRenderer('menu-open') },
        { label: t('menu.openDirectory'), accelerator: 'CmdOrCtrl+Shift+O', click: () => sendToRenderer('menu-open-folder') },
        { label: t('menu.openRecent'), submenu: buildOpenRecentSubmenu() },
        { label: t('menu.reopenEncoding'), submenu: buildEncodingSubmenu(), enabled: !!currentFilePath },
        { type: 'separator' },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('menu-save') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('menu-save-as') },
        { type: 'separator' },
        { label: t('menu.exportPdf'), accelerator: 'CmdOrCtrl+E', click: () => sendToRenderer('menu-pdf') },
        { label: t('menu.exportHtml'), accelerator: 'CmdOrCtrl+Shift+H', click: () => sendToRenderer('menu-html') },
        { type: 'separator' },
        isMac ? { role: 'close', label: t('menu.close') } : { role: 'quit' }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), accelerator: 'CmdOrCtrl+Z', click: () => sendToRenderer('menu-undo') },
        { label: t('menu.redo'), accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendToRenderer('menu-redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: t('menu.find'), accelerator: 'CmdOrCtrl+F', click: () => sendToRenderer('menu-find') },
        {
          label: t('menu.replace'),
          accelerator: isMac ? 'Cmd+Alt+F' : 'Ctrl+H',
          click: () => sendToRenderer('menu-replace')
        }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.language'),
          submenu: [
            {
              label: t('menu.languageZh'),
              type: 'radio',
              checked: settings.language === 'zh-CN',
              click: () => setLanguage('zh-CN')
            },
            {
              label: t('menu.languageEn'),
              type: 'radio',
              checked: settings.language === 'en-US',
              click: () => setLanguage('en-US')
            }
          ]
        },
        { type: 'separator' },
        { role: 'reload', label: t('menu.reload') },
        { role: 'toggleDevTools', label: t('menu.toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.toggleFullscreen') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ===================== Window =====================
let settingsWindow = null

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    fullscreenable: false,
    minimizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  // Try the Vite dev server first, fall back to the built file
  const http = require('http')
  const devUrl = 'http://localhost:5173/settings.html'
  const req = http.get('http://localhost:5173', (res) => {
    settingsWindow.loadURL(devUrl)
  })
  req.on('error', () => {
    const settingsPath = path.join(__dirname, 'dist', 'settings.html')
    if (fs.existsSync(settingsPath)) {
      settingsWindow.loadFile(settingsPath)
    } else {
      settingsWindow.loadURL(devUrl)
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1020,
    height: 800,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow = win
  win.on('closed', () => {
    mainWindow = null
  })

  // Pipe renderer console logs to terminal
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`)
  })

  // Detect renderer crashes (input regressions can crash the GPU/renderer process)
  win.webContents.on('render-process-gone', (event, details) => {
    console.log(`[dbg] RENDER_PROCESS_GONE reason=${details.reason} exitCode=${details.exitCode} crashed=${details.crashed}`)
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

// ===================== Window Controls (frameless titlebar) =====================
ipcMain.on('window-toggle-zoom', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on('window-set-bg', (event, color) => {
  BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color)
})

app.whenReady().then(() => {
  loadSettings()
  loadHistory()
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ===================== IPC: File Ops (with encoding) =====================
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
      const info = writeFileWithEncoding(currentFilePath, content)
      addHistory('file', currentFilePath)
      return { success: true, path: currentFilePath, encoding: info.encoding }
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

  // 继承当前文档的编码设置
  const inherited = currentFilePath ? fileEncodings.get(currentFilePath) : null
  fileEncodings.set(filePath, inherited || { encoding: 'utf-8', bom: null })
  currentFilePath = filePath
  buildMenu()
  try {
    const info = writeFileWithEncoding(currentFilePath, content)
    addHistory('file', currentFilePath)
    return { success: true, path: currentFilePath, encoding: info.encoding }
  } catch (error) {
    console.error('Failed to save file as:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('new-file', () => {
  currentFilePath = null
  buildMenu()
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
    const { content, encoding } = readFileWithEncoding(filePath)
    currentFilePath = filePath
    addHistory('file', filePath)
    buildMenu()
    return { success: true, content, path: filePath, encoding }
  } catch (error) {
    console.error('Failed to open file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-file-with-path', async (event, filePath) => {
  try {
    const { content, encoding } = readFileWithEncoding(filePath)
    currentFilePath = filePath
    addHistory('file', filePath)
    buildMenu()
    return { success: true, content, path: filePath, encoding }
  } catch (error) {
    console.error(`Failed to open file ${filePath}:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('save-file-with-path', async (event, filePath, content) => {
  try {
    const info = writeFileWithEncoding(filePath, content)
    currentFilePath = filePath
    return { success: true, path: filePath, encoding: info.encoding }
  } catch (error) {
    console.error(`Failed to save file ${filePath}:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('reopen-with-encoding', async (event, filePath, encoding) => {
  try {
    const { content, encoding: resolvedEncoding } = readFileWithEncoding(filePath, encoding)
    currentFilePath = filePath
    buildMenu()
    return { success: true, content, path: filePath, encoding: resolvedEncoding }
  } catch (error) {
    console.error(`Failed to reopen file ${filePath}:`, error)
    return { success: false, error: error.message }
  }
})

// ===================== IPC: Assets & Export =====================
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
    footerTemplate:
      '<div style="font-size: 10px; width: 100%; text-align: center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
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

// ===================== IPC: Folder Tree =====================
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
      if (
        filename &&
        (filename.includes('.git/') ||
          filename.includes('node_modules/') ||
          filename.includes('.DS_Store'))
      ) {
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
  addHistory('folder', dirPath)
  return { success: true, path: dirPath, tree }
})

ipcMain.handle('open-folder-by-path', async (event, dirPath) => {
  const tree = buildTree(dirPath)
  watchFolder(dirPath, event.sender)
  addHistory('folder', dirPath)
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
    if (fileEncodings.has(oldPath)) {
      fileEncodings.set(newPath, fileEncodings.get(oldPath))
      fileEncodings.delete(oldPath)
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
      buildMenu()
    }
    fileEncodings.delete(filePath)
    return { success: true }
  } catch (error) {
    console.error(`Failed to trash path:`, error)
    return { success: false, error: error.message }
  }
})

// ===================== IPC: Settings =====================
ipcMain.handle('get-language', () => {
  return settings.language
})

ipcMain.handle('settings-get', () => {
  return { language: settings.language, theme: settings.theme }
})

ipcMain.handle('themes-list', () => {
  return listThemes()
})

ipcMain.handle('theme-get', (event, name) => {
  return getThemeContent(name)
})

ipcMain.handle('settings-set', (event, patch) => {
  if (!patch || typeof patch !== 'object') {
    return { success: false, error: 'invalid patch' }
  }
  let changed = false
  if ('language' in patch && ['zh-CN', 'en-US'].includes(patch.language) && patch.language !== settings.language) {
    settings.language = patch.language
    changed = true
  }
  const isBuiltinTheme = ['light', 'dark', 'system'].includes(patch.theme)
  if ('theme' in patch && (isBuiltinTheme || themeExists(patch.theme)) && patch.theme !== settings.theme) {
    settings.theme = patch.theme
    changed = true
  }
  if (changed) {
    saveSettings()
    buildMenu()
    broadcastToAll('settings-changed', { language: settings.language, theme: settings.theme })
    if ('language' in patch) {
      sendToRenderer('language-changed', settings.language)
    }
  }
  return { success: true, settings: { language: settings.language, theme: settings.theme } }
})
