import { Link, useRouterState } from '@tanstack/react-router'
import { ArrowRight, Mic } from 'lucide-react'

export default function Navbar() {
  const pathname = useRouterState({ select: (state: { location: { pathname: string } }) => state.location.pathname })

  const navLinkClass = (path: string) =>
    `shrink-0 rounded-xl px-3 py-1.5 text-sm transition-colors ${
      pathname === path || pathname.startsWith(path + '/')
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
    }`

  return (
    <header className="sticky top-0 z-10 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-4 sm:py-0">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Mic className="h-4.5 w-4.5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-foreground">会议助手智能体</div>
          </div>
        </Link>

        <nav className="ml-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/30 p-1 whitespace-nowrap">
          <Link to="/" className={navLinkClass('/')}>
            首页
          </Link>
          <Link to="/settings" className={navLinkClass('/settings')}>
            设置
          </Link>
        </nav>
      </div>
    </header>
  )
}
