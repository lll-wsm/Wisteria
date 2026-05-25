import Muya from './muya/lib/index.js'
import './muya/lib/assets/styles/index.css'

const container = document.querySelector('#editor')
const muya = new Muya(container, {
  markdown: '# Hello Muya\n\nThis is a standalone Muya editor core.'
})

muya.on('change', (changes) => {
  console.log('Markdown changed:', changes.markdown)
})

console.log('Muya initialized:', muya)
