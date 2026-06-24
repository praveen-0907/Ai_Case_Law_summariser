# Single Case Summarization Feature

## Overview

A standalone feature that allows users to upload and analyze a **single legal case document** without needing to compare it with another case. This provides a quick way to get AI-powered summaries, key issues, and legal principles extraction for individual cases.

## User Flow

1. **Navigate to Single Case Tab**
   - Click on "Single Case" tab in the navigation menu
   
2. **Upload PDF**
   - Click the upload area to select a PDF file
   - Maximum file size: 20MB
   - Only PDF files are accepted

3. **Analyze**
   - Click "Analyze Case" button
   - System uploads file to backend
   - AI processes the document (extracts text, generates summary, identifies issues and principles)

4. **View Results**
   - Summary (Core Facts, Main Dispute, Final Ruling)
   - Key Legal Issues (bullet list)
   - Legal Principles Applied (bullet list)

5. **Ask Questions with Chatbot**
   - "Urimai Kural" chatbot appears after analysis
   - Ask questions about the case analysis
   - Get AI-powered answers based on the case data

6. **Analyze Another Case**
   - Click "Analyze Another Case" to start over

## Features

✅ **Single Document Upload** - No need for multiple files  
✅ **AI Summary** - 3-section structured summary  
✅ **Issue Identification** - Automatically extract key legal issues  
✅ **Principle Extraction** - Identify applied legal principles  
✅ **Urimai Kural Chatbot** - Ask questions about the analysis  
✅ **Clean UI** - Focused single-case interface  
✅ **Quick Reset** - Easy to analyze another case

## Files Created/Modified

### New Files Created

1. **`frontend/src/pages/SingleCaseSummary.jsx`** (400+ lines)
   - Complete page for single case analysis
   - File upload interface
   - Results display with structured layout
   - Integrated chatbot support

### Modified Files

1. **`frontend/src/App.jsx`**
   - Added "Single Case" tab to navigation
   - Added route for single case page
   - Imported SingleCaseSummary component

2. **`frontend/src/components/Chatbot.jsx`**
   - Added single case mode detection
   - Updated welcome message for single case
   - Context builder handles null case_b
   - Appropriate placeholder text

3. **`ai-service/routes/chat.py`**
   - Updated context builder to handle single case
   - Different prompts for single vs comparison mode
   - Graceful handling when case_b is null

## How It Works

### Frontend Flow

```
User clicks Single Case tab
    ↓
Opens SingleCaseSummary.jsx
    ↓
User selects PDF file
    ↓
Clicks "Analyze Case"
    ↓
File uploads to backend (POST /api/upload)
    ↓
Calls analyseFile() API
    ↓
Backend orchestrates AI pipeline:
  - Extract text (PyMuPDF)
  - Generate summary (Ollama)
  - Extract features (issues + principles)
    ↓
Results displayed on page
    ↓
Chatbot appears for Q&A
```

### Chatbot Integration

The chatbot automatically adapts to single case mode:

- **Welcome Message**: "I can help you understand this case analysis"
- **Placeholder**: "Ask about this case..."
- **Context**: Only includes case_a data (case_b is null)
- **Prompt**: Simplified for single case analysis

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/upload` | Upload single PDF to backend |
| `POST /api/analyse` | Trigger full AI analysis pipeline |
| `POST /chat` | Chatbot Q&A about the case |

## UI Components

### Upload Section
- Large drag-and-drop area
- File name display after selection
- Visual feedback (green checkmark when selected)
- Analyze button (disabled until file selected)

### Results Section
- **Header**: Case name and breadcrumb
- **Summary Card**: Structured 3-section summary with formatted lists
- **Issues Card**: Bullet list of key legal issues (blue theme)
- **Principles Card**: Bullet list of legal principles (green theme)
- **Action Button**: "Analyze Another Case" reset button

### Loading States
- Upload progress overlay
- Analysis progress overlay with animated spinner
- Status messages ("Uploading..." / "Analyzing...")

## Styling

**Theme**: Dark mode with gradient backgrounds  
**Colors**:
- Primary: Indigo (`indigo-600`, `indigo-500`)
- Issues: Blue (`blue-400`, `blue-500`)
- Principles: Emerald (`emerald-400`, `emerald-500`)
- Background: Dark slate gradients

**Responsive**: Mobile-friendly layout

## Example Use Cases

### 1. Quick Case Review
Lawyer needs a quick overview of a case before a meeting
- Upload PDF
- Get instant summary
- Ask chatbot specific questions

### 2. Legal Research
Researcher wants to extract issues and principles from a judgment
- Upload case PDF
- Review extracted issues and principles
- Export or copy for research notes

### 3. Case Brief Preparation
Paralegal needs to prepare a case brief
- Upload judgment
- Get structured summary
- Use chatbot to clarify specific points

## Sample Questions for Chatbot

- "What was the main issue in this case?"
- "What legal principles were applied?"
- "Summarize the final ruling"
- "What were the core facts?"
- "Can you explain the dispute?"
- "What was the court's reasoning?"

## Error Handling

- Invalid file type → "Please select a PDF file"
- File too large → "File size must be less than 20MB"
- Upload failure → "Upload failed" with retry option
- Analysis failure → Error message with details
- Chatbot errors → Graceful error message

## Technical Details

**Frontend Component**: `SingleCaseSummary.jsx`  
**State Management**: React useState hooks  
**File Upload**: FormData API + Fetch  
**Analysis API**: Reuses existing `/api/analyse` endpoint  
**Chatbot**: Shared `Chatbot.jsx` component (with single case mode)

**No New Dependencies**: Uses existing project stack

## Future Enhancements

- [ ] Save analyzed cases to local storage
- [ ] Export summary as PDF
- [ ] Batch analysis (multiple single cases)
- [ ] Compare current case with saved cases
- [ ] Timeline extraction
- [ ] Citation extraction
- [ ] Judge/Court metadata extraction
- [ ] Language translation support
