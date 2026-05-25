import pako from 'pako'

export const deflateSync = (data, options) => {
  return pako.deflate(data, options)
}

export default {
  deflateSync
}
