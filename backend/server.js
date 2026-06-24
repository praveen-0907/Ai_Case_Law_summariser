require('dotenv').config()

// Import required packages
const express = require('express')  // Web framework for Node.js
const cors = require('cors')        // Allows our React frontend to talk to this server

// Import our route files
// Each route file handles a specific group of API endpoints
const uploadRoutes = require('./src/routes/upload')
const reportRoutes = require('./src/routes/report')
const analyseRoutes = require('./src/routes/analyse')
const compareRoutes = require('./src/routes/compare')

// Create an Express application
const app = express()

// Define which port the server should listen on
// process.env.PORT checks .env first, falls back to 5000 if not set
const PORT = process.env.PORT || 5000

// -------------------------------------------------------
// MIDDLEWARE SETUP
// Middleware = functions that run on every request before it reaches your route
// -------------------------------------------------------

// Enable CORS (Cross-Origin Resource Sharing)
// Without this, the browser blocks requests from frontend (port 3000) to backend (port 5000)
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5173',   // Vite dev server default port
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

// Parse incoming JSON request bodies
// This lets us read req.body when the frontend sends JSON data
app.use(express.json())

// Parse URL-encoded form data (e.g., from HTML forms)
app.use(express.urlencoded({ extended: true }))

// -------------------------------------------------------
// ROUTES
// Routes define what happens when someone visits a specific URL
// -------------------------------------------------------

// GET /api/health
// This is a simple health-check route to confirm the server is running
// Usage: Open browser → http://localhost:5000/api/health
app.get('/api/health', (req, res) => {
  // Send back a JSON response confirming the server is alive
  res.status(200).json({
    status: 'OK',
    message: 'Case Law Backend is running!',
    timestamp: new Date().toISOString(), // Current date & time
    port: PORT
  })
})

// Mount our upload routes at /api/upload
// POST /api/upload → uploadController.js handles file saving
app.use('/api/upload', uploadRoutes)

// Mount our analyse routes at /api/analyse
app.use('/api/analyse', analyseRoutes)

// Mount our compare route at /api/compare
app.use('/api/compare', compareRoutes)

// Mount the report route at /api/download-report
// POST /api/download-report → generates and streams a PDF to the browser
// GET  /api/download-report → returns usage guide JSON
app.use('/api/download-report', reportRoutes)

// GET /
// Root route — just a simple welcome message
app.get('/', (req, res) => {
  res.send('Welcome to AI Case Law Summarizer API! Visit /api/health to check status.')
})

// -------------------------------------------------------
// ERROR HANDLING MIDDLEWARE
// This catches any errors that happen in our routes
// It must have 4 parameters: (err, req, res, next)
// -------------------------------------------------------
app.use((err, req, res, next) => {
  // Log the error details for debugging
  console.error('❌ Server Error:', err.message)

  // Send a generic error response to the client
  res.status(500).json({
    status: 'ERROR',
    message: 'Something went wrong on the server.',
    error: err.message
  })
})

// -------------------------------------------------------
// START THE SERVER
// This tells Node.js to start listening for requests on our PORT
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`)
  console.log(`🔍 Health check:      http://localhost:${PORT}/api/health`)
  console.log(`📤 Upload endpoint:   http://localhost:${PORT}/api/upload`)
  console.log(`📋 Report endpoint:   http://localhost:${PORT}/api/download-report`)
})

const storageRoutes = require('./src/routes/storage')

// Mount storage routes
app.use('/api/storage', storageRoutes)
