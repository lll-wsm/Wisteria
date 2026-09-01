const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File Ops
  saveFile: (content) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content) => ipcRenderer.invoke('save-file-as', content),
  openFile: () => ipcRenderer.invoke('open-file'),
  newFile: () => ipcRenderer.invoke('new-file'),
  
  // Specific path file operations (for sidebar workspace)
  openFileWithPath: (filePath, recordHistory) => ipcRenderer.invoke('open-file-with-path', filePath, recordHistory),
  saveFileWithPath: (filePath, content) => ipcRenderer.invoke('save-file-with-path', filePath, content),
  reopenWithEncoding: (filePath, encoding) => ipcRenderer.invoke('reopen-with-encoding', filePath, encoding),
  
  // Folder tree operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openFolderByPath: (dirPath) => ipcRenderer.invoke('open-folder-by-path', dirPath),
  getFolderTree: (dirPath) => ipcRenderer.invoke('get-folder-tree', dirPath),
  watchFolder: (dirPath) => ipcRenderer.invoke('watch-folder', dirPath),
  saveFolderState: (dirPath, state) => ipcRenderer.invoke('save-folder-state', dirPath, state),
  getFolderState: (dirPath) => ipcRenderer.invoke('get-folder-state', dirPath),
  createFile: (parentPath, name) => ipcRenderer.invoke('create-file', parentPath, name),
  createFolder: (parentPath, name) => ipcRenderer.invoke('create-folder', parentPath, name),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('rename-path', oldPath, newPath),
  trashPath: (filePath) => ipcRenderer.invoke('trash-path', filePath),

  // Settings
  getLanguage: () => ipcRenderer.invoke('get-language'),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings-set', patch),
  onSettingsChanged: (callback) => ipcRenderer.on('settings-changed', (event, settings) => callback(settings)),

  // Pluggable themes (themes/*.theme.json in userData)
  getThemeList: () => ipcRenderer.invoke('themes-list'),
  getThemeContent: (name) => ipcRenderer.invoke('theme-get', name),
  
  // Asset Ops
  saveAsset: (buffer, extension) => ipcRenderer.invoke('save-asset', buffer, extension),
  
  // Export Ops
  exportPdf: () => ipcRenderer.invoke('export-pdf'),
  exportHtml: (html) => ipcRenderer.invoke('export-html', html),
  
  // Menu Listeners
  onMenuNew: (callback) => ipcRenderer.on('menu-new', () => callback()),
  onMenuUndo: (callback) => ipcRenderer.on('menu-undo', () => callback()),
  onMenuRedo: (callback) => ipcRenderer.on('menu-redo', () => callback()),
  onMenuOpen: (callback) => ipcRenderer.on('menu-open', () => callback()),
  onMenuOpenFolder: (callback) => ipcRenderer.on('menu-open-folder', () => callback()),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', () => callback()),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu-save-as', () => callback()),
  onMenuPdf: (callback) => ipcRenderer.on('menu-pdf', () => callback()),
  onMenuHtml: (callback) => ipcRenderer.on('menu-html', () => callback()),
  onMenuFind: (callback) => ipcRenderer.on('menu-find', () => callback()),
  onMenuReplace: (callback) => ipcRenderer.on('menu-replace', () => callback()),
  onMenuOpenRecent: (callback) => ipcRenderer.on('menu-open-recent', (event, filePath) => callback(filePath)),
  onMenuOpenRecentFolder: (callback) => ipcRenderer.on('menu-open-recent-folder', (event, dirPath) => callback(dirPath)),
  onMenuReopenEncoding: (callback) => ipcRenderer.on('menu-reopen-encoding', (event, encoding) => callback(encoding)),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, lang) => callback(lang)),
  onFolderUpdate: (callback) => ipcRenderer.on('folder-update', (event, tree) => callback(tree)),

  // Window Controls (frameless titlebar)
  windowToggleZoom: () => ipcRenderer.send('window-toggle-zoom'),
  setWindowBackground: (color) => ipcRenderer.send('window-set-bg', color)
})
