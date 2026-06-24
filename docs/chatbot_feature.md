# Urimai Kural Chatbot

## Overview

**Urimai Kural** is an AI-powered chatbot integrated into the Comparison Dashboard that helps users understand and explore the case comparison results. The chatbot can answer questions about both cases, their similarities, differences, and the comparative analysis.

**Name:** Urimai Kural  
**Tagline:** Your only stop for personalized legal solutions

## Features

- 💬 Natural language Q&A about case comparisons
- 🎯 Context-aware responses based on the current comparison
- ⚖️ Access to both case summaries, issues, and principles
- 📊 Understanding of similarity scores and comparative analysis
- 🔒 Fully local AI processing (no external API calls)

## How It Works

### Frontend (`frontend/src/components/Chatbot.jsx`)
- Floating chat button appears in the bottom-right corner after comparison completes
- Click to open a chat window with message history
- User types questions and receives AI-generated answers
- Automatically provides full comparison context to the AI

### Backend (`ai-service/routes/chat.py`)
- Receives user question and comparison context
- Builds a comprehensive context text from both cases and analysis
- Uses Ollama to generate intelligent responses
- Returns formatted answer to the frontend

### API Integration (`frontend/src/services/api.js`)
- `sendChatMessage(question, context)` function sends chat requests
- Communicates directly with Python AI service on port 8000
- Handles errors gracefully with user-friendly messages

## Usage

1. Upload and compare two legal cases
2. Wait for the comparison analysis to complete
3. Look for the floating "Urimai Kural" button in the bottom-right corner
4. Click to open the chat window
5. Ask questions like:
   - "What are the main differences between these cases?"
   - "Which case is stronger for employment law?"
   - "Explain the adversarial strategy"
   - "What common principles do they share?"
   - "How similar are these cases?"

## Technical Details

**Model:** Uses the same Ollama model configured in `.env` (default: `qwen2.5:0.5b`)

**Endpoint:** `POST /chat`

**Request Format:**
```json
{
  "question": "What are the main differences?",
  "context": {
    "case_a": { "name": "...", "summary": "...", "issues": [], "principles": [] },
    "case_b": { "name": "...", "summary": "...", "issues": [], "principles": [] },
    "similarity_score": 78,
    "similarity_interpretation": "High similarity",
    "comparison": {
      "common_issues": [],
      "common_principles": [],
      "structural_differences": [],
      "adversarial_strategy": {}
    }
  }
}
```

**Response Format:**
```json
{
  "answer": "The main differences between these cases are...",
  "model_used": "qwen2.5:0.5b"
}
```

## Styling

- Gradient purple-indigo branding
- Dark theme matching the dashboard
- Smooth animations and transitions
- Responsive design (mobile-friendly)
- Typing indicator while AI is thinking

## Error Handling

- Connection errors show user-friendly message
- Timeout protection (30 seconds max)
- Graceful fallback if AI fails to respond
- Chat history preserved during session

## Future Enhancements

- [ ] Save chat history across sessions
- [ ] Export chat transcript
- [ ] Multi-turn conversation memory
- [ ] Voice input support
- [ ] Pre-defined quick questions
- [ ] Citation tracking (which case the answer refers to)
