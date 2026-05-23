import json
import logging
import asyncio
from typing import Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

# Mock AI responses for the MVP
MOCK_RESPONSES = [
    "I've analyzed your recent report. Your overall health score is good, but your LDL cholesterol is slightly elevated. How are you feeling today?",
    "That makes sense. Given your recent lab work, I'd recommend drinking more water and monitoring your blood pressure. Do you want me to suggest some dietary changes?",
    "I understand. Dehydration can definitely affect those markers. I've noted this in your history. Is there anything else you'd like to review from your medical report?",
    "Based on your symptoms and the report, I can help you find a nearby specialist. Let me know if you want to proceed with booking."
]

@router.websocket("/ws/voice/{client_id}")
async def voice_websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    Sofia Voice AI WebSocket Endpoint.
    Handles streaming audio input, simulated STT, LLM reasoning, and streaming token output.
    """
    await manager.connect(websocket)
    logger.info(f"Sofia Assistant Client #{client_id} connected.")
    
    # Send a welcome message
    await manager.send_json({
        "type": "control",
        "action": "connected",
        "message": "Sofia Voice AI Platform Connected. Listening for audio stream..."
    }, websocket)
    
    conversation_turn = 0

    try:
        while True:
            # We accept both text (control signals) and bytes (audio streams)
            message = await websocket.receive()
            
            if "bytes" in message:
                # ── AUDIO STREAMING MODE ──
                audio_chunk = message["bytes"]
                # In a real pipeline, this would stream into faster-whisper or Deepgram
                # For this MVP, we simulate that receiving a specific chunk signals the end of speech
                pass 
                
            elif "text" in message:
                # ── CONTROL & SIMULATED STT MODE ──
                data = json.loads(message["text"])
                
                if data.get("type") == "speech_end":
                    # User stopped speaking. 
                    # Simulate LLM thinking latency
                    await websocket.send_json({"type": "status", "status": "thinking"})
                    await asyncio.sleep(1.0) 
                    
                    # Determine response
                    response_text = MOCK_RESPONSES[conversation_turn % len(MOCK_RESPONSES)]
                    conversation_turn += 1
                    
                    # ── STREAMING TOKEN GENERATION (Simulated TTS/LLM stream) ──
                    words = response_text.split(" ")
                    await websocket.send_json({"type": "speech_start"})
                    
                    for i, word in enumerate(words):
                        # Check for interruption signal (in a real async loop we'd use a queue/event)
                        # Here we just stream tokens with slight delay to simulate TTS generation time
                        await websocket.send_json({
                            "type": "token",
                            "text": word + (" " if i < len(words) -1 else "")
                        })
                        await asyncio.sleep(0.08) # Human-like streaming pacing
                        
                    await websocket.send_json({"type": "speech_done", "full_text": response_text})

                elif data.get("type") == "interruption":
                    # User interrupted the AI
                    logger.info(f"Client #{client_id} triggered an interruption.")
                    # In a real pipeline, we'd abort the TTS audio buffer queue here.
                    await websocket.send_json({"type": "control", "action": "aborted_tts"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"Sofia Assistant Client #{client_id} disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
