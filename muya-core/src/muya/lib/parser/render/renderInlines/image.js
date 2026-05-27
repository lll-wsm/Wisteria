import { CLASS_OR_ID } from '../../../config'
import { getImageInfo } from '../../../utils'
import ImageIcon from '../../../assets/pngicon/image/2.png'
import ImageFailIcon from '../../../assets/pngicon/image_fail/2.png'
import DeleteIcon from '../../../assets/pngicon/delete/2.png'

const renderIcon = (h, className, icon) => {
  const selector = `span.${className}`
  const iconVnode = h(
    'i.icon',
    h(
      'i.icon-inner',
      {
        style: {
          background: `url(${icon}) no-repeat`,
          'background-size': '100%'
        }
      },
      ''
    )
  )

  return h(
    selector,
    {
      attrs: {
        contenteditable: 'false'
      }
    },
    iconVnode
  )
}

// I dont want operate dom directly, is there any better method? need help!
export default function image(h, cursor, block, token, outerClass) {
  const imageInfo = getImageInfo(token.attrs.src)
  const { selectedImage } = this.muya.contentState
  const data = {
    dataset: {
      raw: token.raw
    }
  }
  let id
  let isSuccess
  let domsrc
  let { src } = imageInfo
  const alt = token.attrs.alt
  const title = token.attrs.title
  const width = token.attrs.width
  const height = token.attrs.height
  src = src.replace(/ /g, '%20') // Automatically replaces spaces with %20 to avoid parsing errors when exporting.

  if (src) {
    ;({ id, isSuccess, domsrc } = this.loadImageAsync(imageInfo, token.attrs))
  }

  let wrapperSelector = id
    ? `span#${isSuccess ? block.key + '_' + id + '_' + token.range.start : id}.${CLASS_OR_ID.AG_INLINE_IMAGE}`
    : `span.${CLASS_OR_ID.AG_INLINE_IMAGE}`

  const imageIcons = [
    renderIcon(h, 'ag-image-icon-success', ImageIcon),
    renderIcon(h, 'ag-image-icon-fail', ImageFailIcon),
    renderIcon(h, 'ag-image-icon-close', DeleteIcon)
  ]

  const renderImageContainer = (...args) => {
    const data = {}
    if (title) {
      Object.assign(data, {
        dataset: { title }
      })
    }
    return h(`span.${CLASS_OR_ID.AG_IMAGE_CONTAINER}`, data, args)
  }

  if (typeof token.attrs['data-align'] === 'string') {
    wrapperSelector += `.${token.attrs['data-align']}`
  }

  // the src image is still loading, so use the url Map base64.
  if (this.urlMap.has(src)) {
    // fix: it will generate a new id if the image is not loaded.
    const { selectedImage } = this.muya.contentState
    if (selectedImage && selectedImage.token.attrs.src === src && selectedImage.imageId !== id) {
      selectedImage.imageId = id
    }
    src = this.urlMap.get(src)
    isSuccess = true
  }

  if (alt.startsWith('loading-')) {
    wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_UPLOADING}`
    Object.assign(data.dataset, {
      id: alt
    })
    if (this.urlMap.has(alt)) {
      src = this.urlMap.get(alt)
      isSuccess = true
    }
  }

  if (src) {
    // image is loading...
    if (typeof isSuccess === 'undefined') {
      wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_LOADING}`
    } else if (isSuccess === true) {
      wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_SUCCESS}`
    } else {
      wrapperSelector += `.${CLASS_OR_ID.AG_IMAGE_FAIL}`
    }

    // Add image selected class name.
    if (selectedImage) {
      const { key, token: selectToken } = selectedImage
      if (
        key === block.key &&
        selectToken.range.start === token.range.start &&
        selectToken.range.end === token.range.end
      ) {
        wrapperSelector += `.${CLASS_OR_ID.AG_INLINE_IMAGE_SELECTED}`
      }
    }

    const renderImage = () => {
      const data = {
        props: { alt: alt.replace(/[`*{}[\]()#+\-.!_>~:|<>$]/g, ''), src: domsrc, title }
      }

      if (typeof width === 'number') {
        Object.assign(data.props, { width })
      }

      if (typeof height === 'number') {
        Object.assign(data.props, { height })
      }

      return h('img', data)
    }

    return isSuccess
      ? [
        h(wrapperSelector, data, [
          ...imageIcons,
          renderImageContainer(
              // An image description has inline elements as its contents.
              // When an image is rendered to HTML, this is standardly used as the image’s alt attribute.
            renderImage()
          )
        ])
      ]
      : [h(wrapperSelector, data, [...imageIcons, renderImageContainer()])]
  } else {
    const className = this.getClassName(outerClass, block, token, cursor)
    const { start, end } = token.range
    const altStart = start + 2
    const altEnd = altStart + token.alt.length + (token.backlash?.first?.length || 0)
    const srcStart = altEnd + 2
    const srcEnd = end - 1

    const firstBracket = h('span.ag-image-inline-marker', { attrs: { contenteditable: 'false' } }, '![')
    const middleBracket = h('span.ag-image-inline-marker', { attrs: { contenteditable: 'false' } }, '](')
    const lastBracket = h('span.ag-image-inline-marker', { attrs: { contenteditable: 'false' } }, ')')

    const altContent = altStart === altEnd
      ? [h('span.ag-image-placeholder-alt', {
          attrs: { 'data-placeholder': '输入名称', contenteditable: 'true' },
          on: {
            click: (event) => {
              event.preventDefault()
              event.stopPropagation()
              this.muya.contentState.cursor = {
                start: { key: block.key, offset: altStart },
                end: { key: block.key, offset: altStart }
              }
              this.muya.contentState.singleRender(block)
            }
          }
        }, '')]
      : this.highlight(h, block, altStart, altEnd, token)

    const srcContent = srcStart === srcEnd
      ? [h('span.ag-image-placeholder-src', {
          attrs: { 'data-placeholder': '输入图片路径', contenteditable: 'true' },
          on: {
            click: (event) => {
              event.preventDefault()
              event.stopPropagation()
              this.muya.contentState.cursor = {
                start: { key: block.key, offset: srcStart },
                end: { key: block.key, offset: srcStart }
              }
              this.muya.contentState.singleRender(block)
            }
          }
        }, '')]
      : this.highlight(h, block, srcStart, srcEnd, token)

    const handlePick = (newSrc) => {
      this.muya.contentState.replaceImage({ key: block.key, token }, {
        alt: token.attrs.alt || '',
        src: newSrc,
        title: token.attrs.title || ''
      })
    }

    const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI__)
    const inputId = `file-input-${block.key}-${token.range.start}`

    const fileIcon = h('span.ag-image-file-icon', {
      attrs: {
        contenteditable: 'false',
        title: '选择本地图片'
      },
      on: {
        click: async (event) => {
          event.preventDefault()
          event.stopPropagation()

          if (this.muya.options.imagePathPicker) {
            try {
              const path = await this.muya.options.imagePathPicker()
              if (path) {
                handlePick(path)
              }
            } catch (err) {
              console.error('Tauri imagePathPicker error:', err)
            }
          } else {
            // Web fallback: trigger hidden input
            const input = document.getElementById(inputId)
            if (input) {
              input.click()
            }
          }
        }
      }
    }, [
      // SVG folder icon
      h('svg', {
        attrs: {
          viewBox: '0 0 24 24',
          width: '14',
          height: '14',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        }
      }, [
        h('path', { attrs: { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' } })
      ])
    ])

    const hiddenInput = h('input', {
      attrs: {
        type: 'file',
        accept: 'image/*',
        id: inputId,
        style: 'display: none;',
        contenteditable: 'false'
      },
      on: {
        change: (e) => {
          const file = e.target.files[0]
          if (file) {
            const url = URL.createObjectURL(file)
            handlePick(url)
          }
        }
      }
    })

    wrapperSelector += `.${CLASS_OR_ID.AG_EMPTY_IMAGE}`
    
    const data = {
      dataset: {
        raw: token.raw
      }
    }

    return [
      h(wrapperSelector, data, [
        firstBracket,
        ...altContent,
        middleBracket,
        ...srcContent,
        fileIcon,
        hiddenInput,
        lastBracket
      ])
    ]
  }
}
