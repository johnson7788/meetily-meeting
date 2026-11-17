import { describe, expect, it } from 'vitest'

import { resolveRouterBasepath } from './router'

describe('resolveRouterBasepath', () => {
  it('maps the dev base url to a router basepath', () => {
    expect(resolveRouterBasepath('/dev/')).toBe('/dev')
  })

  it('keeps the root base url unchanged', () => {
    expect(resolveRouterBasepath('/')).toBe('/')
  })
})
