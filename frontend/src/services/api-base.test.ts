import { describe, expect, it } from 'vitest'

import { resolveApiBase, resolveWebSocketUrl } from './api-base'

describe('resolveApiBase', () => {
  it('uses the explicit api base when provided', () => {
    expect(resolveApiBase('https://ai.infox-med.com:10443/dev/meetings', 'https://api.example.com')).toBe(
      'https://api.example.com',
    )
  })

  it('maps the dev entry to the prefixed backend path', () => {
    expect(resolveApiBase('https://ai.infox-med.com:10443/dev/meetings')).toBe(
      'https://ai.infox-med.com:10443/dev',
    )
  })

  it('keeps localhost development pointing to the local backend', () => {
    expect(resolveApiBase('http://localhost:4173/meetings')).toBe('http://localhost:5167')
  })

  it('uses the same-origin root path for the production site', () => {
    expect(resolveApiBase('https://ai.infox-med.com:10443/meetings')).toBe(
      'https://ai.infox-med.com:10443',
    )
  })
})

describe('resolveWebSocketUrl', () => {
  it('builds a prefixed websocket url from the resolved api base', () => {
    expect(resolveWebSocketUrl('https://ai.infox-med.com:10443/dev', '/ws/record')).toBe(
      'wss://ai.infox-med.com:10443/dev/ws/record',
    )
  })
})
