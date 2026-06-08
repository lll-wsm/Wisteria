import selection from '../selection'

const deleteCtrl = (ContentState) => {
  // Handle `delete` keydown event on document.
  ContentState.prototype.docDeleteHandler = function(event) {
    // handle delete selected image
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      this.selectedImage = null
      return this.deleteImage(selectedImage)
    }
    if (this.selectedTableCells) {
      event.preventDefault()
      return this.deleteSelectedTableCells()
    }
  }

  ContentState.prototype.deleteHandler = function(event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) {
      return
    }
    const startBlock = this.getBlock(start.key)
    const nextBlock = this.findNextBlockInLocation(startBlock)

    if (start.key !== end.key) {
      event.preventDefault()
      const endBlock = this.getBlock(end.key)
      
      startBlock.text = startBlock.text.substring(0, start.offset) + endBlock.text.substring(end.offset)
      this.removeBlocks(startBlock, endBlock)
      
      this.cursor = {
        start: { key: start.key, offset: start.offset },
        end: { key: start.key, offset: start.offset },
        isEdit: true
      }
      this.checkInlineUpdate(startBlock)
      this.partialRender()
      this.muya.dispatchChange()
      return
    }

    // TODO: @jocs It will delete all the editor and cause error in console when there is only one empty table. same as #67
    if (startBlock.type === 'figure') event.preventDefault()
    // If select multiple paragraph or multiple characters in one paragraph, just let
    // updateCtrl to handle this case.
    if (start.key !== end.key || start.offset !== end.offset) {
      return
    }

    // Intercept delete in code block fences/inputs to prevent DOM corruption
    if (startBlock.type === 'span' && startBlock.key === endBlock.key && start.offset === end.offset) {
      const { functionType } = startBlock
      
      if (functionType === 'topFence' && start.offset === startBlock.text.length) {
        event.preventDefault()
        event.stopPropagation()
        const preBlock = this.getParent(startBlock)
        const langInputBlock = preBlock.children.find(c => c.functionType === 'languageInput')
        if (langInputBlock && langInputBlock.text.length > 0) {
          langInputBlock.text = langInputBlock.text.substring(1)
          preBlock.lang = langInputBlock.text
          const codeBlock = preBlock.children.find(c => c.type === 'code')
          if (codeBlock) {
            codeBlock.lang = langInputBlock.text
            codeBlock.children.forEach(c => (c.lang = langInputBlock.text))
          }
          this.partialRender()
        }
        return
      }

      if (functionType === 'languageInput' && start.offset === startBlock.text.length) {
        event.preventDefault()
        event.stopPropagation()
        const preBlock = this.getParent(startBlock)
        const codeBlock = preBlock.children.find(c => c.type === 'code')
        if (codeBlock) {
          const codeContent = codeBlock.children[0]
          const key = codeContent.key
          const offset = 0
          this.cursor = {
            start: { key, offset },
            end: { key, offset },
            isEdit: true
          }
          this.partialRender()
        }
        return
      }

      if (functionType === 'codeContent' && start.offset === startBlock.text.length) {
        event.preventDefault()
        event.stopPropagation()
        const codeBlock = this.getParent(startBlock)
        const preBlock = this.getParent(codeBlock)
        const bottomFenceBlock = preBlock.children.find(c => c.functionType === 'bottomFence')
        if (bottomFenceBlock) {
          const key = bottomFenceBlock.key
          const offset = 0
          this.cursor = {
            start: { key, offset },
            end: { key, offset },
            isEdit: true
          }
          this.partialRender()
        }
        return
      }

      if (functionType === 'bottomFence' && start.offset === startBlock.text.length) {
        event.preventDefault()
        event.stopPropagation()
        const nextBlock = this.findNextBlockInLocation(startBlock)
        if (nextBlock) {
          const key = nextBlock.key
          const offset = 0
          this.cursor = {
            start: { key, offset },
            end: { key, offset },
            isEdit: true
          }
          this.partialRender()
        }
        return
      }
    }
    // Only handle h1~h6 span block
    const { type, text, key } = startBlock
    if (/span/.test(type) && start.offset === 0 && text[1] === '\n') {
      event.preventDefault()
      startBlock.text = text.substring(2)
      this.cursor = {
        start: { key, offset: 0 },
        end: { key, offset: 0 },
        isEdit: true
      }
      return this.singleRender(startBlock)
    }
    if (/h\d|span/.test(type) && start.offset === text.length) {
      event.preventDefault()
      if (nextBlock && /h\d|span/.test(nextBlock.type)) {
        // if cursor at the end of code block-language input, do nothing!
        if (
          nextBlock.functionType === 'codeContent' &&
          startBlock.functionType === 'languageInput'
        ) {
          return
        }

        startBlock.text += nextBlock.text

        const toBeRemoved = [nextBlock]

        let parent = this.getParent(nextBlock)
        let target = nextBlock

        while (this.isOnlyRemoveableChild(target)) {
          toBeRemoved.push(parent)
          target = parent
          parent = this.getParent(parent)
        }

        toBeRemoved.forEach((b) => {
          // Check if the parent is a list
          const parent = this.getParent(b)

          // ============= LIST HANDLING=============
          if (parent && parent.type === 'li') {
            // We need to move any sublists to outside of the list item
            const ulBlock = this.getParent(parent)
            let insertAfterThis = ulBlock

            // Move any sublists out
            parent.children.forEach((child) => {
              if (/ul|ol/.test(child.type)) {
                this.insertAfter(child, insertAfterThis)
                insertAfterThis = child
              }
            })

            // Move any subsequent list items out
            let probe = this.getBlock(parent.nextSibling)
            const listItemToBeSaved = []
            while (probe && probe.type === 'li') {
              listItemToBeSaved.push(probe)
              probe = this.getBlock(probe.nextSibling)
            }
            if (listItemToBeSaved.length > 0) {
              const newULBlock = this.createBlock('ul')
              listItemToBeSaved.forEach((li) => {
                this.appendChild(newULBlock, li)
              })
              this.insertAfter(newULBlock, insertAfterThis)
            }

            // Then delete the parent ul block from the list
            this.removeBlock(ulBlock)
          } else {
            this.removeBlock(b)
          }
        })

        const offset = start.offset
        this.cursor = {
          start: { key, offset },
          end: { key, offset },
          isEdit: true
        }
        this.render()
      }
    }
  }
}

export default deleteCtrl
