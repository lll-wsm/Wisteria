import Muya from 'muya-core'
import 'muya-core/src/muya/lib/assets/styles/index.css'

const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI__)

// Import Muya UI plugins
import ImageSelector from 'muya-core/src/muya/lib/ui/imageSelector'
import ImageToolbar from 'muya-core/src/muya/lib/ui/imageToolbar'
import Transformer from 'muya-core/src/muya/lib/ui/transformer'
import FormatPicker from 'muya-core/src/muya/lib/ui/formatPicker'
import FrontMenu from 'muya-core/src/muya/lib/ui/frontMenu'
import QuickInsert from 'muya-core/src/muya/lib/ui/quickInsert'
import TablePicker from 'muya-core/src/muya/lib/ui/tablePicker'
import TableBarTools from 'muya-core/src/muya/lib/ui/tableTools'
import EmojiPicker from 'muya-core/src/muya/lib/ui/emojiPicker'

// Register plugins
Muya.use(ImageSelector)
Muya.use(ImageToolbar)
Muya.use(Transformer)
Muya.use(FormatPicker)
Muya.use(FrontMenu)
Muya.use(QuickInsert)
Muya.use(TablePicker)
Muya.use(TableBarTools)
Muya.use(EmojiPicker)

import html2pdf from 'html2pdf.js'

import { open, save } from '@tauri-apps/plugin-dialog'
import { 
  readTextFile, 
  writeTextFile, 
  readDir, 
  mkdir, 
  remove, 
  rename, 
  writeFile 
} from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { join, dirname, basename } from '@tauri-apps/api/path'

/**
 * Tauri API Shim to maintain compatibility with the Electron-based frontend code.
 * This maps former electronAPI calls to Tauri v2 plugins and commands.
 */
