export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-400">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="text-lg font-semibold text-blue-300">
            Sorstar
          </div>
          <div className="text-sm">
            &copy; {new Date().getFullYear()} Sorstar. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
