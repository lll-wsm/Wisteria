export const fileURLToPath = (url) => {
  if (typeof url !== 'string') return url
  if (url.startsWith('file://')) {
    return url.substring(7)
  }
  return url
}

export default {
  fileURLToPath
}
