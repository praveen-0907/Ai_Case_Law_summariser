"""
ai-service/routes/chat.py
-------------------------------------------------------
Chatbot endpoint for answering questions about case comparisons.
Uses Ollama to provide intelligent responses based on the comparison context.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
import requests
import os

router = APIRouter()

class ChatRequest(BaseModel):
    question: str = Field(..., description="User's question about the case comparison")
    context: Dict = Field(..., description="Comparison data including both cases and analysis")

class ChatResponse(BaseModel):
    answer: str
    model_used: str

def build_context_text(context: Dict) -> str:
    """Convert the comparison context into a readable text format for the AI."""
    
    case_a = context.get('case_a', {})
    case_b = context.get('case_b')
    comparison = context.get('comparison')
    
    text_parts = []
    is_single_case = case_b is None
    
    # Case A information
    text_parts.append(f"**{case_a.get('name', 'Case A')}**")
    text_parts.append(f"Summary: {case_a.get('summary', 'Not available')}")
    
    if case_a.get('issues'):
        text_parts.append("Key Issues:")
        for issue in case_a['issues']:
            text_parts.append(f"- {issue}")
    
    if case_a.get('principles'):
        text_parts.append("Legal Principles:")
        for principle in case_a['principles']:
            text_parts.append(f"- {principle}")
    
    # If single case mode, stop here
    if is_single_case:
        return "\n".join(text_parts)
    
    text_parts.append("\n---\n")
    
    # Case B information (only in comparison mode)
    if case_b:
        text_parts.append(f"**{case_b.get('name', 'Case B')}**")
        text_parts.append(f"Summary: {case_b.get('summary', 'Not available')}")
    
    if case_b.get('issues'):
        text_parts.append("Key Issues:")
        for issue in case_b['issues']:
            text_parts.append(f"- {issue}")
    
    if case_b.get('principles'):
        text_parts.append("Legal Principles:")
        for principle in case_b['principles']:
            text_parts.append(f"- {principle}")
    
    text_parts.append("\n---\n")
    
    # Comparison Analysis (only in comparison mode)
    if comparison:
        text_parts.append("**COMPARISON ANALYSIS**")
        text_parts.append(f"Similarity Score: {context.get('similarity_score', 0)}%")
        text_parts.append(f"Interpretation: {context.get('similarity_interpretation', 'Not available')}")
    
    if comparison.get('common_issues'):
        text_parts.append("\nCommon Issues:")
        for issue in comparison['common_issues']:
            text_parts.append(f"- {issue}")
    
    if comparison.get('common_principles'):
        text_parts.append("\nCommon Principles:")
        for principle in comparison['common_principles']:
            text_parts.append(f"- {principle}")
    
    if comparison.get('structural_differences'):
        text_parts.append("\nStructural Differences:")
        for diff in comparison['structural_differences']:
            text_parts.append(f"- {diff}")
    
    if comparison.get('adversarial_strategy'):
        strategy = comparison['adversarial_strategy']
        text_parts.append("\nAdversarial Strategy:")
        if strategy.get('if_you_rely_on_case_a'):
            text_parts.append(f"If relying on Case A: {strategy['if_you_rely_on_case_a']}")
        if strategy.get('how_to_distinguish_them'):
            text_parts.append(f"How to distinguish: {strategy['how_to_distinguish_them']}")
    
    return "\n".join(text_parts)

@router.post("/chat", response_model=ChatResponse)
def chat_with_bot(request: ChatRequest):
    """
    Answer user questions about the case comparison using AI.
    
    The chatbot has access to:
    - Both case summaries, issues, and principles
    - Similarity score and interpretation
    - Comparison analysis (common issues, principles, differences, strategy)
    """
    
    try:
        # Get Ollama configuration
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
        
        # Build context from comparison data
        context_text = build_context_text(request.context)
        
        # Determine if single case or comparison mode
        is_single_case = request.context.get('case_b') is None
        
        # Create the prompt
        if is_single_case:
            prompt = f"""You are Urimai Kural, an AI legal assistant helping lawyers understand legal cases.

You have been provided with a legal case analysis. Answer the user's question based ONLY on the information provided below.

CASE INFORMATION:
{context_text}

USER QUESTION: {request.question}

Provide a clear, concise, and helpful answer. If the question cannot be answered from the provided context, politely say so and suggest what information might be needed.

ANSWER:"""
        else:
            prompt = f"""You are Urimai Kural, an AI legal assistant helping lawyers understand case comparisons.

You have been provided with two legal cases and their comparative analysis. Answer the user's question based ONLY on the information provided below.

CONTEXT:
{context_text}

USER QUESTION: {request.question}

Provide a clear, concise, and helpful answer. If the question cannot be answered from the provided context, politely say so and suggest what information might be needed.

ANSWER:"""

        # Call Ollama API
        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                }
            },
            timeout=30
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Ollama API returned status {response.status_code}"
            )
        
        result = response.json()
        answer = result.get("response", "").strip()
        
        if not answer:
            answer = "I apologize, but I couldn't generate a response. Please try rephrasing your question."
        
        return ChatResponse(
            answer=answer,
            model_used=model
        )
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Ollama service: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing chat request: {str(e)}"
        )
