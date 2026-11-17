import { createRouter, createRoute, createRootRoute, Outlet, useRouterState, Navigate } from '@tanstack/react-router'
import { createElement } from 'react'
import Navbar from '@/components/layout/Navbar'
import RecordUploadPage from '@/pages/RecordUpload'
import RealtimeMeetingPage from '@/pages/realtime-meeting'
import MeetingsPage from '@/pages/meetings'
import MeetingDetailPage from '@/pages/meeting-detail'
import SettingsPage from '@/pages/settings'
import { isAppEntryPath } from '@/lib/app-entry'

export function resolveRouterBasepath(baseUrl: string) {
  if (baseUrl === '/') {
    return '/'
  }
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function AppChrome() {
  const pathname = useRouterState({ select: (state: { location: { pathname: string } }) => state.location.pathname })
  const appEntry = isAppEntryPath(pathname)

  if (appEntry) {
    return createElement(
      'div',
      { className: 'min-h-screen bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]' },
      createElement(Outlet, null),
    )
  }

  return createElement(
    'div',
    { className: 'flex flex-col h-screen bg-background' },
    createElement(Navbar, null),
    createElement(
      'main',
      { className: 'flex-1 overflow-hidden' },
      createElement(Outlet, null),
    ),
  )
}

const rootRoute = createRootRoute({
  component: AppChrome,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => createElement(Navigate, { to: '/meetings' }),
})

const appIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: () => createElement(Navigate, { to: '/app/meetings' }),
})

const recordUploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/record-upload',
  component: RecordUploadPage,
})

const appRecordUploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/record-upload',
  component: () => createElement(RecordUploadPage, { compact: true }),
})

const realtimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/realtime',
  component: RealtimeMeetingPage,
})

const meetingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meetings',
  component: MeetingsPage,
})

const appMeetingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/meetings',
  component: MeetingsPage,
})

const meetingDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meetings/$meetingId',
  component: MeetingDetailPage,
})

const appMeetingDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/meetings/$meetingId',
  component: MeetingDetailPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const appSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings',
  component: SettingsPage,
})

const routeTree = (rootRoute as typeof rootRoute & { addChildren: (children: unknown[]) => unknown }).addChildren([
  indexRoute,
  appIndexRoute,
  recordUploadRoute,
  appRecordUploadRoute,
  realtimeRoute,
  meetingsRoute,
  appMeetingsRoute,
  meetingDetailRoute,
  appMeetingDetailRoute,
  settingsRoute,
  appSettingsRoute,
])

export const router = createRouter({
  routeTree,
  basepath: resolveRouterBasepath((import.meta.env.BASE_URL as string) || '/'),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
