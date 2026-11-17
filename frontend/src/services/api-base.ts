export function resolveApiBase(currentUrl: string, explicitApiBase?: string) {
  if (explicitApiBase) {
    return explicitApiBase
  }

  const url = new URL(currentUrl)
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return 'http://localhost:5167'
  }

  const prefix = url.pathname.startsWith('/dev/') || url.pathname === '/dev' ? '/dev' : ''
  return `${url.origin}${prefix}`
}

export function resolveWebSocketUrl(apiBase: string, path: string) {
  const target = new URL(apiBase)
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = target.pathname.replace(/\/+$/, '')
  target.pathname = `${basePath}${path}`.replace(/\/{2,}/g, '/')
  target.search = ''
  target.hash = ''
  return target.toString()
}
