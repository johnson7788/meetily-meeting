/// <reference types="vitest/config" />
import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

type TestableUserConfig = UserConfig & {
  test: {
    environment: string
    setupFiles: string
  }
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
} as TestableUserConfig)
