import Muya from 'muya-core'
import QuickInsert from 'muya-core/src/muya/lib/ui/quickInsert'
import CodePicker from 'muya-core/src/muya/lib/ui/codePicker'
import TablePicker from 'muya-core/src/muya/lib/ui/tablePicker'
import EmojiPicker from 'muya-core/src/muya/lib/ui/emojiPicker'
import TableBarTools from 'muya-core/src/muya/lib/ui/tableTools'
import FormatPicker from 'muya-core/src/muya/lib/ui/formatPicker'
import FrontMenu from 'muya-core/src/muya/lib/ui/frontMenu'
import LinkTools from 'muya-core/src/muya/lib/ui/linkTools'
import ImageToolbar from 'muya-core/src/muya/lib/ui/imageToolbar'
import ImageSelector from 'muya-core/src/muya/lib/ui/imageSelector'
import ImagePathPicker from 'muya-core/src/muya/lib/ui/imagePicker'
import FootnoteTool from 'muya-core/src/muya/lib/ui/footnoteTool'
import 'muya-core/src/muya/lib/assets/styles/index.css'
import enUS from '../locales/en-US.json'
import zhCN from '../locales/zh-CN.json'
import ENCODINGS from '../shared/encodings.json'

// Register Muya UI plugins (format toolbar, quick insert, pickers, etc.);
// without this the floating tools never get instantiated.
Muya.use(QuickInsert)
Muya.use(CodePicker)
Muya.use(TablePicker)
Muya.use(EmojiPicker)
Muya.use(TableBarTools)
Muya.use(FormatPicker)
Muya.use(FrontMenu)
Muya.use(LinkTools)
Muya.use(ImageToolbar)
Muya.use(ImageSelector)
Muya.use(ImagePathPicker)
Muya.use(FootnoteTool)

// i18n must be initialized before Muya construction (Muya calls options.t during init)
let currentLang = 'en-US'
const dicts = { 'en-US': enUS, 'zh-CN': zhCN }

const container = document.querySelector('#editor')
const muya = new Muya(container, {
  markdown: '',
  t,
  mermaidTheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
})

console.log('Muya initialized:', muya)

// Focus the editor after construction so the first (empty) line shows its
// front icon and the "Type @ to insert" hint. Without this the active block
// is not set until the user clicks/types/folds, so those indicators stay
// hidden on a fresh launch. setCursor() re-renders so the active class is
// applied to the cursor's block (focus() alone only sets the DOM selection).
setTimeout(() => {
  if (muya && typeof muya.focus === 'function') {
    muya.focus()
    if (typeof muya.setCursor === 'function') {
      try {
        muya.setCursor()
      } catch (e) {
        console.error('Initial cursor render failed:', e)
      }
    }
  }
}, 100)

// ===================== i18n (renderer) =====================
function t(key, vars) {
  let str = (dicts[currentLang] && dicts[currentLang][key]) || dicts['en-US'][key] || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v)
    }
  }
  return str
}

function applyI18n() {
  document.title = t('app.name')
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    if (!key) return
    const value = t(key)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const textNodes = []
    let node
    while ((node = walker.nextNode())) textNodes.push(node)
    if (textNodes.length > 0) {
      textNodes[textNodes.length - 1].nodeValue = value
    } else {
      el.textContent = value
    }
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder)
  })
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle)
  })
  // Re-capture the (translated) stock contents of the right-click menu
  if (typeof menu !== 'undefined' && menu) {
    menuStaticHTML = menu.innerHTML
  }
}

// ===================== Dirty tracking =====================
let isDirty = false
let lastSavedMarkdown = null

function markSaved(content) {
  lastSavedMarkdown = content
  isDirty = false
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
  const result = await window.electronAPI.saveAsset(buffer, extension)
  if (result.success) {
    muya.contentState.insertImage({ src: result.path })
  } else {
    alert(result.error || t('alert.saveImageFailed'))
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
let menuStaticHTML = menu.innerHTML

function hideFloatMenu() {
  menu.classList.remove('show')
  menu.innerHTML = menuStaticHTML
}

window.addEventListener('contextmenu', (e) => {
  // Only show custom menu if we're not right-clicking an image or specific UI element
  if (e.target.closest('.ag-image-container')) return 

  e.preventDefault()

  // Always start from the main menu (e.g. after the encoding submenu was open)
  menu.innerHTML = menuStaticHTML

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
  hideFloatMenu()
})

// IPC Listeners (from Electron Menu)
window.electronAPI.onMenuUndo(() => {
  muya.undo()
})

window.electronAPI.onMenuRedo(() => {
  muya.redo()
})

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
  resetEditorScroll()
  markSaved(muya.markdown)
  setCurrentEncoding(null)
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
    // Persist the folder's last state BEFORE switching to a standalone file.
    await leaveFolderContext()
    await applyFileContent(result, result.path)
  }
})