const tauriAPI = {
  // File Ops
  openFile: async () => {
    const selected = await open({
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (!selected) return { success: false }
    try {
      const content = await readTextFile(selected)
      return { success: true, content, path: selected }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  saveFile: async (content) => {
    const path = await save({
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (!path) return { success: false }
    try {
      await writeTextFile(path, content)
      return { success: true, path }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  saveFileAs: async (content) => {
    const path = await save({
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (!path) return { success: false }
    try {
      await writeTextFile(path, content)
      return { success: true, path }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  openFileWithPath: async (filePath) => {
    try {
      const content = await readTextFile(filePath)
      return { success: true, content, path: filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  saveFileWithPath: async (filePath, content) => {
    try {
      await writeTextFile(filePath, content)
      return { success: true, path: filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  // Folder & Sidebar Ops
  openFolder: async () => {
    const selected = await open({
      directory: true,
      recursive: true
    })
    if (!selected) return { success: false }
    try {
      const tree = await buildTree(selected)
      return { success: true, path: selected, tree }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  getFolderTree: async (dirPath) => {
    try {
      const tree = await buildTree(dirPath)
      return { success: true, tree }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  createFile: async (parentPath, name) => {
    try {
      const filename = name.endsWith('.md') ? name : `${name}.md`
      const filePath = await join(parentPath, filename)
      await writeTextFile(filePath, '')
      return { success: true, path: filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  createFolder: async (parentPath, name) => {
    try {
      const dirPath = await join(parentPath, name)
      await mkdir(dirPath)
      return { success: true, path: dirPath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  renamePath: async (oldPath, newPath) => {
    try {
      await rename(oldPath, newPath)
      return { success: true, path: newPath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
  trashPath: async (filePath) => {
    try {
      return await invoke('trash_path', { path: filePath })
    } catch (err) {
      return { success: false, error: typeof err === 'string' ? err : err.message }
    }
  },

  // Asset Ops
  saveAsset: async (buffer, extension, options = {}) => {
    if (options.mode !== 'global' && !activeFilePath) {
      return { success: false, error: 'File must be saved before adding assets' }
    }
    try {
      // Ported to Rust command for better performance and consistency
      const result = await invoke('save_asset', {
        buffer: Array.from(new Uint8Array(buffer)),
        extension: extension || 'png',
        mode: options.mode || 'local',
        globalPath: options.globalPath || null,
        activeFilePath: activeFilePath
      })
      
      if (result.success && options.mode === 'global') {
        // Convert the absolute path returned by Rust to a Tauri-compatible URL
        result.path = convertFileSrc(result.path)
      }
      
      return result
    } catch (err) {
      return { success: false, error: typeof err === 'string' ? err : err.message }
    }
  },
  selectImageFolder: async () => {
    const selected = await open({
      directory: true,
      recursive: true
    })
    if (!selected) return { success: false }
    return { success: true, path: selected }
  },

  // Export Ops
  exportPdf: async () => {
    // 1. Generate clean HTML
    const html = await muya.exportStyledHTML({ title: 'Wisteria Export' });

    // 2. Create temporary container
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '800px'; // Set a reasonable width for rendering
    tempContainer.innerHTML = html;
    document.body.appendChild(tempContainer);

    // 3. Configure html2pdf options
    const opt = {
      margin: [0.5, 0.5],
      filename: activeFilePath ? activeFilePath.split('/').pop().replace('.md', '.pdf') : 'document.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        logging: false
      },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // 4. Perform export and cleanup
    try {
      await html2pdf().set(opt).from(tempContainer).save();
    } finally {
      document.body.removeChild(tempContainer);
    }
  },
  exportHtml: async (html) => {
    const path = await save({
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (!path) return { success: false }
    try {
      await writeTextFile(path, html)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  // Menu Event Listeners
  onMenuNew: (callback) => isTauri ? listen('menu-new', () => callback()) : Promise.resolve(() => {}),
  onMenuOpen: (callback) => isTauri ? listen('menu-open', () => callback()) : Promise.resolve(() => {}),
  onMenuOpenFolder: (callback) => isTauri ? listen('menu-open-folder', () => callback()) : Promise.resolve(() => {}),
  onMenuSave: (callback) => isTauri ? listen('menu-save', () => callback()) : Promise.resolve(() => {}),
  onMenuSaveAs: (callback) => isTauri ? listen('menu-save-as', () => callback()) : Promise.resolve(() => {}),
  onMenuPdf: (callback) => isTauri ? listen('menu-pdf', () => callback()) : Promise.resolve(() => {}),
  onMenuHtml: (callback) => isTauri ? listen('menu-html', () => callback()) : Promise.resolve(() => {}),
  onMenuPreferences: (callback) => isTauri ? listen('menu-preferences', () => callback()) : Promise.resolve(() => {}),
  onMenuToggleSidebar: (callback) => isTauri ? listen('menu-toggle-sidebar', () => callback()) : Promise.resolve(() => {}),
  onMenuFind: (callback) => isTauri ? listen('menu-find', () => callback()) : Promise.resolve(() => {}),
  onMenuReplace: (callback) => isTauri ? listen('menu-replace', () => callback()) : Promise.resolve(() => {}),
  onFolderUpdate: (callback) => isTauri ? listen('folder-update', (event) => callback(event.payload)) : Promise.resolve(() => {})
}

/**
 * Recursive helper to build the folder tree for the sidebar.
 */
async function buildTree(dirPath) {
  try {
    const entries = await readDir(dirPath)
    const node = {
      name: await basename(dirPath),
      path: dirPath,
      isDir: true,
      children: []
    }

    for (const entry of entries) {
      if (['.git', 'node_modules', '.antigravitycli', '.DS_Store'].includes(entry.name)) {
        continue
      }
      
      const fullPath = await join(dirPath, entry.name)
      
      if (entry.isDirectory) {
        const childTree = await buildTree(fullPath)
        if (childTree) {
          node.children.push(childTree)
        }
      } else {
        const ext = entry.name.split('.').pop().toLowerCase()
        if (['md', 'markdown', 'txt'].includes(ext)) {
          node.children.push({
            name: entry.name,
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

const container = document.querySelector('#editor')
const muya = new Muya(container, {
  markdown: '# Hello Wisteria\n\nThis is your new minimalist editor.',
  imagePathPicker: async () => {
    const result = await open({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    return result || ''
  }
})

// Fix: Override Muya's image path correction to support Tauri asset protocol
// and relative paths without breaking the global base href.
muya.contentState.correctImageSrc = (src) => {
  if (!src) return src

  // If it's already a Tauri asset (Tauri v1 tauri-asset:, Tauri v2 asset:), web URL, or data URL, return as-is
  if (src.startsWith('tauri-asset:') || src.startsWith('asset:') || src.startsWith('http:') || src.startsWith('https:') || src.startsWith('data:')) {
    return src
  }

  // If we are not running inside Tauri, return as-is (browsers cannot load local absolute paths anyway)
  if (!isTauri) {
    return src
  }

  // Strip file:// protocol if present to get the actual disk path
  // (e.g., file:///Users/... -> /Users/...)
  let cleanPath = src
  if (src.startsWith('file://')) {
    cleanPath = src.startsWith('file:///') && /file:\/\/\/[a-zA-Z]:/.test(src)
      ? src.substring(8) // Windows absolute
      : src.substring(7) // macOS/Linux absolute
  }

  // If it's an absolute path after cleaning, convert to tauri-asset protocol
  const isAbsolute = cleanPath.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(cleanPath)
  if (isAbsolute) {
    return convertFileSrc(cleanPath)
  }

  // If it's a relative path, resolve it against the currently active file
  if (activeFilePath) {
    const dir = activeFilePath.substring(0, activeFilePath.lastIndexOf('/'))
    const absolutePath = cleanPath.startsWith('./') 
      ? dir + cleanPath.substring(1) 
      : dir + '/' + cleanPath
    return convertFileSrc(absolutePath)
  }

  return src
}

// Sidebar workspace states
let activeFolderPath = null
let activeFilePath = null
const expandedPaths = new Set()

function getDirname(p) {
  return p.substring(0, p.lastIndexOf('/'))
}

// Core Image Handling
async function handleImageFile(file) {
  const extension = file.name ? file.name.split('.').pop() : (file.type ? file.type.split('/')[1] : 'png')
  const buffer = await file.arrayBuffer()
  const result = await tauriAPI.saveAsset(buffer, extension, {
    mode: currentSettings.imageSaveMode,
    globalPath: currentSettings.imageGlobalPath
  })
  if (result.success) {
    muya.contentState.insertImage({ src: result.path })
  } else {
    alert(result.error || 'Failed to save image')
  }
}

window.addEventListener('paste', async (event) => {
  const items = event.clipboardData.items
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      event.preventDefault()
      const file = item.getAsFile()
      await handleImageFile(file)
    }
  }
})

window.addEventListener('drop', async (event) => {
  event.preventDefault()
  const files = event.dataTransfer.files
  for (const file of files) {
    if (file.type.indexOf('image') !== -1) {
      await handleImageFile(file)
    }
  }
})

// Stabilization Logic (Attached to Muya's container to avoid interfering with global shortcuts)
container.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const { start, end } = muya.contentState.cursor
    if (start && end && start.key !== end.key) {
      // For multi-line deletion, we let Muya handle it but ensure state is clean
      // Actually, muya.contentState.cutHandler() is very reliable for range deletion
      e.preventDefault()
      muya.contentState.cutHandler()
    }
  }
}, true) // Capture phase to intercept before native behavior

// Floating Menu Logic
const menu = document.querySelector('#floating-menu')
const imgMenu = document.querySelector('#image-context-menu')
let currentImgElement = null
let currentImageInfo = null

function showContextMenu(e) {
  const imageContainer = e.target.closest('.ag-image-container')
  const imageWrapper = e.target.closest('.ag-inline-image')

  if (imageContainer && imageWrapper) {
    e.preventDefault()
    e.stopPropagation()

    // Hide other context menus
    menu.classList.remove('show')
    const sidebarMenu = document.querySelector('#sidebar-context-menu')
    if (sidebarMenu) sidebarMenu.classList.remove('show')

    // Store references
    currentImgElement = imageContainer.querySelector('img')
    currentImageInfo = muya.contentState.getImageInfo(imageWrapper)

    const menuWidth = 150
    const menuHeight = 220
    let x = e.clientX
    let y = e.clientY

    if (x + menuWidth > window.innerWidth) x -= menuWidth
    if (y + menuHeight > window.innerHeight) y -= menuHeight

    imgMenu.style.left = `${x}px`
    imgMenu.style.top = `${y}px`
    imgMenu.classList.add('show')
  } else {
    imgMenu.classList.remove('show')

    // Only show custom menu if we're not right-clicking an image or specific UI element
    if (e.target.closest('.ag-image-container')) return

    e.preventDefault()

    // Basic collision detection with window edges
    const menuWidth = 180
    const menuHeight = 280 // Approximate
    let x = e.clientX
    let y = e.clientY

    if (x + menuWidth > window.innerWidth) x -= menuWidth
    if (y + menuHeight > window.innerHeight) y -= menuHeight

    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    menu.classList.add('show')
  }
}

// Listen for contextmenu events dispatched by Muya's eventCenter (editor-internal right-clicks).
// Muya's clickEvent.js stops DOM propagation, so we must use the eventCenter instead.
muya.eventCenter.subscribe('contextmenu', (e) => {
  showContextMenu(e)
})

// Also listen on window for right-clicks outside the editor area (sidebar, etc.)
window.addEventListener('contextmenu', (e) => {
  // Skip if this is inside the Muya editor (handled by eventCenter subscription above)
  if (e.target.closest('#editor')) return
  showContextMenu(e)
})

window.addEventListener('click', () => {
  menu.classList.remove('show')
  imgMenu.classList.remove('show')
})

// Zoom handlers
const handleZoom = (scale) => {
  if (!currentImgElement || !currentImageInfo) return
  const naturalWidth = currentImgElement.naturalWidth
  const baseWidth = naturalWidth || currentImgElement.clientWidth || 400
  const newWidth = Math.round(baseWidth * scale)
  muya.contentState.updateImage(currentImageInfo, 'width', newWidth)
}

document.querySelector('#img-zoom-25').addEventListener('click', () => handleZoom(0.25))
document.querySelector('#img-zoom-50').addEventListener('click', () => handleZoom(0.50))
document.querySelector('#img-zoom-75').addEventListener('click', () => handleZoom(0.75))
document.querySelector('#img-zoom-100').addEventListener('click', () => handleZoom(1.00))

// Delete handler
document.querySelector('#img-delete').addEventListener('click', () => {
  if (currentImageInfo) {
    muya.contentState.deleteImage(currentImageInfo)
  }
})

function updateDirname(filePath) {
  if (filePath) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    window.DIRNAME = dir
  } else {
    window.DIRNAME = ''
  }
}

// IPC Listeners (from Electron Menu)
tauriAPI.onMenuNew(async () => {
  if (activeFilePath) {
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (!result.success) {
      console.error('Save failed:', result.error)
      alert(`Failed to save current file: ${result.error}`)
      return
    }
  }
  activeFilePath = null
  updateDirname(null)
  muya.markdown = '# New Document\n\n'
  muya.setMarkdown('# New Document\n\n')
  updateActiveFileHighlight()
})

tauriAPI.onMenuOpen(async () => {
  if (activeFilePath) {
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (!result.success) {
      console.error('Save failed:', result.error)
      alert(`Failed to save current file: ${result.error}`)
      return
    }
  }
  const result = await tauriAPI.openFile()
  if (result.success && result.path) {
    activeFilePath = result.path
    updateDirname(activeFilePath)
    muya.markdown = result.content
    muya.setMarkdown(result.content)
    updateActiveFileHighlight()
  }
})

tauriAPI.onMenuOpenFolder(() => {
  handleOpenFolder()
})

tauriAPI.onMenuSave(async () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  if (activeFilePath) {
    showSaveIndicator('Saving...')
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (result.success) {
      showSaveIndicator('Saved', 1500)
    } else {
      console.error('Save failed:', result.error)
      showSaveIndicator(`Save failed: ${result.error}`, 3000, true)
    }
  } else {
    const result = await tauriAPI.saveFile(muya.markdown)
    if (result.success && result.path) {
      activeFilePath = result.path
      updateDirname(activeFilePath)
      updateActiveFileHighlight()
      showSaveIndicator('Saved', 1500)
    } else if (!result.success && result.error) {
      console.error('Save failed:', result.error)
      showSaveIndicator(`Save failed: ${result.error}`, 3000, true)
    }
  }
})

tauriAPI.onMenuSaveAs(async () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  const result = await tauriAPI.saveFileAs(muya.markdown)
  if (result.success && result.path) {
    activeFilePath = result.path
    updateDirname(activeFilePath)
    updateActiveFileHighlight()
    showSaveIndicator('Saved', 1500)
  } else if (!result.success && result.error) {
    console.error('Save As failed:', result.error)
    showSaveIndicator(`Save failed: ${result.error}`, 3000, true)
  }
})

tauriAPI.onMenuPreferences(() => {
  openPreferencesModal()
})

tauriAPI.onMenuPdf(async () => {
  await tauriAPI.exportPdf()
})

tauriAPI.onMenuHtml(async () => {
  const html = await muya.exportStyledHTML({ title: 'Wisteria Document' });
  tauriAPI.exportHtml(html);
})

tauriAPI.onMenuToggleSidebar(() => {
  toggleSidebar()
})

// Floating Menu Event Logic
// (menu variable is already declared above)

// Helper to read text and HTML from clipboard
async function getClipboardData() {
  let text = ''
  let html = ''
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          text = await blob.text()
        }
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html')
          html = await blob.text()
        }
      }
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText()
    }
  } catch (err) {
    console.error('Failed to read clipboard using advanced API, falling back to readText:', err)
    try {
      text = await navigator.clipboard.readText()
    } catch (e) {
      console.error('All clipboard read APIs failed:', e)
    }
  }
  return { text, html }
}

// Prevent the menu from stealing focus from the editor when clicked
menu.addEventListener('mousedown', (e) => {
  e.preventDefault()
})

document.querySelector('#floating-menu').addEventListener('click', async (e) => {
  const target = e.target.closest('.menu-item')
  if (!target) return
  const action = target.id
  
  // Re-focus just in case, though mousedown preventDefault should have kept it
  if (muya && typeof muya.focus === 'function') {
    muya.focus()
  }

  switch (action) {
    case 'menu-cut':
      document.execCommand('cut')
      break
    case 'menu-copy':
      document.execCommand('copy')
      break
    case 'menu-paste':
      try {
        const { text, html } = await getClipboardData()
        if (text || html) {
          const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clipboardData: {
              getData: (type) => {
                if (type === 'text/plain') return text || ''
                if (type === 'text/html') return html || ''
                return ''
              }
            }
          }
          await muya.contentState.pasteHandler(fakeEvent, 'normal', text, html)
        }
      } catch (err) {
        console.error('Paste failed:', err)
      }
      break
    case 'menu-delete':
      const { start, end } = muya.contentState.cursor
      if (start && end && start.key !== end.key) {
        muya.contentState.cutHandler()
      } else {
        document.execCommand('delete')
      }
      break
    case 'menu-save':
      if (activeFilePath) {
        const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
        if (!result.success) {
          alert(`Save failed: ${result.error}`)
        }
      } else {
        const result = await tauriAPI.saveFile(muya.markdown)
        if (result.success && result.path) {
          activeFilePath = result.path
          updateActiveFileHighlight()
        } else if (!result.success && result.error) {
          alert(`Save failed: ${result.error}`)
        }
      }
      break
    case 'menu-save-as':
      const result = await tauriAPI.saveFileAs(muya.markdown)
      if (result.success && result.path) {
        activeFilePath = result.path
        updateActiveFileHighlight()
      }
      break
    case 'menu-pdf':
      tauriAPI.exportPdf()
      break
    case 'menu-html':
      const html = await muya.exportStyledHTML({ title: 'Wisteria Document' });
      tauriAPI.exportHtml(html);
      break
    case 'menu-theme':
      const isDark = document.body.classList.toggle('theme-dark')
      currentSettings.theme = isDark ? 'dark' : 'light'
      saveSettings()
      applyConfiguredTheme(currentSettings.theme)
      break
    case 'menu-preferences':
      openPreferencesModal()
      break
  }
})

// Status Bar Logic
const wordCountDisplay = document.querySelector('#status-word-count')
const charCountDisplay = document.querySelector('#status-char-count')

function updateStatusBar(wordCount) {
  if (!wordCountDisplay || !charCountDisplay) return
  wordCountDisplay.innerText = `${wordCount.word} words`
  charCountDisplay.innerText = `${wordCount.character} characters`
}

muya.on('change', (payload) => {
  updateStatusBar(payload.wordCount)
  debounceAutoSave()
  if (typeof findReplacePanel !== 'undefined' && findReplacePanel && !findReplacePanel.classList.contains('hidden')) {
    performSearch(true)
  }
})

// ==========================================
// Find & Replace Logic (VS Code Style)
// ==========================================

const findReplacePanel = document.querySelector('#find-replace-panel')
const findInput = document.querySelector('#find-input')
const replaceInput = document.querySelector('#replace-input')
const replaceRow = findReplacePanel.querySelector('.replace-row')
const findToggleReplace = document.querySelector('#find-toggle-replace')
const findCount = document.querySelector('#find-count')
const caseSensitiveBtn = document.querySelector('#find-case-sensitive')
const wholeWordBtn = document.querySelector('#find-whole-word')
const regexBtn = document.querySelector('#find-regex')
const findPrevBtn = document.querySelector('#find-prev')
const findNextBtn = document.querySelector('#find-next')
const findCloseBtn = document.querySelector('#find-close')
const replaceOneBtn = document.querySelector('#replace-one')
const replaceAllBtn = document.querySelector('#replace-all')

let currentMatches = []
let currentMatchIndex = -1

// Perform Find Search
function performSearch(keepIndex = false) {
  const query = findInput.value
  if (!query) {
    // Clear search
    muya.search('', {
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: false
    })
    findCount.innerText = 'No results'
    findCount.classList.remove('has-results')
    currentMatches = []
    currentMatchIndex = -1
    return
  }

  const isCaseSensitive = caseSensitiveBtn.classList.contains('active')
  const isWholeWord = wholeWordBtn.classList.contains('active')
  const isRegexp = regexBtn.classList.contains('active')

  // Prevent browser crash / error with invalid regexp
  if (isRegexp) {
    try {
      new RegExp(query)
      findInput.parentElement.classList.remove('invalid-regex')
    } catch (e) {
      findInput.parentElement.classList.add('invalid-regex')
      findCount.innerText = 'Invalid RegExp'
      findCount.classList.add('has-results')
      return
    }
  } else {
    findInput.parentElement.classList.remove('invalid-regex')
  }

  const opt = {
    isCaseSensitive,
    isWholeWord,
    isRegexp
  }

  if (keepIndex && currentMatchIndex >= 0) {
    opt.highlightIndex = currentMatchIndex
  }

  const result = muya.search(query, opt)
  currentMatches = result.matches || []
  currentMatchIndex = result.index

  updateCountDisplay()
}

// Update matches count display
function updateCountDisplay() {
  if (currentMatches.length === 0) {
    findCount.innerText = 'No results'
    findCount.classList.remove('has-results')
  } else {
    findCount.innerText = `${currentMatchIndex + 1} of ${currentMatches.length}`
    findCount.classList.add('has-results')
  }
}

// Scroll active match to viewport center/view
function scrollActiveMatchIntoView() {
  requestAnimationFrame(() => {
    const activeHighlight = document.querySelector('.ag-highlight')
    if (activeHighlight) {
      activeHighlight.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}

// Navigate to Next Match
function findNext() {
  if (currentMatches.length === 0) return
  const result = muya.find('next')
  currentMatches = result.matches || []
  currentMatchIndex = result.index
  updateCountDisplay()
  scrollActiveMatchIntoView()
}

// Navigate to Previous Match
function findPrev() {
  if (currentMatches.length === 0) return
  const result = muya.find('prev')
  currentMatches = result.matches || []
  currentMatchIndex = result.index
  updateCountDisplay()
  scrollActiveMatchIntoView()
}

// Replace Current Match
function replaceOne() {
  if (currentMatches.length === 0 || currentMatchIndex < 0) return
  const replaceValue = replaceInput.value
  const isCaseSensitive = caseSensitiveBtn.classList.contains('active')
  const isWholeWord = wholeWordBtn.classList.contains('active')
  const isRegexp = regexBtn.classList.contains('active')

  const result = muya.replace(replaceValue, {
    isSingle: true,
    isRegexp,
    isCaseSensitive,
    isWholeWord
  })
  muya.dispatchChange()

  currentMatches = result.matches || []
  currentMatchIndex = result.index
  updateCountDisplay()
  scrollActiveMatchIntoView()
}

// Replace All Matches
function replaceAll() {
  if (currentMatches.length === 0) return
  const replaceValue = replaceInput.value
  const isCaseSensitive = caseSensitiveBtn.classList.contains('active')
  const isWholeWord = wholeWordBtn.classList.contains('active')
  const isRegexp = regexBtn.classList.contains('active')

  const result = muya.replace(replaceValue, {
    isSingle: false,
    isRegexp,
    isCaseSensitive,
    isWholeWord
  })
  muya.dispatchChange()

  currentMatches = result.matches || []
  currentMatchIndex = result.index
  updateCountDisplay()
  scrollActiveMatchIntoView()
}

// Show/Toggle Panel
function showPanel(showReplace = false) {
  findReplacePanel.classList.remove('hidden')
  if (showReplace) {
    replaceRow.classList.remove('hidden')
    findToggleReplace.classList.add('expanded')
  } else {
    replaceRow.classList.add('hidden')
    findToggleReplace.classList.remove('expanded')
  }

  // Pre-fill find input with text selection if single line
  const selectedText = window.getSelection().toString()
  if (selectedText && !selectedText.includes('\n')) {
    findInput.value = selectedText
  }

  performSearch()

  // Focus
  if (showReplace && findInput.value) {
    replaceInput.focus()
    replaceInput.select()
  } else {
    findInput.focus()
    findInput.select()
  }
}

// Hide Panel
function hidePanel() {
  findReplacePanel.classList.add('hidden')
  muya.search('', {
    isCaseSensitive: false,
    isWholeWord: false,
    isRegexp: false
  })
  currentMatches = []
  currentMatchIndex = -1
  if (muya && typeof muya.focus === 'function') {
    muya.focus()
  }
}

// Event Listeners for inputs
findInput.addEventListener('input', () => {
  performSearch()
})

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      findPrev()
    } else {
      findNext()
    }
  }
})

replaceInput.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
  
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.altKey && isCmdOrCtrl) {
      replaceAll()
    } else {
      replaceOne()
    }
  }
})

// Action Buttons
findToggleReplace.addEventListener('click', () => {
  const isHidden = replaceRow.classList.contains('hidden')
  if (isHidden) {
    replaceRow.classList.remove('hidden')
    findToggleReplace.classList.add('expanded')
    replaceInput.focus()
  } else {
    replaceRow.classList.add('hidden')
    findToggleReplace.classList.remove('expanded')
    findInput.focus()
  }
})

caseSensitiveBtn.addEventListener('click', () => {
  caseSensitiveBtn.classList.toggle('active')
  performSearch()
})

wholeWordBtn.addEventListener('click', () => {
  wholeWordBtn.classList.toggle('active')
  performSearch()
})

regexBtn.addEventListener('click', () => {
  regexBtn.classList.toggle('active')
  performSearch()
})

findPrevBtn.addEventListener('click', () => {
  findPrev()
})

findNextBtn.addEventListener('click', () => {
  findNext()
})

findCloseBtn.addEventListener('click', () => {
  hidePanel()
})

replaceOneBtn.addEventListener('click', () => {
  replaceOne()
})

replaceAllBtn.addEventListener('click', () => {
  replaceAll()
})

// Global keyboard shortcuts listener
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
  const key = e.key.toLowerCase()

  // Cmd+F or Ctrl+F
  if (isCmdOrCtrl && key === 'f') {
    e.preventDefault()
    showPanel(false)
  }
  // Cmd+Alt+F (macOS Replace) or Ctrl+H (Windows/Linux Replace)
  else if ((isMac && isCmdOrCtrl && e.altKey && key === 'f') || (!isMac && isCmdOrCtrl && key === 'h')) {
    e.preventDefault()
    showPanel(true)
  }
  // Let's also support Cmd+H on macOS specifically if we can intercept it (though OS usually intercepts, it's nice fallback)
  else if (isMac && isCmdOrCtrl && key === 'h') {
    e.preventDefault()
    showPanel(true)
  }
  // Escape
  else if (e.key === 'Escape') {
    if (!findReplacePanel.classList.contains('hidden')) {
      e.preventDefault()
      hidePanel()
    }
  }
})

// IPC listeners from main menu
if (tauriAPI) {
  tauriAPI.onMenuFind(() => {
    showPanel(false)
  })
  tauriAPI.onMenuReplace(() => {
    showPanel(true)
  })
}

// Stop key events inside input from triggering global editor shortcuts or bubbling undesirably
const stopPropagation = (e) => {
  if (e.key !== 'Escape') { // Let Escape bubble so it can close panel
    e.stopPropagation()
  }
}
findInput.addEventListener('keydown', stopPropagation)
replaceInput.addEventListener('keydown', stopPropagation)

// Prevent focus loss when clicking buttons on panel
findReplacePanel.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT') {
    e.preventDefault()
  }
})

// ==========================================
// Settings & Preferences Manager Logic
// ==========================================

const DEFAULT_SETTINGS = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  fontSize: 16,
  lineHeight: 1.8,
  theme: 'system',
  autoSaveDelay: 2000, // 2s
  imageSaveMode: 'local',
  imageGlobalPath: ''
}

let currentSettings = { ...DEFAULT_SETTINGS }

function loadSettings() {
  try {
    const saved = localStorage.getItem('wisteria-settings')
    if (saved) {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
}

function saveSettings() {
  try {
    localStorage.setItem('wisteria-settings', JSON.stringify(currentSettings))
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

function applyStyles() {
  document.documentElement.style.setProperty('--font-family', currentSettings.fontFamily)
  document.documentElement.style.setProperty('--font-size', `${currentSettings.fontSize}px`)
  document.documentElement.style.setProperty('--line-height', currentSettings.lineHeight)
}

let themeMediaQueryListener = null

function applyConfiguredTheme(themeMode) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  if (themeMediaQueryListener) {
    mediaQuery.removeEventListener('change', themeMediaQueryListener)
    themeMediaQueryListener = null
  }

  if (themeMode === 'dark') {
    document.body.classList.add('theme-dark')
  } else if (themeMode === 'light') {
    document.body.classList.remove('theme-dark')
  } else {
    // system
    const applySystemTheme = (e) => {
      if (e.matches) {
        document.body.classList.add('theme-dark')
      } else {
        document.body.classList.remove('theme-dark')
      }
    }
    applySystemTheme(mediaQuery)
    themeMediaQueryListener = applySystemTheme
    mediaQuery.addEventListener('change', themeMediaQueryListener)
  }
}

// Debounced Auto-save
let autoSaveTimer = null
let isSaving = false

function debounceAutoSave() {
  if (!activeFilePath || isSaving) return
  
  const delay = currentSettings.autoSaveDelay
  if (delay <= 0) return

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }

  autoSaveTimer = setTimeout(async () => {
    isSaving = true
    showSaveIndicator('Saving...')
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (result.success) {
      showSaveIndicator('Saved', 1500)
    } else {
      console.error('Auto-save failed:', result.error)
      showSaveIndicator('Save failed', 2000, true)
    }
    isSaving = false
  }, delay)
}

function showSaveIndicator(text, duration = 0, isError = false) {
  const indicator = document.querySelector('#status-save-state')
  if (!indicator) return
  
  indicator.innerText = text
  indicator.className = 'status-indicator'
  
  if (text === 'Saving...') {
    indicator.classList.add('saving')
  } else if (isError) {
    indicator.classList.add('error')
  } else {
    indicator.classList.add('saved')
  }
  
  if (duration > 0) {
    setTimeout(() => {
      if (indicator.innerText === text) {
        indicator.innerText = ''
        indicator.className = 'status-indicator'
      }
    }, duration)
  }
}

// UI Bindings for Preferences Dialog
const prefsModal = document.querySelector('#preferences-modal')
const sidebarSettingsBtn = document.querySelector('#sidebar-settings-btn')
const settingsCloseBtn = document.querySelector('#settings-close-btn')
const settingsSaveBtn = document.querySelector('#settings-save-btn')
const settingsResetBtn = document.querySelector('#settings-reset-btn')

// Appearance Controls
const settingsFontFamily = document.querySelector('#settings-font-family')
const settingsFontSize = document.querySelector('#settings-font-size')
const fontSizeVal = document.querySelector('#font-size-val')
const settingsLineHeight = document.querySelector('#settings-line-height')
const lineHeightVal = document.querySelector('#line-height-val')

// Editor Controls
const settingsAutoSave = document.querySelector('#settings-auto-save')

// Media Controls
const settingsImagePath = document.querySelector('#settings-image-path')
const browseImagePathBtn = document.querySelector('#browse-image-path-btn')
const globalPathRow = document.querySelector('#global-path-row')

function initSegmentedControl(id, value, onChange) {
  const control = document.querySelector(`#${id}`)
  
  // Clone options to prevent multiple event listener accumulation
  const options = control.querySelectorAll('.segmented-option')
  options.forEach(opt => {
    const newOpt = opt.cloneNode(true)
    opt.parentNode.replaceChild(newOpt, opt)
  })

  // Re-fetch options after cloning to bind listeners to active DOM nodes
  const activeOptions = control.querySelectorAll('.segmented-option')
  
  const selectOption = (val) => {
    activeOptions.forEach(opt => {
      if (opt.dataset.value === val) {
        opt.classList.add('selected')
      } else {
        opt.classList.remove('selected')
      }
    })
  }

  selectOption(value)
  
  activeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const newVal = opt.dataset.value
      selectOption(newVal)
      onChange(newVal)
    })
  })
}

function openPreferencesModal() {
  loadSettings()
  
  initSegmentedControl('theme-segmented', currentSettings.theme, (val) => {
    currentSettings.theme = val
    applyConfiguredTheme(val)
  })
  
  settingsFontFamily.value = currentSettings.fontFamily
  settingsFontSize.value = currentSettings.fontSize
  fontSizeVal.innerText = `${currentSettings.fontSize}px`
  settingsLineHeight.value = currentSettings.lineHeight
  lineHeightVal.innerText = currentSettings.lineHeight
  
  settingsAutoSave.value = currentSettings.autoSaveDelay
  
  initSegmentedControl('image-save-segmented', currentSettings.imageSaveMode, (val) => {
    currentSettings.imageSaveMode = val
    if (val === 'global') {
      globalPathRow.style.display = 'flex'
    } else {
      globalPathRow.style.display = 'none'
    }
  })
  
  if (currentSettings.imageSaveMode === 'global') {
    globalPathRow.style.display = 'flex'
  } else {
    globalPathRow.style.display = 'none'
  }
  settingsImagePath.value = currentSettings.imageGlobalPath

  prefsModal.classList.add('show')
}

function closePreferencesModal() {
  prefsModal.classList.remove('show')
  loadSettings()
  applyConfiguredTheme(currentSettings.theme)
  applyStyles()
}

// Live Previews
settingsFontSize.addEventListener('input', (e) => {
  const val = e.target.value
  fontSizeVal.innerText = `${val}px`
  document.documentElement.style.setProperty('--font-size', `${val}px`)
})

settingsLineHeight.addEventListener('input', (e) => {
  const val = e.target.value
  lineHeightVal.innerText = val
  document.documentElement.style.setProperty('--line-height', val)
})

settingsFontFamily.addEventListener('change', (e) => {
  const val = e.target.value
  document.documentElement.style.setProperty('--font-family', val)
})

browseImagePathBtn.addEventListener('click', async () => {
  const result = await tauriAPI.selectImageFolder()
  if (result.success && result.path) {
    settingsImagePath.value = result.path
  }
})

settingsCloseBtn.addEventListener('click', closePreferencesModal)
prefsModal.addEventListener('click', (e) => {
  if (e.target === prefsModal) {
    closePreferencesModal()
  }
})

settingsSaveBtn.addEventListener('click', () => {
  currentSettings.fontFamily = settingsFontFamily.value
  currentSettings.fontSize = parseInt(settingsFontSize.value, 10)
  currentSettings.lineHeight = parseFloat(settingsLineHeight.value)
  currentSettings.autoSaveDelay = parseInt(settingsAutoSave.value, 10)
  currentSettings.imageGlobalPath = settingsImagePath.value
  
  saveSettings()
  applyConfiguredTheme(currentSettings.theme)
  applyStyles()
  prefsModal.classList.remove('show')
})

settingsResetBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to restore default preferences?')) {
    currentSettings = { ...DEFAULT_SETTINGS }
    saveSettings()
    applyConfiguredTheme(currentSettings.theme)
    applyStyles()
    
    settingsFontFamily.value = currentSettings.fontFamily
    settingsFontSize.value = currentSettings.fontSize
    fontSizeVal.innerText = `${currentSettings.fontSize}px`
    settingsLineHeight.value = currentSettings.lineHeight
    lineHeightVal.innerText = currentSettings.lineHeight
    settingsAutoSave.value = currentSettings.autoSaveDelay
    settingsImagePath.value = currentSettings.imageGlobalPath
    
    initSegmentedControl('theme-segmented', currentSettings.theme, (val) => {
      currentSettings.theme = val
      applyConfiguredTheme(val)
    })
    initSegmentedControl('image-save-segmented', currentSettings.imageSaveMode, (val) => {
      currentSettings.imageSaveMode = val
      if (val === 'global') {
        globalPathRow.style.display = 'flex'
      } else {
        globalPathRow.style.display = 'none'
      }
    })
    if (currentSettings.imageSaveMode === 'global') {
      globalPathRow.style.display = 'flex'
    } else {
      globalPathRow.style.display = 'none'
    }
  }
})

if (sidebarSettingsBtn) {
  sidebarSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    openPreferencesModal()
  })
}

// Global hotkeys (Cmd+, / Ctrl+, for settings, Escape to close)
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCmdComma = (isMac ? e.metaKey : e.ctrlKey) && e.key === ','
  
  if (isCmdComma) {
    e.preventDefault()
    openPreferencesModal()
  }
  
  if (e.key === 'Escape' && prefsModal.classList.contains('show')) {
    e.preventDefault()
    closePreferencesModal()
  }
})

// Initialize configurations on load
loadSettings()
window.DIRNAME = '' // Polyfill for muya-core to avoid baseUrl warnings
updateStatusBar(muya.getWordCount(muya.markdown))
applyConfiguredTheme(currentSettings.theme)
applyStyles()

// ==========================================
// Sidebar & Workspace Controller Logic
// ==========================================

const sidebar = document.querySelector('#sidebar')
const sidebarToggle = document.querySelector('#sidebar-toggle')
const sidebarTreeContainer = document.querySelector('#sidebar-tree')
const sidebarContextMenu = document.querySelector('#sidebar-context-menu')

let contextMenuTargetPath = null
let contextMenuTargetIsDir = false
let activeTreeInput = null
let activeTreeInputCommit = null
let activeTreeInputCancel = null
let activeTreeInputFocusTimer = null

function toggleSidebar() {
  const isCollapsed = sidebar.classList.toggle('collapsed')
  document.body.classList.toggle('sidebar-open', !isCollapsed)
}

sidebarToggle.addEventListener('click', toggleSidebar)

// Global keyboard shortcut Cmd+B (macOS) / Ctrl+B (Windows/Linux)
window.addEventListener('keydown', (e) => {
  if (activeTreeInput && activeTreeInput.isConnected) return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCmdB = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'b'
  if (isCmdB) {
    e.preventDefault()
    toggleSidebar()
  }
})

// File Selection & Auto-save Logic
async function selectFile(filePath) {
  if (activeFilePath === filePath) return

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }

  if (activeFilePath) {
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (!result.success) {
      console.error('Auto-save failed before switching file:', result.error)
      if (!confirm(`Failed to save changes to current file: ${result.error}\nDo you want to switch files anyway? (Unsaved changes will be lost)`)) {
        return
      }
    }
  }

  const result = await tauriAPI.openFileWithPath(filePath)
  if (result.success) {
    activeFilePath = filePath
    updateDirname(filePath)
    muya.markdown = result.content
    muya.setMarkdown(result.content)
    updateActiveFileHighlight()
  } else {
    alert(`Failed to open file: ${result.error || ''}`)
  }
}

// Active Highlight sync helper
function updateActiveFileHighlight() {
  const items = document.querySelectorAll('.tree-item')
  items.forEach(item => {
    if (item.dataset.path === activeFilePath) {
      item.classList.add('active')
    } else {
      item.classList.remove('active')
    }
  })
}

// Open Folder action
async function handleOpenFolder() {
  if (activeFilePath) {
    const result = await tauriAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (!result.success) {
      console.error('Save before open folder failed:', result.error)
      if (!confirm(`Failed to save changes to current file: ${result.error}\nDo you want to open another folder anyway?`)) {
        return
      }
    }
  }

  const result = await tauriAPI.openFolder()
  if (result.success && result.path) {
    activeFolderPath = result.path
    expandedPaths.add(activeFolderPath)

    // Fetch and render initial tree
    const treeResult = await tauriAPI.getFolderTree(activeFolderPath)
    if (treeResult.success) {
      renderTree(treeResult.tree)
    }

    // Automatically reveal sidebar
    sidebar.classList.remove('collapsed')
    document.body.classList.add('sidebar-open')
  }
}

const openFolderBtn = document.querySelector('#open-folder-btn')
if (openFolderBtn) {
  openFolderBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    handleOpenFolder()
  })
  openFolderBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
}

// Watcher listener for live updates
tauriAPI.onFolderUpdate((tree) => {
  renderTree(tree)
})

// Rendering functions
function renderTree(tree) {
  if (!tree) {
    sidebarTreeContainer.innerHTML = `
      <div class="empty-state">
        <p>No workspace folder open.</p>
        <button id="sidebar-open-folder-cta">Open Folder</button>
      </div>
    `
    const cta = document.querySelector('#sidebar-open-folder-cta')
    if (cta) {
      cta.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        handleOpenFolder()
      })
      cta.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
    }
    return
  }

  sidebarTreeContainer.innerHTML = ''
  const ul = document.createElement('ul')
  ul.className = 'tree-node'

  if (tree.children && tree.children.length > 0) {
    for (const child of tree.children) {
      ul.appendChild(createTreeNodeDOM(child))
    }
  } else {
    const li = document.createElement('li')
    li.style.padding = '10px 20px'
    li.style.opacity = '0.5'
    li.style.fontSize = '12px'
    li.innerText = 'Empty directory'
    ul.appendChild(li)
  }
  sidebarTreeContainer.appendChild(ul)
  updateActiveFileHighlight()
}

function createTreeNodeDOM(node) {
  const li = document.createElement('li')
  li.className = 'tree-element'

  const itemDiv = document.createElement('div')
  itemDiv.className = 'tree-item'
  itemDiv.dataset.path = node.path
  itemDiv.dataset.isdir = node.isDir

  // Chevron arrow for folders
  const arrowSpan = document.createElement('span')
  arrowSpan.className = 'arrow'
  if (node.isDir) {
    arrowSpan.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
    if (expandedPaths.has(node.path)) {
      arrowSpan.classList.add('expanded')
    }
  }
  itemDiv.appendChild(arrowSpan)

  // Icon (Folder or File SVG)
  const iconSpan = document.createElement('span')
  iconSpan.className = 'icon'
  if (node.isDir) {
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
  } else {
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`
  }
  itemDiv.appendChild(iconSpan)

  // Label
  const nameSpan = document.createElement('span')
  nameSpan.className = 'node-name'
  nameSpan.innerText = node.name
  itemDiv.appendChild(nameSpan)

  li.appendChild(itemDiv)

  // Child Nodes
  if (node.isDir) {
    const childrenDiv = document.createElement('div')
    childrenDiv.className = 'tree-children'
    if (expandedPaths.has(node.path)) {
      childrenDiv.classList.add('expanded')
    }

    if (node.children && node.children.length > 0) {
      const subUl = document.createElement('ul')
      subUl.className = 'tree-node'
      for (const child of node.children) {
        subUl.appendChild(createTreeNodeDOM(child))
      }
      childrenDiv.appendChild(subUl)
    } else {
      const emptyDiv = document.createElement('div')
      emptyDiv.style.padding = '4px 28px'
      emptyDiv.style.opacity = '0.4'
      emptyDiv.style.fontSize = '11px'
      emptyDiv.innerText = 'Empty'
      childrenDiv.appendChild(emptyDiv)
    }
    li.appendChild(childrenDiv)

    // Expand / collapse folder node
    itemDiv.addEventListener('click', (e) => {
      if (e.button !== 0) return

      const isExpanded = expandedPaths.has(node.path)
      if (isExpanded) {
        expandedPaths.delete(node.path)
        arrowSpan.classList.remove('expanded')
        childrenDiv.classList.remove('expanded')
      } else {
        expandedPaths.add(node.path)
        arrowSpan.classList.add('expanded')
        childrenDiv.classList.add('expanded')
      }
    })
  } else {
    // Open markdown file node
    itemDiv.addEventListener('click', (e) => {
      if (e.button !== 0) return
      selectFile(node.path)
    })
  }

  return li
}

// Sidebar Context Menu
sidebarTreeContainer.addEventListener('contextmenu', (e) => {
  const item = e.target.closest('.tree-item')
  e.preventDefault()
  e.stopPropagation()

  let x = e.clientX
  let y = e.clientY

  if (item) {
    contextMenuTargetPath = item.dataset.path
    contextMenuTargetIsDir = item.dataset.isdir === 'true'
  } else {
    contextMenuTargetPath = activeFolderPath
    contextMenuTargetIsDir = true
  }

  if (!contextMenuTargetPath) return

  const menuWidth = 160
  const menuHeight = 160
  if (x + menuWidth > window.innerWidth) x -= menuWidth
  if (y + menuHeight > window.innerHeight) y -= menuHeight

  sidebarContextMenu.style.left = `${x}px`
  sidebarContextMenu.style.top = `${y}px`
  sidebarContextMenu.classList.add('show')
})

// Keep focus state on menu clicks
sidebarContextMenu.addEventListener('mousedown', (e) => {
  e.preventDefault()
  e.stopPropagation()
})

window.addEventListener('click', () => {
  sidebarContextMenu.classList.remove('show')
})

function getFolderChildrenUl(folderPath) {
  if (folderPath === activeFolderPath) {
    return sidebarTreeContainer.querySelector('ul.tree-node')
  }
  const item = sidebarTreeContainer.querySelector(`.tree-item[data-path="${CSS.escape(folderPath)}"]`)
  if (!item) return null

  if (!expandedPaths.has(folderPath)) {
    expandedPaths.add(folderPath)
    const arrow = item.querySelector('.arrow')
    if (arrow) arrow.classList.add('expanded')
    const childrenDiv = item.nextElementSibling
    if (childrenDiv) childrenDiv.classList.add('expanded')
  }

  const childrenDiv = item.nextElementSibling
  if (childrenDiv) {
    let ul = childrenDiv.querySelector('ul.tree-node')
    if (!ul) {
      childrenDiv.innerHTML = ''
      ul = document.createElement('ul')
      ul.className = 'tree-node'
      childrenDiv.appendChild(ul)
    }
    return ul
  }
  return null
}

function writeKeyToTreeInput(event) {
  const input = activeTreeInput
  if (!input || !input.isConnected) return

  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length

  if (event.key === 'Backspace') {
    if (start !== end) {
      input.setRangeText('', start, end, 'end')
    } else if (start > 0) {
      input.setRangeText('', start - 1, start, 'end')
    }
  } else if (event.key === 'Delete') {
    if (start !== end) {
      input.setRangeText('', start, end, 'end')
    } else if (start < input.value.length) {
      input.setRangeText('', start, start + 1, 'end')
    }
  } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    input.setRangeText(event.key, start, end, 'end')
  } else {
    return
  }

  input.dispatchEvent(new Event('input', { bubbles: true }))
}

window.addEventListener('keydown', (e) => {
  if (!activeTreeInput || !activeTreeInput.isConnected || e.target === activeTreeInput) return

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  activeTreeInput.focus()

  if (e.key === 'Enter') {
    activeTreeInputCommit?.()
  } else if (e.key === 'Escape') {
    activeTreeInputCancel?.()
  } else {
    writeKeyToTreeInput(e)
  }
}, true)

function clearActiveTreeInput(input) {
  if (input && activeTreeInput !== input) return

  activeTreeInput = null
  activeTreeInputCommit = null
  activeTreeInputCancel = null
  if (activeTreeInputFocusTimer) {
    clearInterval(activeTreeInputFocusTimer)
    activeTreeInputFocusTimer = null
  }
}

function focusTreeInput(input, options = {}) {
  const {
    selectText = false,
    selectRange = null,
    commit = null,
    cancel = null
  } = options

  activeTreeInput = input
  activeTreeInputCommit = commit
  activeTreeInputCancel = cancel

  const focus = () => {
    if (!input.isConnected) return
    input.focus()
    if (selectRange) {
      input.setSelectionRange(selectRange[0], selectRange[1])
    } else if (selectText) {
      input.select()
    }
  }

  if (activeTreeInputFocusTimer) {
    clearInterval(activeTreeInputFocusTimer)
  }

  let attempts = 0
  activeTreeInputFocusTimer = setInterval(() => {
    attempts += 1
    if (!input.isConnected) {
      clearActiveTreeInput(input)
      return
    }
    if (attempts > 20) {
      clearInterval(activeTreeInputFocusTimer)
      activeTreeInputFocusTimer = null
      return
    }
    if (document.activeElement !== input) {
      focus()
    }
  }, 50)

  requestAnimationFrame(() => {
    focus()
    setTimeout(() => {
      if (document.activeElement !== input) {
        focus()
      }
    }, 0)
  })
}

function showInlineInputForCreate(parentDir, isDir) {
  const ul = getFolderChildrenUl(parentDir)
  if (!ul) return

  const tempLi = document.createElement('li')
  tempLi.className = 'tree-element temp-input-node'

  const itemDiv = document.createElement('div')
  itemDiv.className = 'tree-item tree-item-input'
  itemDiv.style.paddingLeft = '12px'

  const arrowSpan = document.createElement('span')
  arrowSpan.className = 'arrow'
  itemDiv.appendChild(arrowSpan)

  const iconSpan = document.createElement('span')
  iconSpan.className = 'icon'
  if (isDir) {
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
  } else {
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`
  }
  itemDiv.appendChild(iconSpan)

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-input-inline'
  input.placeholder = isDir ? 'Folder Name' : 'File Name (.md)'
  itemDiv.appendChild(input)
  tempLi.appendChild(itemDiv)

  // Prevent event bubbling to prevent editor focus theft
  input.addEventListener('mousedown', (e) => e.stopPropagation())
  input.addEventListener('mouseup', (e) => e.stopPropagation())
  input.addEventListener('click', (e) => e.stopPropagation())

  if (ul.firstElementChild && ul.firstElementChild.classList.contains('temp-input-node')) {
    const existingInput = ul.firstElementChild.querySelector('.tree-input-inline')
    if (existingInput) {
      focusTreeInput(existingInput)
    }
    return
  }

  if (ul.firstChild) {
    ul.insertBefore(tempLi, ul.firstChild)
  } else {
    if (ul.innerText.trim() === 'Empty' || ul.innerText.trim() === 'Empty directory') {
      ul.innerHTML = ''
    }
    ul.appendChild(tempLi)
  }

  let isSubmitting = false
  let isReadyForBlurSubmit = false
  setTimeout(() => {
    isReadyForBlurSubmit = true
  }, 200)

  const submit = async () => {
    if (isSubmitting) return
    isSubmitting = true

    const name = input.value.trim()
    if (!name) {
      cleanup()
      return
    }

    if (isDir) {
      const result = await tauriAPI.createFolder(parentDir, name)
      if (!result.success) {
        alert(result.error || 'Failed to create folder')
      }
    } else {
      const result = await tauriAPI.createFile(parentDir, name)
      if (result.success && result.path) {
        await selectFile(result.path)
      } else if (!result.success) {
        alert(result.error || 'Failed to create file')
      }
    }

    cleanup()
  }

  const cleanup = () => {
    clearActiveTreeInput(input)
    if (tempLi.parentNode) {
      tempLi.parentNode.removeChild(tempLi)
    }
    if (ul.children.length === 0) {
      ul.innerHTML = '<li style="padding: 10px 20px; opacity: 0.5; font-size: 12px;">Empty directory</li>'
    }
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      submit()
    } else if (e.key === 'Escape') {
      cleanup()
    }
  })

  focusTreeInput(input, { commit: submit, cancel: cleanup })

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (isReadyForBlurSubmit) {
        submit()
      }
    }, 150)
  })
}

