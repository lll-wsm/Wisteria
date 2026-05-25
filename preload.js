const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File Ops
  saveFile: (content) => ipcRenderer.invoke('save-file', content),
  saveFileAs: (content) => ipcRenderer.invoke('save-file-as', content),
  openFile: () => ipcRenderer.invoke('open-file'),
  newFile: () => ipcRenderer.invoke('new-file'),
  
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
  onMenuHtml: (callback) => ipcRenderer.on('menu-html', () => callback())
})