// Exit any open-folder context (standalone file open via Cmd+O or Recent).
async function leaveFolderContext() {
  if (!activeFolderPath) return
  await saveFolderStateNow()
  activeFolderPath = null
  expandedPaths.clear()
  renderTree(null)
  sidebar.classList.add('collapsed')
  document.body.classList.remove('sidebar-open')
}

window.electronAPI.onMenuSave(async () => {
  if (activeFilePath) {
    const result = await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    if (result.success) {
      markSaved(muya.markdown)
      setCurrentEncoding(result.encoding)
    }
  } else {
    const result = await window.electronAPI.saveFile(muya.markdown)
    if (result.success && result.path) {
      activeFilePath = result.path
      markSaved(muya.markdown)
      setCurrentEncoding(result.encoding)
      updateActiveFileHighlight()
    }
  }
})

window.electronAPI.onMenuSaveAs(async () => {
  const result = await window.electronAPI.saveFileAs(muya.markdown)
  if (result.success && result.path) {
    activeFilePath = result.path
    markSaved(muya.markdown)
    setCurrentEncoding(result.encoding)
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

  if (action === 'menu-encoding') {
    e.stopPropagation()
    showEncodingMenuInFloat()
    return
  }
  if (action === 'menu-back') {
    e.stopPropagation()
    menu.innerHTML = menuStaticHTML
    return
  }
  if (action.startsWith('enc-')) {
    hideFloatMenu()
    handleReopenEncoding(target.dataset.encoding)
    return
  }
  
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
        const saveResult = await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
        if (saveResult.success) {
          markSaved(muya.markdown)
          setCurrentEncoding(saveResult.encoding)
        }
      } else {
        const result = await window.electronAPI.saveFile(muya.markdown)
        if (result.success && result.path) {
          activeFilePath = result.path
          markSaved(muya.markdown)
          setCurrentEncoding(result.encoding)
          updateActiveFileHighlight()
        }
      }
      break
    case 'menu-save-as':
      const result = await window.electronAPI.saveFileAs(muya.markdown)
      if (result.success && result.path) {
        activeFilePath = result.path
        markSaved(muya.markdown)
        setCurrentEncoding(result.encoding)
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
  }
})

muya.on('change', (payload) => {
  isDirty = muya.markdown !== lastSavedMarkdown
  if (typeof findReplacePanel !== 'undefined' && findReplacePanel && !findReplacePanel.classList.contains('hidden')) {
    performSearch(true)
  }
})

// Theme Initialization (settings-driven: light / dark / system / pluggable file themes)
let currentTheme = 'system'
let currentThemeMeta = null // { name, label, dark, colors, typography } for file themes
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)')

// Keep Mermaid's built-in theme in sync so diagrams are readable in both modes
function syncMermaidTheme() {
  if (!muya || !muya.options) return
  const theme = document.body.classList.contains('theme-dark') ? 'dark' : 'default'
  if (muya.options.mermaidTheme === theme) return
  muya.options.mermaidTheme = theme
  muya.contentState.render(true)
}