function showInlineInputForRename(targetPath, isDir) {
  const item = sidebarTreeContainer.querySelector(`.tree-item[data-path="${CSS.escape(targetPath)}"]`)
  if (!item) return

  const nameSpan = item.querySelector('.node-name')
  if (!nameSpan) return

  const oldName = targetPath.substring(targetPath.lastIndexOf('/') + 1)
  const originalDisplay = nameSpan.style.display
  nameSpan.style.display = 'none'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-input-inline'
  input.value = oldName
  item.appendChild(input)

  // Prevent event bubbling to prevent editor focus theft
  input.addEventListener('mousedown', (e) => e.stopPropagation())
  input.addEventListener('mouseup', (e) => e.stopPropagation())
  input.addEventListener('click', (e) => e.stopPropagation())

  const focusOptions = !isDir && oldName.includes('.')
    ? { selectRange: [0, oldName.lastIndexOf('.')] }
    : { selectText: true }

  let isSubmitting = false

  const submit = async () => {
    if (isSubmitting) return
    isSubmitting = true

    const newName = input.value.trim()
    if (!newName || newName === oldName) {
      cleanup()
      return
    }

    const pathPrefix = getDirname(targetPath)
    const newPath = `${pathPrefix}/${newName}`
    const result = await tauriAPI.renamePath(targetPath, newPath)
    if (result.success) {
      if (isDir) {
        expandedPaths.forEach(p => {
          if (p.startsWith(targetPath)) {
            expandedPaths.delete(p)
            expandedPaths.add(p.replace(targetPath, newPath))
          }
        })
      }
      if (activeFilePath === targetPath) {
        activeFilePath = newPath
        updateDirname(newPath)
      }
    } else {
      alert(result.error || 'Failed to rename')
    }

    cleanup()
  }

  const cleanup = () => {
    clearActiveTreeInput(input)
    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }
    nameSpan.style.display = originalDisplay
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      submit()
    } else if (e.key === 'Escape') {
      cleanup()
    }
  })

  focusTreeInput(input, { ...focusOptions, commit: submit, cancel: cleanup })

  input.addEventListener('blur', () => {
    setTimeout(() => {
      submit()
    }, 150)
  })
}

