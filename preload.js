const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File Ops
  saveFile: (content) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content) => ipcRenderer.invoke('save-file-as', content),
  openFile: () => ipcRenderer.invoke('open-file'),
  newFile: () => ipcRenderer.invoke('new-file'),
  
  // Specific path file operations (for sidebar workspace)
  openFileWithPath: (filePath) => ipcRenderer.invoke('open-file-with-path', filePath),
  saveFileWithPath: (filePath, content) => ipcRenderer.invoke('save-file-with-path', filePath, content),
  
  // Folder tree operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getFolderTree: (dirPath) => ipcRenderer.invoke('get-folder-tree', dirPath),
  watchFolder: (dirPath) => ipcRenderer.invoke('watch-folder', dirPath),
  createFile: (parentPath, name) => ipcRenderer.invoke('create-file', parentPath, name),
  createFolder: (parentPath, name) => ipcRenderer.invoke('create-folder', parentPath, name),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('rename-path', oldPath, newPath),
  trashPath: (filePath) => ipcRenderer.invoke('trash-path', filePath),
  
  // Asset Ops
  saveAsset: (buffer, extension) => ipcRenderer.invoke('save-asset', buffer, extension),
  
  // Export Ops
  exportPdf: () => ipcRenderer.invoke('export-pdf'),
  exportHtml: (html) => ipcRenderer.invoke('export-html', html),
  
  // Menu Listeners
  onMenuNew: (callback) => ipcRenderer.on('menu-new', () => callback()),
  onMenuOpen: (callback) => ipcRenderer.on('menu-open', () => callback()),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', () => callback()),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu-save-as', () => callback()),
  onMenuPdf: (callback) => ipcRenderer.on('menu-pdf', () => callback()),
  onMenuHtml: (callback) => ipcRenderer.on('menu-html', () => callback()),
  onFolderUpdate: (callback) => ipcRenderer.on('folder-update', (event, tree) => callback(tree))
})
