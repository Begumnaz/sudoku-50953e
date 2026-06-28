import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sudoku',
  description: 'Classic 9×9 Sudoku — generate, play, and peek!',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
