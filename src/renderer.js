import Muya from 'muya-core'
import 'muya-core/src/muya/lib/assets/styles/index.css'

const container = document.querySelector('#editor')
const muya = new Muya(container, {
  markdown: '# Hello Wisteria\n\nThis is your new minimalist editor.'
})

console.log('Muya initialized:', muya)

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
window.electronAPI.onMenuNew(() => {
  muya.markdown = '# New Document\n\n'
  muya.setMarkdown('# New Document\n\n')
})

window.electronAPI.onMenuOpen(async () => {
  const result = await window.electronAPI.openFile()
  if (result.success) {
    muya.markdown = result.content
    muya.setMarkdown(result.content)
  }
})

window.electronAPI.onMenuSave(async () => {
  await window.electronAPI.saveFile(muya.markdown)
})

window.electronAPI.onMenuSaveAs(async () => {
  await window.electronAPI.saveFileAs(muya.markdown)
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
      await window.electronAPI.saveFile(muya.markdown)
      break
    case 'menu-save-as':
      await window.electronAPI.saveFileAs(muya.markdown)
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