// Context Menu Handlers
sidebarContextMenu.addEventListener('click', async (e) => {
  e.preventDefault()
  e.stopPropagation()

  sidebarContextMenu.classList.remove('show')

  const target = e.target.closest('.menu-item')
  if (!target) return
  const action = target.id

  const parentDir = contextMenuTargetIsDir ? contextMenuTargetPath : getDirname(contextMenuTargetPath)

  switch (action) {
    case 'ctx-new-file': {
      showInlineInputForCreate(parentDir, false)
      break
    }
    case 'ctx-new-folder': {
      showInlineInputForCreate(parentDir, true)
      break
    }
    case 'ctx-rename': {
      showInlineInputForRename(contextMenuTargetPath, contextMenuTargetIsDir)
      break
    }
    case 'ctx-delete': {
      const name = contextMenuTargetPath.substring(contextMenuTargetPath.lastIndexOf('/') + 1)
      if (confirm(`Are you sure you want to move "${name}" to Trash?`)) {
        const result = await tauriAPI.trashPath(contextMenuTargetPath)
        if (result.success) {
          if (activeFilePath === contextMenuTargetPath) {
            activeFilePath = null
            muya.markdown = ''
            muya.setMarkdown('')
          }
        } else {
          alert(result.error || 'Failed to delete')
        }
      }
      break
    }
  }
})

// Initialize empty workspace tree sidebar states on startup
renderTree(null)
