// src/App.jsx
export default function App() {
  const handleResize = (mode) => {
    window.electronAPI.resizeWindow(mode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 gap-4">
      <h1 className="text-2xl font-bold">Notes App (Electron + React)</h1>

      <div className="flex gap-4">
        <button
          onClick={() => handleResize("compact")}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          Compact Mode
        </button>
        <button
          onClick={() => handleResize("expanded")}
          className="px-4 py-2 bg-green-500 text-white rounded-lg"
        >
          Expanded Mode
        </button>
      </div>
    </div>
  );
}
