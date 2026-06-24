// frontend/src/components/Chatbot.jsx
// -------------------------------------------------------
// Urimai Kural — AI Chatbot for Case Comparison Queries
// -------------------------------------------------------
// A floating chatbot that answers questions about the comparison results.
// The bot has access to both case summaries and comparison analysis.
// -------------------------------------------------------

import React, { useState, useRef, useEffect } from 'react'
import { sendChatMessage } from '../services/api'

function Chatbot({ caseAData, caseBData, similarity, comparison }) {
  const [isOpen, setIsOpen] = useState(false)
  const isSingleCase = !caseBData // Single case mode if caseBData is null
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: isSingleCase
        ? 'Hello! I am Urimai Kural. I can help you understand this case analysis. Ask me anything!'
        : 'Hello! I am Urimai Kural. I can help you understand the comparison between these two cases. Ask me anything!',
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    
    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // Build context from comparison data
      const context = {
        case_a: {
          name: caseAData?.name || 'Case A',
          summary: caseAData?.summary || '',
          issues: caseAData?.issues || [],
          principles: caseAData?.principles || []
        },
        case_b: caseBData ? {
          name: caseBData?.name || 'Case B',
          summary: caseBData?.summary || '',
          issues: caseBData?.issues || [],
          principles: caseBData?.principles || []
        } : null,
        similarity_score: similarity?.similarity_score || 0,
        similarity_interpretation: similarity?.interpretation || '',
        comparison: comparison || null
      }

      const response = await sendChatMessage(userMessage, context)
      
      // Add bot response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.answer 
      }])
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an error processing your question. Please try again.' 
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-5 py-3 rounded-full shadow-2xl shadow-indigo-500/50 transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <span className="text-2xl">⚖️</span>
          <div className="flex flex-col items-start">
            <span className="font-bold text-sm leading-tight">Urimai Kural</span>
            <span className="text-xs opacity-90 leading-tight">Ask me anything</span>
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚖️</span>
              <div>
                <h3 className="font-bold text-white text-sm">Urimai Kural</h3>
                <p className="text-xs text-indigo-100 opacity-90">Your only stop for personalized legal solutions</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-700 bg-slate-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isSingleCase ? "Ask about this case..." : "Ask about the comparison..."}
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Chatbot
