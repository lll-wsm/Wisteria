import Muya from 'muya-core'
import 'muya-core/src/muya/lib/assets/styles/index.css'

const container = document.querySelector('#editor')
const muya = new Muya(container, {
  markdown: '# Hello Wisteria\n\nThis is your new minimalist editor.'
})

console.log('Muya initialized:', muya)

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
  const result = await window.electronAPI.saveAsset(buffer, extension)
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

window.addEventListener('contextmenu', (e) => {
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
})

window.addEventListener('click', () => {
  menu.classList.remove('show')
})

// IPC Listeners (from Electron Menu)
window.electronAPI.onMenuNew(async () => {
  if (activeFilePath) {
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (e) {
      console.error(e)
    }
  }
  activeFilePath = null
  muya.markdown = '# New Document\n\n'
  muya.setMarkdown('# New Document\n\n')
  updateActiveFileHighlight()
})

window.electronAPI.onMenuOpen(async () => {
  if (activeFilePath) {
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (e) {
      console.error(e)
    }
  }
  const result = await window.electronAPI.openFile()
  if (result.success && result.path) {
    activeFilePath = result.path
    muya.markdown = result.content
    muya.setMarkdown(result.content)
    updateActiveFileHighlight()
  }
})

window.electronAPI.onMenuSave(async () => {
  if (activeFilePath) {
    await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
  } else {
    const result = await window.electronAPI.saveFile(muya.markdown)
    if (result.success && result.path) {
      activeFilePath = result.path
      updateActiveFileHighlight()
    }
  }
})

window.electronAPI.onMenuSaveAs(async () => {
  const result = await window.electronAPI.saveFileAs(muya.markdown)
  if (result.success && result.path) {
    activeFilePath = result.path
    updateActiveFileHighlight()
  }
})

window.electronAPI.onMenuPdf(() => {
  window.electronAPI.exportPdf()
})

window.electronAPI.onMenuHtml(async () => {
  const html = await muya.exportStyledHTML({ title: 'Wisteria Document' });
  window.electronAPI.exportHtml(html);
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
        await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
      } else {
        const result = await window.electronAPI.saveFile(muya.markdown)
        if (result.success && result.path) {
          activeFilePath = result.path
          updateActiveFileHighlight()
        }
      }
      break
    case 'menu-save-as':
      const result = await window.electronAPI.saveFileAs(muya.markdown)
      if (result.success && result.path) {
        activeFilePath = result.path
        updateActiveFileHighlight()
      }
      break
    case 'menu-pdf':
      window.electronAPI.exportPdf()
      break
    case 'menu-html':
      const html = await muya.exportStyledHTML({ title: 'Wisteria Document' });
      window.electronAPI.exportHtml(html);
      break
    case 'menu-theme':
      document.body.classList.toggle('theme-dark')
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
})

// Theme Initialization
function initTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  const applyTheme = (e) => {
    if (e.matches) {
      document.body.classList.add('theme-dark')
    } else {
      document.body.classList.remove('theme-dark')
    }
  }

  // Initial check
  applyTheme(mediaQuery)

  // Listen for changes
  mediaQuery.addEventListener('change', applyTheme)
}

// Initial update
updateStatusBar(muya.getWordCount(muya.markdown))
initTheme()

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

  if (activeFilePath) {
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (err) {
      console.error('Auto-save failed:', err)
    }
  }

  const result = await window.electronAPI.openFileWithPath(filePath)
  if (result.success) {
    activeFilePath = filePath
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
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (e) {
      console.error(e)
    }
  }

  const result = await window.electronAPI.openFolder()
  if (result.success && result.path) {
    activeFolderPath = result.path
    expandedPaths.add(activeFolderPath)

    // Fetch and render initial tree
    const treeResult = await window.electronAPI.getFolderTree(activeFolderPath)
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
window.electronAPI.onFolderUpdate((tree) => {
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
      const result = await window.electronAPI.createFolder(parentDir, name)
      if (!result.success) {
        alert(result.error || 'Failed to create folder')
      }
    } else {
      const result = await window.electronAPI.createFile(parentDir, name)
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
    const result = await window.electronAPI.renamePath(targetPath, newPath)
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
        const result = await window.electronAPI.trashPath(contextMenuTargetPath)
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
