# Single Case Analysis - User Guide

## 🎯 What Is This Feature?

The **Single Case Analysis** feature lets you upload one legal case PDF and get an instant AI-powered breakdown including:

- 📝 Plain-English summary
- ⚠️ Key legal issues
- 📘 Legal principles applied
- 💬 AI chatbot to answer your questions

## 📍 How to Access

### Step 1: Open the Application
Open your browser and go to: **http://localhost:3000**

### Step 2: Click "Single Case" Tab
You'll see three tabs at the top:
- 📤 Upload
- **📄 Single Case** ← Click this one
- ⚖️ Compare

## 📤 Uploading Your Case

### What You'll See

```
┌─────────────────────────────────────────┐
│        Analyze a Legal Case             │
│  Upload a single PDF case document to   │
│  receive an AI-generated summary...     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │            📄                     │ │
│  │                                   │ │
│  │  Click to select a PDF file      │ │
│  │  Maximum file size: 20MB         │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │     🔍  Analyze Case              │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### What to Do

1. **Click anywhere in the dashed box**
2. **Select your PDF file** from your computer
3. **See the file name** appear (with green checkmark ✓)
4. **Click "Analyze Case"** button

### Requirements

- ✅ Must be a PDF file
- ✅ Maximum 20MB file size
- ✅ Any legal case judgment document

## ⏳ Analysis in Progress

After clicking "Analyze Case", you'll see a loading screen:

```
┌─────────────────────────────────────┐
│          ⚖️                        │
│                                    │
│     Analyzing Case...              │
│                                    │
│  Extracting text, generating       │
│  summary, and identifying legal    │
│  issues and principles...          │
│                                    │
│  ⚡ LOCAL OLLAMA PIPELINE ACTIVE   │
└─────────────────────────────────────┘
```

**Wait time**: 10-30 seconds (depends on case length)

## 📊 Viewing Results

Once analysis completes, you'll see three main sections:

### 1. Case Summary

```
┌──────────────────────────────────────────┐
│  📋  Case Summary                        │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  CORE FACTS                        │ │
│  │  • Plaintiff filed suit for...    │ │
│  │  • Contract was signed on...      │ │
│  │  • Breach occurred when...        │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  MAIN DISPUTE                      │ │
│  │  • Whether the contract was...    │ │
│  │  • If damages were properly...    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  FINAL RULING                      │ │
│  │  • Court held that...             │ │
│  │  • Defendant liable for...        │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 2. Key Legal Issues (Blue Card)

```
┌──────────────────────────────────────────┐
│  ⚠️  KEY LEGAL ISSUES                    │
├──────────────────────────────────────────┤
│  • Whether termination violated...       │
│  • If employer was required to...        │
│  • Whether damages were...               │
└──────────────────────────────────────────┘
```

### 3. Legal Principles (Green Card)

```
┌──────────────────────────────────────────┐
│  📘  LEGAL PRINCIPLES                    │
├──────────────────────────────────────────┤
│  • Doctrine of natural justice           │
│  • Section 25F requirements              │
│  • Principle of proportionality          │
└──────────────────────────────────────────┘
```

### Action Button

At the bottom, you'll see:
```
┌────────────────────────────────────┐
│  🔄  Analyze Another Case          │
└────────────────────────────────────┘
```
Click this to upload and analyze a different case.

## 💬 Using the Chatbot

### Where to Find It

After results load, look for a **purple floating button** in the bottom-right corner:

```
      Screen
         ↓
┌─────────────────────────┐
│                         │
│                         │
│                         │
│                         │
│               ┌───────┐ │
│               │ ⚖️    │ │ ← Click here
│               │Urimai │ │
│               │Kural  │ │
│               └───────┘ │
└─────────────────────────┘
```

### Opening the Chat

Click the button to open the chat window:

```
┌─────────────────────────────────┐
│  ⚖️  Urimai Kural           ✕  │
│  Your only stop for             │
│  personalized legal solutions   │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ Hello! I am Urimai      │   │
│  │ Kural. I can help you   │   │
│  │ understand this case    │   │
│  │ analysis. Ask me        │   │
│  │ anything!               │   │
│  └─────────────────────────┘   │
│                                 │
│              ┌───────────────┐  │
│              │ What was the  │  │
│              │ main issue?   │  │
│              └───────────────┘  │
│                                 │
│  ┌─────────────────────────┐   │
│  │ The main issue was...   │   │
│  └─────────────────────────┘   │
│                                 │
├─────────────────────────────────┤
│  Ask about this case... [Send] │
└─────────────────────────────────┘
```

