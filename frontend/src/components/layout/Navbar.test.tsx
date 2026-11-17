import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import Navbar from './Navbar'

const pathnameState = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a data-to={to} className={className}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: pathnameState.pathname } }),
}))

describe('Navbar', () => {
  it('renders navigation links', () => {
    pathnameState.pathname = '/'

    render(<Navbar />)

    expect(screen.getByText('会议列表')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
  })
})
