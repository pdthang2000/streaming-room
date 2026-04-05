import './global.css'

export const metadata = {
  title: 'ListenRoom',
  description: 'A shared listening room for friends',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
