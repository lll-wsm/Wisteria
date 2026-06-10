import { getLinkInfo } from '../utils/getLinkInfo'
import { collectFootnotes } from '../utils'
import { CLASS_OR_ID } from '../config'

class MouseEvent {
  constructor(muya) {
    this.muya = muya
    this.mouseBinding()
    this.mouseDown()
  }

  mouseBinding() {
    const { container, eventCenter } = this.muya
    const handler = (event) => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const parentPreSibling = parent ? parent.previousElementSibling : null
      const { hideLinkPopup, footnote } = this.muya.options
      const rect = parent.getBoundingClientRect()
      const reference = {
        getBoundingClientRect() {
          return rect
        }
      }

      if (
        !hideLinkPopup &&
        parent &&
        parent.tagName === 'A' &&
        parent.classList.contains('ag-inline-rule') &&
        parentPreSibling &&
        parentPreSibling.classList.contains('ag-hide')
      ) {
        eventCenter.dispatch('muya-link-tools', {
          reference,
          linkInfo: getLinkInfo(parent)
        })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        const identifier = target.textContent
        eventCenter.dispatch('muya-footnote-tool', {
          reference,
          identifier,
          footnotes: collectFootnotes(this.muya.contentState.blocks)
        })
      }
    }
    const leaveHandler = (event) => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const { footnote } = this.muya.options
      if (parent && parent.tagName === 'A' && parent.classList.contains('ag-inline-rule')) {
        eventCenter.dispatch('muya-link-tools', {
          reference: null
        })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        eventCenter.dispatch('muya-footnote-tool', {
          reference: null
        })
      }
    }

    eventCenter.attachDOMEvent(container, 'mouseover', handler)
    eventCenter.attachDOMEvent(container, 'mouseout', leaveHandler)
  }

  mouseDown() {
    // Handles mouseDown event for tables and checkboxes
    const { container, eventCenter, contentState } = this.muya
    const handler = (event) => {
      const target = event.target
      if (target.closest('.ag-html-preview')) {
        // short-circuit on html since we do not support html operations on it
        return
      }

      // handler to-do checkbox mousedown to prevent focus loss/caret shifts
      if (
        target.tagName === 'INPUT' &&
        target.classList.contains(CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX)
      ) {
        event.preventDefault()
        event.stopPropagation()
        contentState.listItemCheckBoxClick(target)
        return
      }

      // Prevent default mousedown on any element inside an inline image wrapper
      // to prevent browser selection (purple highlight). This covers <img>, .ag-image-container,
      // icons, and any other children within .ag-inline-image.
      if (
        event.button === 0 &&
        target.closest('.ag-inline-image')
      ) {
        event.preventDefault()
        return
      }

      if (target.classList && target.classList.contains('ag-drag-handler')) {
        contentState.handleMouseDown(event)
      } else if (target && target.closest('tr')) {
        contentState.handleCellMouseDown(event)
      }
    }
    eventCenter.attachDOMEvent(container, 'mousedown', handler)
  }
}

export default MouseEvent
