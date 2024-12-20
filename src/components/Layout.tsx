import { ReactNode } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      <div className="w-full">
        <Navbar />
      </div>
      
      <main className="flex-grow flex justify-center w-full px-4 py-8">
        <div className="w-full max-w-6xl">
          {children}
        </div>
      </main>
      
      <div className="w-full">
        <Footer />
      </div>
    </div>
  )
}