### Sample Questions to Ask

**About the Summary:**
- "What was this case about?"
- "Explain the core facts"
- "What was the final ruling?"

**About Issues:**
- "What were the main legal issues?"
- "Which issue did the court focus on?"

**About Principles:**
- "What legal principles were applied?"
- "Can you explain the doctrine used?"

**Analysis Questions:**
- "Who won this case?"
- "What was the court's reasoning?"
- "Were there any dissenting opinions?"

### How It Works

1. **Type your question** in the text box
2. **Press Enter** or click "Send"
3. **Wait 2-5 seconds** (you'll see three bouncing dots)
4. **Read the AI response**
5. **Ask follow-up questions** for more clarity

## 🎨 Visual Guide to Colors

| Element | Color | Meaning |
|---------|-------|---------|
| Purple/Indigo | Main buttons, chatbot | Primary actions |
| Blue | Issues card | Legal issues |
| Green/Emerald | Principles card | Legal principles |
| Red | Error messages | Something went wrong |
| Gray/Slate | Background, borders | Neutral elements |

## ⚠️ Error Messages

### "Please select a PDF file"
**What it means**: You tried to upload a non-PDF file  
**What to do**: Choose a file ending in `.pdf`

### "File size must be less than 20MB"
**What it means**: Your PDF is too large  
**What to do**: Compress the PDF or choose a smaller file

### "Upload failed"
**What it means**: The file couldn't be uploaded  
**What to do**: 
- Check your internet connection
- Make sure the backend is running
- Try again

### "Failed to analyze the case"
**What it means**: The AI service had an error  
**What to do**:
- Make sure Ollama is running (`ollama serve`)
- Check that all services are running
- Try a different PDF file

## 🔄 Starting Over

To analyze another case:

1. **Scroll down** to the bottom of results
2. **Click "Analyze Another Case"** button
3. **Upload a new PDF** file
4. Repeat the process

OR

1. **Click the "Back" button** at the top-left
2. Returns to the upload page
3. Choose "Single Case" tab again

## 💡 Pro Tips

### Tip 1: Keep PDFs Clean
✅ Use clear, text-based PDFs  
❌ Avoid scanned images (OCR quality varies)

### Tip 2: Ask Specific Questions
✅ "What was the breach of contract issue?"  
❌ "Tell me everything"

### Tip 3: Follow-Up Questions
The chatbot remembers the case context, so you can ask:
- First: "What were the issues?"
- Then: "Explain the second one"

### Tip 4: Use Both Tabs
- Use **Single Case** for quick individual analysis
- Use **Compare** for side-by-side comparison of two cases

## 🆘 Troubleshooting

### Problem: "Analyze Case" button is grayed out
**Solution**: Make sure you've selected a PDF file first

### Problem: Loading takes forever
**Solution**: 
- Check if Ollama is running
- Large PDFs (15-20MB) take longer
- Wait up to 1 minute for complex cases

### Problem: Chatbot doesn't respond
**Solution**:
- Check the AI service is running (port 8000)
- Check Ollama is running (port 11434)
- Look for error messages in the chat

### Problem: Summary looks incomplete
**Solution**: 
- This is normal for very short or very long documents
- The AI does its best with the content provided
- Try asking the chatbot for clarification

## 🎓 Example Workflow

### Scenario: Quick Case Review Before Meeting

**8:45 AM** - You have a 9:00 AM client meeting about a case

1. Open app → Click "Single Case" (5 seconds)
2. Upload the judgment PDF (5 seconds)
3. Click "Analyze Case" and wait (20 seconds)
4. Skim the summary while having coffee (1 minute)
5. Ask chatbot: "What was the court's main reasoning?" (10 seconds)
6. Read response (30 seconds)
7. Ask: "How does this affect employment contracts?" (10 seconds)

**8:47 AM** - You're now prepared with key points for the meeting!

## 📱 Mobile Use

The interface is responsive and works on tablets:
- Cards stack vertically
- Text remains readable
- Chatbot adapts to screen size
- Touch-friendly buttons

## 🔐 Privacy & Security

- ✅ All processing is **local** (on your machine)
- ✅ Files stay on your **local server**
- ✅ No data sent to external APIs
- ✅ Ollama runs **offline**

## 📞 Need Help?

If you encounter issues:
1. Check all services are running (`start_all.bat`)
2. Check the browser console (F12) for errors
3. Restart the services
4. Check the documentation in `/docs` folder

---

**Happy Analyzing! ⚖️**