// Map a pluggable theme's color/typography values onto the app's CSS variable
// surface (muya core + editor chrome + prism tokens) via a generated <style>.
function applyFileTheme(theme) {
  if (!theme || !theme.colors) return
  currentThemeMeta = theme
  const c = theme.colors
  // Derive translucent editorColor* variants from the base font color.
  // Helper: expand "#rrggbb" (or "rgb(r,g,b)") into rgba with given alpha.
  const toRgba = (color, alpha) => {
    let m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(color)
    if (m) {
      return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
    }
    m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:[^)]*)\)$/.exec(color)
    if (m) {
      return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`
    }
    return color
  }
  const fontBase = c.font || '#222222'
  const css = `
body.theme-file-theme, body.theme-file-theme #ag-editor-id {
  --bg-color: ${c.bg || '#ffffff'};
  --text-color: ${fontBase};
  --editorColor: ${fontBase};
  --themeColor: ${c.primary || c.link || fontBase};
  --editorColor10: ${toRgba(fontBase, 0.1)};
  --editorColor30: ${toRgba(fontBase, 0.3)};
  --editorColor50: ${toRgba(fontBase, 0.5)};
  --editorColor80: ${toRgba(fontBase, 0.8)};
  --editorColor04: ${toRgba(fontBase, 0.04)};
  --floatBgColor: ${c.bg || '#ffffff'};
  --highLightColor: ${toRgba(c.mark || '#ffea8c', 0.45)};
  --highlightColor: ${toRgba(c.mark || '#ffea8c', 0.45)};
  --tableBorderColor: ${toRgba(fontBase, 0.25)};
  --deleteColor: #ff5252;
  --selectionColor: ${toRgba(c.primary || '#7c4dff', 0.25)};
  --editorBgColor: ${c.bg || '#ffffff'};
  --iconColor: ${toRgba(fontBase, 0.6)};
  --code-bg: ${c.codeBg || toRgba(c.bg ? c.bg : '#ffffff', 0.04)};
  --code-border: ${toRgba(fontBase, 0.15)};
  --fm-bg: ${toRgba(c.bg ? c.bg : '#ffffff', 0.02)};
  --fm-border: ${toRgba(fontBase, 0.1)};
}
body.theme-file-theme {
  background-color: ${c.bg || '#ffffff'};
}
body.theme-file-theme #ag-editor-id h1, body.theme-file-theme #ag-editor-id h2,
body.theme-file-theme #ag-editor-id h3, body.theme-file-theme #ag-editor-id h4,
body.theme-file-theme #ag-editor-id h5, body.theme-file-theme #ag-editor-id h6,
body.theme-file-theme #ag-editor-id p.ag-atx-line {
  color: ${c.heading || fontBase};
}
body.theme-file-theme #ag-editor-id a.ag-link-in-bracket, body.theme-file-theme #ag-editor-id a, body.theme-file-theme #ag-editor-id .ag-link {
  color: ${c.link || c.primary || fontBase};
}
body.theme-file-theme #ag-editor-id code.ag-inline-rule {
  color: ${c['inline-code'] || c['code-keyword'] || fontBase};
  background-color: ${c['code-bg'] || 'transparent'};
}
body.theme-file-theme #ag-editor-id blockquote {
  color: ${c.del || fontBase};
  border-left-color: ${toRgba(c.del || fontBase, 0.4)};
}
body.theme-file-theme #ag-editor-id del {
  color: ${c.del || fontBase};
}
body.theme-file-theme #ag-editor-id pre > code {
  color: ${c['code-font'] || fontBase};
  background-color: ${c['code-bg'] || '#f7f7f7'};
}
body.theme-file-theme #ag-editor-id pre span.ag-code-content {
  color: ${c['code-font'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.keyword, body.theme-file-theme #ag-editor-id pre .token.important {
  color: ${c['code-keyword'] || c.primary || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.comment {
  color: ${c['code-comment'] || c.del || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.number {
  color: ${c['code-number'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.string {
  color: ${c['code-string'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.attr-name, body.theme-file-theme #ag-editor-id pre .token.property {
  color: ${c['code-attr'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.selector {
  color: ${c['code-selector'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.operator {
  color: ${c['code-operator'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.function, body.theme-file-theme #ag-editor-id pre .token.function-name {
  color: ${c['code-function'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.variable {
  color: ${c['code-variable'] || fontBase};
}
body.theme-file-theme #ag-editor-id pre .token.punctuation {
  color: ${c['code-punctuation'] || fontBase};
}
body.theme-file-theme {
  font-family: ${(theme.typography && theme.typography['font-family']) || 'var(--font-family)'};
  font-size: ${(theme.typography && theme.typography['font-size']) || '16px'};
  line-height: ${(theme.typography && theme.typography['line-height']) || '1.8'};
}
body.theme-file-theme #ag-editor-id, body.theme-file-theme #ag-editor-id .ag-paragraph-content {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}
`
  // Remove any previously applied file-theme style, then inject the new one.
  document.getElementById('app-theme-style')?.remove()
  const style = document.createElement('style')
  style.id = 'app-theme-style'
  style.textContent = css
  document.head.appendChild(style)
}

async function applyTheme(theme) {
  currentTheme = theme || 'system'
  const isFileTheme = !['light', 'dark', 'system'].includes(currentTheme)
  let dark
  if (isFileTheme) {
    const meta = await window.electronAPI.getThemeContent(currentTheme).catch(() => null)
    dark = !!(meta && meta.dark)
    if (meta) {
      applyFileTheme(meta)
    } else {
      // Theme file deleted/renamed → fall back to system.
      currentTheme = 'system'
      dark = themeMedia.matches
      document.getElementById('app-theme-style')?.remove()
    }
    document.body.classList.toggle('theme-dark', dark)
    document.body.classList.toggle('theme-file-theme', true)
  } else {
    document.getElementById('app-theme-style')?.remove()
    dark = currentTheme === 'dark' || (currentTheme === 'system' && themeMedia.matches)
    document.body.classList.toggle('theme-dark', dark)
    document.body.classList.toggle('theme-file-theme', false)
  }
  syncWindowBackground()
  syncMermaidTheme()
}

async function initTheme() {
  try {
    const settings = await window.electronAPI.getSettings()
    await applyTheme(settings && settings.theme)
    applyFontLayout(settings)
  } catch (e) {
    await applyTheme('system')
  }
  themeMedia.addEventListener('change', () => {
    if (currentTheme === 'system') applyTheme('system')
  })
}

// ===== Font & Layout settings (user-level, override theme typography) =====
// Priority: user settings > file-theme typography > built-in defaults.
// Colors are still driven by the theme; only font-family/size/line-height/width
// are controlled here, so font/layout changes never rebuild the document.
let fontLayoutSettings = null
const FONT_LAYOUT_DEFAULTS = {
  font: { editorFont: 'system', monoFont: 'system', editorSize: 16, codeSize: 14 },
  layout: { lineHeight: 1.8, paragraphGap: '1em', contentWidth: 'standard', headingScale: 1.2 }
}

function applyFontLayout(settings) {
  if (!settings) return
  fontLayoutSettings = {
    font: { ...FONT_LAYOUT_DEFAULTS.font, ...(settings.font || {}) },
    layout: { ...FONT_LAYOUT_DEFAULTS.layout, ...(settings.layout || {}) }
  }
  const f = fontLayoutSettings.font
  const l = fontLayoutSettings.layout

  const widthMap = { narrow: '46rem', standard: '58rem', wide: '72rem', full: '100%' }
  const width = widthMap[l.contentWidth] || widthMap.standard
  const editorFont = f.editorFont === 'system'
    ? '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    : `"${f.editorFont}", -apple-system, "PingFang SC", sans-serif`
  const monoFont = f.monoFont === 'system'
    ? '"SF Mono", Menlo, Monaco, Consolas, monospace'
    : `"${f.monoFont}", Menlo, Monaco, monospace`

  const css = `
#ag-editor-id, #ag-editor-id .ag-paragraph-content {
  font-family: ${editorFont};
  font-size: ${f.editorSize}px;
  line-height: ${l.lineHeight};
}
#ag-editor-id .ag-container-block > pre,
#ag-editor-id .ag-container-block > pre code,
#ag-editor-id pre .ag-code-content,
#ag-editor-id pre .ag-language-input {
  font-family: ${monoFont};
  font-size: ${f.codeSize}px;
}
#ag-editor-id > .ag-paragraph,
#ag-editor-id > .ag-heading,
#ag-editor-id > .ag-container-block {
  max-width: ${width};
  margin-left: auto;
  margin-right: auto;
}
#ag-editor-id > .ag-paragraph + .ag-paragraph,
#ag-editor-id > .ag-heading + .ag-paragraph {
  margin-top: ${l.paragraphGap};
}
#ag-editor-id h1 { font-size: ${(f.editorSize * 2 * l.headingScale).toFixed(1)}px; }
#ag-editor-id h2 { font-size: ${(f.editorSize * 1.5 * l.headingScale).toFixed(1)}px; }
#ag-editor-id h3 { font-size: ${(f.editorSize * 1.17 * l.headingScale).toFixed(1)}px; }
#ag-editor-id h4 { font-size: ${(f.editorSize * l.headingScale).toFixed(1)}px; }
`
  document.getElementById('app-font-layout-style')?.remove()
  const style = document.createElement('style')
  style.id = 'app-font-layout-style'
  style.textContent = css
  document.head.appendChild(style)
}

// Initial update
initTheme()

window.electronAPI.onSettingsChanged(async (settings) => {
  if (settings && settings.theme) applyTheme(settings.theme)
  if (settings && (settings.font || settings.layout)) applyFontLayout(settings)
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
    findCount.innerText = t('find.noResults')
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
      findCount.innerText = t('find.invalidRegex')
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
    findCount.innerText = t('find.noResults')
    findCount.classList.remove('has-results')
  } else {
    findCount.innerText = t('find.count', {
      current: currentMatchIndex + 1,
      total: currentMatches.length
    })
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
if (window.electronAPI) {
  window.electronAPI.onMenuFind(() => {
    showPanel(false)
  })
  window.electronAPI.onMenuReplace(() => {
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

// ==========================================
// Window Controls (macOS traffic lights are native; only zoom + theme bg are JS-driven)
// ==========================================

// Keep the editor's selection/cursor alive when clicking buttons inside Muya's
// floating toolbars. Without this, mousedown on the float collapses the DOM
// selection (and Muya's cursor), so the format tools silently no-op.
// Inputs/links are excluded so they can still receive focus.
document.addEventListener(
  'mousedown',
  (e) => {
    const float = e.target.closest('.ag-float-container')
    if (!float) return
    if (e.target.closest('input, textarea, select, a')) return
    e.preventDefault()
  },
  true
)

// Double-click the drag area to zoom (macOS titlebar behavior)
document.querySelector('#titlebar').addEventListener('dblclick', (e) => {
  if (e.target.closest('button')) return
  window.electronAPI.windowToggleZoom()
})

// Keep the native window background in sync with the app theme (avoids flash while resizing)
function syncWindowBackground() {
  if (currentThemeMeta && currentThemeMeta.colors && currentThemeMeta.colors.bg) {
    window.electronAPI.setWindowBackground(currentThemeMeta.colors.bg)
    return
  }
  const dark = document.body.classList.contains('theme-dark')
  window.electronAPI.setWindowBackground(dark ? '#1a1a1a' : '#ffffff')
}

const sidebarCollapseBtn = document.querySelector('#sidebar-collapse-btn')
if (sidebarCollapseBtn) {
  // Keep editor focus when collapsing via the header button
  sidebarCollapseBtn.addEventListener('mousedown', (e) => e.preventDefault())
  sidebarCollapseBtn.addEventListener('click', toggleSidebar)
}

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

// Reset the editor scroll position to the top after loading a new document.
// The editor container keeps its scrollTop when switching files; a shorter
// new document then shows mid-content instead of the start.
function resetEditorScroll() {
  const ed = document.querySelector('#editor')
  if (ed) {
    ed.scrollTop = 0
  }
}

async function selectFile(filePath) {
  if (activeFilePath === filePath) return

  if (activeFilePath) {
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (err) {
      console.error('Auto-save failed:', err)
    }
  }

  // Files opened from inside an open folder are not recorded in the recent-files
  // list; the folder entry carries the working state instead.
  const inFolderContext = activeFolderPath !== null
  const result = await window.electronAPI.openFileWithPath(filePath, inFolderContext ? false : true)
  if (result.success) {
    await applyFileContent(result, filePath)
    // In-folder file switches update the folder's working state.
    if (inFolderContext) scheduleFolderStateSave()
  } else {
    alert(t('alert.openFailed', { error: result.error || '' }))
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

// Open Folder via the File menu
window.electronAPI.onMenuOpenFolder(() => {
  handleOpenFolder()
})

// Watcher listener for live updates
window.electronAPI.onFolderUpdate((tree) => {
  renderTree(tree)
})

// Rendering functions
function renderTree(tree) {
  if (!tree) {
    sidebarTreeContainer.innerHTML = `
      <div class="empty-state">
        <button id="sidebar-open-folder-cta" data-i18n="sidebar.openFolder">${t('sidebar.openFolder')}</button>
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
    li.innerText = t('tree.emptyDirectory')
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

  // Icon (files only; folders show the chevron arrow alone)
  if (!node.isDir) {
    const iconSpan = document.createElement('span')
    iconSpan.className = 'icon'
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`
    itemDiv.appendChild(iconSpan)
  }

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
      emptyDiv.innerText = t('tree.empty')
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
  input.placeholder = isDir ? t('input.folderName') : t('input.fileName')
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
        alert(result.error || t('alert.createFolderFailed'))
      }
    } else {
      const result = await window.electronAPI.createFile(parentDir, name)
      if (result.success && result.path) {
        await selectFile(result.path)
      } else if (!result.success) {
        alert(result.error || t('alert.createFileFailed'))
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
      ul.innerHTML = `<li style="padding: 10px 20px; opacity: 0.5; font-size: 12px;">${t('tree.emptyDirectory')}</li>`
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
      alert(result.error || t('alert.renameFailed'))
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
      if (confirm(t('confirm.trash', { name }))) {
        const result = await window.electronAPI.trashPath(contextMenuTargetPath)
        if (result.success) {
          if (activeFilePath === contextMenuTargetPath) {
            activeFilePath = null
            muya.markdown = ''
            muya.setMarkdown('')
            resetEditorScroll()
          }
        } else {
          alert(result.error || t('alert.deleteFailed'))
        }
      }
      break
    }
  }
})

// ==========================================
// File Encoding (available in the right-click menu)
// ==========================================

let currentFileEncoding = null

function setCurrentEncoding(encoding) {
  currentFileEncoding = encoding || null
}

// Replaces the right-click menu contents with the encoding picker
function showEncodingMenuInFloat() {
  if (!activeFilePath) return
  menu.innerHTML = ''
  const back = document.createElement('div')
  back.className = 'menu-item'
  back.id = 'menu-back'
  back.textContent = `‹ ${t('floating.back')}`
  menu.appendChild(back)
  const sep = document.createElement('hr')
  sep.style.cssText = 'border: 0; border-top: 1px solid var(--menu-border); margin: 4px 0;'
  menu.appendChild(sep)
  ENCODINGS.forEach((e) => {
    const item = document.createElement('div')
    item.className = 'menu-item'
    item.id = `enc-${e.value}`
    item.dataset.encoding = e.value
    item.textContent = e.label
    if (currentFileEncoding === e.value) item.classList.add('active')
    menu.appendChild(item)
  })
}

async function handleReopenEncoding(encoding) {
  if (!activeFilePath || encoding === currentFileEncoding) return
  if (isDirty && !window.confirm(t('confirm.reopenEncoding'))) return

  const result = await window.electronAPI.reopenWithEncoding(activeFilePath, encoding)
  if (result.success) {
    activeFilePath = result.path
    muya.markdown = result.content
    muya.setMarkdown(result.content)
    resetEditorScroll()
    markSaved(result.content)
    setCurrentEncoding(result.encoding)
    updateActiveFileHighlight()
  } else {
    alert(t('alert.openFailed', { error: result.error || '' }))
  }
}

async function openFolderByPath(dirPath) {
  if (activeFilePath) {
    try {
      await window.electronAPI.saveFileWithPath(activeFilePath, muya.markdown)
    } catch (e) {
      console.error(e)
    }
  }

  const result = await window.electronAPI.openFolderByPath(dirPath)
  if (result.success && result.path) {
    activeFolderPath = result.path
    expandedPaths.add(activeFolderPath)
    if (result.tree) renderTree(result.tree)
    sidebar.classList.remove('collapsed')
    document.body.classList.add('sidebar-open')
    // Restore last working state (file + scroll + cursor + expanded dirs) when
    // opening from Open Recent -> Folders.
    await restoreFolderState(dirPath)
  } else {
    alert(t('alert.openFailed', { error: result.error || '' }))
  }
}

// ===================== Folder working-state save/restore =====================
let folderStateSaveTimer = null

function scheduleFolderStateSave() {
  if (!activeFolderPath) return
  if (folderStateSaveTimer) clearTimeout(folderStateSaveTimer)
  folderStateSaveTimer = setTimeout(saveFolderStateNow, 800)
}

async function saveFolderStateNow() {
  folderStateSaveTimer = null
  if (!activeFolderPath) return
  try {
    const editor = document.querySelector('#editor') || document.querySelector('#ag-editor-id')
    const cursor = muya ? muya.getCursor() : null
    const state = {
      file: activeFilePath,
      scrollTop: editor ? editor.scrollTop : 0,
      cursor: cursor
        ? { anchor: cursor.anchor, focus: cursor.focus }
        : null,
      expanded: [...expandedPaths].filter((p) => p !== activeFolderPath)
    }
    await window.electronAPI.saveFolderState(activeFolderPath, state)
  } catch (err) {
    console.error('Failed to save folder state:', err)
  }
}

async function restoreFolderState(dirPath) {
  try {
    const { state } = await window.electronAPI.getFolderState(dirPath)
    if (!state) return

    // Restore expanded directories
    if (Array.isArray(state.expanded)) {
      for (const p of state.expanded) expandedPaths.add(p)
    }
    // Refresh tree with restored expansions
    const treeResult = await window.electronAPI.getFolderTree(dirPath)
    if (treeResult.success) renderTree(treeResult.tree)

    // Restore last file
    if (state.file) {
      const probe = await window.electronAPI.openFileWithPath(state.file, false)
      if (probe.success && probe.path) {
        // selectFile would re-read the file; use the probed content to avoid a
        // second read and to skip history recording.
        await applyFileContent(probe, state.file)
        // Restore scroll & cursor after render settles
        const editor = document.querySelector('#editor') || document.querySelector('#ag-editor-id')
        setTimeout(() => {
          if (editor && typeof state.scrollTop === 'number') editor.scrollTop = state.scrollTop
          if (muya && state.cursor) {
            try {
              muya.setCursor(state.cursor)
            } catch (e) {
              console.error('Failed to restore cursor:', e)
            }
          }
        }, 120)
      }
    }
  } catch (err) {
    console.error('Failed to restore folder state:', err)
  }
}

async function applyFileContent(result, filePath) {
  if (result.success && result.path) {
    activeFilePath = filePath
    muya.markdown = result.content
    muya.setMarkdown(result.content)
    resetEditorScroll()
    markSaved(result.content)
    setCurrentEncoding(result.encoding)
    updateActiveFileHighlight()
  }
}

// ==========================================
// New Menu / Language IPC Listeners
// ==========================================

window.electronAPI.onMenuOpenRecent((filePath) => {
  // Opening from Open Recent is a standalone open: always record it in the
  // recent-files group regardless of an open folder context.
  openRecentFile(filePath)
})

async function openRecentFile(filePath) {
  const result = await window.electronAPI.openFileWithPath(filePath, true)
  if (result.success && result.path) {
    // Recent-file open is standalone: persist folder state first, then exit.
    await leaveFolderContext()
    await applyFileContent(result, filePath)
  } else {
    alert(t('alert.openFailed', { error: result.error || '' }))
  }
}

window.electronAPI.onMenuOpenRecentFolder((dirPath) => {
  openFolderByPath(dirPath)
})

// Capture folder working state (scroll / cursor / expanded) while a folder
// context is active. Debounced so normal editing does not write to disk often.
const editorScrollEl = document.querySelector('#editor') || document.querySelector('#main-content')
if (editorScrollEl) {
  editorScrollEl.addEventListener('scroll', () => {
    if (activeFolderPath) scheduleFolderStateSave()
  }, { passive: true })
}
document.addEventListener('selectionchange', () => {
  if (activeFolderPath) scheduleFolderStateSave()
})
const expandObserver = new MutationObserver(() => {
  if (activeFolderPath) scheduleFolderStateSave()
})
const treeContainer = document.querySelector('#sidebar-tree')
if (treeContainer) {
  expandObserver.observe(treeContainer, { subtree: true, childList: true })
}

window.electronAPI.onMenuReopenEncoding((encoding) => {
  handleReopenEncoding(encoding)
})

window.electronAPI.onLanguageChanged((lang) => {
  currentLang = lang
  applyI18n()
  if (muya && muya.frontMenu && typeof muya.frontMenu.setLanguage === 'function') {
    muya.frontMenu.setLanguage(t)
  }
  if (typeof findReplacePanel !== 'undefined' && findReplacePanel && !findReplacePanel.classList.contains('hidden')) {
    updateCountDisplay()
  }
})

// ==========================================
// Initialize
// ==========================================

renderTree(null)

;(async function initApp() {
  try {
    const lang = await window.electronAPI.getLanguage()
    if (lang) currentLang = lang
  } catch (e) {
    console.error('Failed to load language:', e)
  }
  applyI18n()
  if (muya && muya.frontMenu && typeof muya.frontMenu.setLanguage === 'function') {
    muya.frontMenu.setLanguage(t)
  }
  markSaved(muya.markdown)
})()
