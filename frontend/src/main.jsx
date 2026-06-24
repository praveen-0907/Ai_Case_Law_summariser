// src/main.jsx
// This is the entry point of our React application.
// It connects our React app to the HTML div with id="root" in index.html

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // Import Tailwind CSS styles

// ReactDOM.createRoot finds our <div id="root"> and renders the App inside it
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* StrictMode helps catch common bugs during development */}
    <App />
  </React.StrictMode>,
)
