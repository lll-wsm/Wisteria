import { createPopper } from '@popperjs/core'
import resizeDetector from 'element-resize-detector'
import { noop } from '../../utils'
import { EVENT_KEYS } from '../../config'
import './index.css'

const defaultOptions = () => ({
  placement: 'bottom-start',
  modifiers: {
    offset: {
      offset: '0, 12'
    }
  },
  showArrow: true
})

class BaseFloat {
  constructor(muya, name, options = {}) {
    this.name = name
    this.muya = muya
    this.options = Object.assign({}, defaultOptions(), options)
    
    // Normalize modifiers for Popper v2 compatibility (object to array of objects)
    if (this.options.modifiers && !Array.isArray(this.options.modifiers)) {
      const normalized = []
      if (this.options.modifiers.offset) {
        let offsetVal = [0, 12] // Default offset skidding, distance
        const rawOffset = this.options.modifiers.offset.offset
        if (typeof rawOffset === 'string') {
          offsetVal = rawOffset.split(',').map(s => parseInt(s.trim(), 10))
        } else if (Array.isArray(rawOffset)) {
          offsetVal = rawOffset
        }
        normalized.push({
          name: 'offset',
          options: {
            offset: offsetVal
          }
        })
      }
      this.options.modifiers = normalized
    }

    this.status = false
    this.floatBox = null
    this.container = null
    this.popper = null
    this.lastScrollTop = null
    this.resizeDetector = null
    this.cb = noop
    this.init()
  }

  init() {
    const { showArrow } = this.options
    const floatBox = document.createElement('div')
    const container = document.createElement('div')
    // Use to remember whick float container is shown.
    container.classList.add(this.name)
    container.classList.add('ag-float-container')
    floatBox.classList.add('ag-float-wrapper')

    if (showArrow) {
      const arrow = document.createElement('div')
      arrow.setAttribute('x-arrow', '')
      arrow.classList.add('ag-popper-arrow')
      floatBox.appendChild(arrow)
    }

    floatBox.appendChild(container)
    document.body.appendChild(floatBox)
    this.resizeDetector = resizeDetector({
      strategy: 'scroll'
    })

    // use polyfill
    this.resizeDetector.listenTo(container, (ele) => {
      const { offsetWidth, offsetHeight } = ele
      Object.assign(floatBox.style, { width: `${offsetWidth}px`, height: `${offsetHeight}px` })
      this.popper && this.popper.update()
    })

    this.floatBox = floatBox
    this.container = container
  }

  listen() {
    const { eventCenter, container } = this.muya
    const { floatBox } = this
    const keydownHandler = (event) => {
      if (event.key === EVENT_KEYS.Escape) {
        this.hide()
      }
    }
    const scrollHandler = (event) => {
      if (typeof this.lastScrollTop !== 'number') {
        this.lastScrollTop = event.target.scrollTop
        return
      }
      // only when scoll distance great than 50px, then hide the float box.
      if (this.status && Math.abs(event.target.scrollTop - this.lastScrollTop) > 50) {
        this.hide()
      }
    }

    eventCenter.attachDOMEvent(document, 'click', this.hide.bind(this))
    eventCenter.attachDOMEvent(floatBox, 'click', (event) => {
      event.stopPropagation()
      event.preventDefault()
    })
    eventCenter.attachDOMEvent(container, 'keydown', keydownHandler)
    eventCenter.attachDOMEvent(container, 'scroll', scrollHandler)
  }

  hide() {
    const { eventCenter } = this.muya
    if (!this.status) return
    this.status = false
    if (this.popper && this.popper.destroy) {
      this.popper.destroy()
    }
    this.cb = noop
    this.floatBox.removeAttribute('data-popper-placement')
    this.floatBox.style.opacity = ''
    this.floatBox.style.right = ''
    this.floatBox.style.top = ''
    this.floatBox.style.left = ''
    this.floatBox.style.transform = ''
    eventCenter.dispatch('muya-float', this, false)
    this.lastScrollTop = null
  }

  show(reference, cb = noop) {
    const { floatBox } = this
    const { eventCenter } = this.muya
    const { placement, modifiers } = this.options

    if (this.popper && this.popper.destroy) {
      this.popper.destroy()
    }
    this.cb = cb

    let popperOk = false
    try {
      this.popper = createPopper(reference, floatBox, {
        placement,
        modifiers
      })
      popperOk = true
    } catch (e) {
      this.popper = null
    }

    this.status = true
    floatBox.style.opacity = '1'
    floatBox.style.right = 'auto'

    // Force popper to update synchronously if possible
    if (this.popper && popperOk) {
      try {
        this.popper.forceUpdate()
      } catch (e) {
        console.error('Popper forceUpdate failed:', e)
      }
    }

    // Fallback positioning if Popper failed or is missing critical attributes
    if (!popperOk || !floatBox.hasAttribute('data-popper-placement')) {
      this.positionFallback(reference, placement)
    }

    eventCenter.dispatch('muya-float', this, true)
  }

  positionFallback(reference, placement) {
    const { floatBox } = this
    if (!reference || !floatBox) return

    const refRect = reference.getBoundingClientRect()
    const fbRect = floatBox.getBoundingClientRect()
    const offset = 12

    let top = refRect.bottom + offset
    let left = refRect.left

    if (placement && placement.startsWith('top')) {
      top = refRect.top - fbRect.height - offset
    }
    if (placement && placement.includes('-end')) {
      left = refRect.right - fbRect.width
    }

    floatBox.style.top = `${top}px`
    floatBox.style.left = `${left}px`
    floatBox.setAttribute('data-popper-placement', placement || 'bottom-start')
  }
}

export default BaseFloat
