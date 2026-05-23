"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Settings, X, Activity, User, PhoneOff } from "lucide-react";

export default function VoiceAssistantUI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    // Initialize Web Speech APIs for the mock STT/TTS
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          setAudioLevel(Math.random() * 0.5 + 0.5); // Mock audio level visualizer
          
          // Interruption handling
          if (isSpeaking && currentTranscript.trim().length > 3) {
            handleInterruption();
          }
        };

        recognitionRef.current.onspeechend = () => {
          setAudioLevel(0);
        };
      }
    }
  }, [isSpeaking]);

  const handleInterruption = () => {
    // User interrupted the AI
    if (synthRef.current) {
      synthRef.current.cancel(); // Stop TTS immediately
    }
    setIsSpeaking(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interruption" }));
    }
  };

  const connectWebSocket = () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const clientId = Math.random().toString(36).substring(7);
    const ws = new WebSocket(`${wsUrl}/api/ws/voice/${clientId}`);
    
    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "status" && data.status === "thinking") {
          setIsSpeaking(false);
        } else if (data.type === "speech_start") {
          setAiResponse("");
          setIsSpeaking(true);
        } else if (data.type === "token") {
          setAiResponse(prev => prev + data.text);
          setAudioLevel(Math.random() * 0.8 + 0.2); // Animate AI orb
        } else if (data.type === "speech_done") {
          setIsSpeaking(false);
          setAudioLevel(0);
          
          // Use Browser TTS to speak the full accumulated text
          if (synthRef.current) {
            synthRef.current.cancel();
            utteranceRef.current = new SpeechSynthesisUtterance(data.full_text);
            
            // Try to find a good female voice (e.g., Samantha on Mac, Google UK Female, etc.)
            const voices = synthRef.current.getVoices();
            const preferredVoice = voices.find(v => v.name.includes("Samantha") || v.name.includes("Female") || v.name.includes("Google UK English Female"));
            if (preferredVoice) {
              utteranceRef.current.voice = preferredVoice;
            }
            
            utteranceRef.current.rate = 1.0;
            utteranceRef.current.pitch = 1.0;
            
            utteranceRef.current.onstart = () => setIsSpeaking(true);
            utteranceRef.current.onend = () => {
              setIsSpeaking(false);
              setAudioLevel(0);
            };
            
            synthRef.current.speak(utteranceRef.current);
          }
        }
      } catch (err) {
        console.error("WS parse error", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsListening(false);
      setIsSpeaking(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };

    wsRef.current = ws;
  };

  const toggleCall = () => {
    if (isConnected) {
      // Hang up
      wsRef.current?.close();
      setIsListening(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    } else {
      // Connect
      connectWebSocket();
    }
  };

  const toggleMic = () => {
    if (!isConnected) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setAudioLevel(0);
      
      // Simulate sending the end of speech to backend
      if (wsRef.current?.readyState === WebSocket.OPEN && transcript) {
        wsRef.current.send(JSON.stringify({ type: "speech_end", transcript }));
      }
    } else {
      // Start listening
      setTranscript("");
      setAiResponse("");
      
      // If AI is currently speaking, user toggling mic to talk is an interruption
      if (isSpeaking) {
        handleInterruption();
      }
      
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        // Handle case where recognition is already started
        console.warn(e);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (synthRef.current) synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  return (
    <div style={{
      width: "100%", height: "100%", minHeight: "100vh",
      background: "radial-gradient(circle at 50% 50%, #1e1b4b 0%, #000000 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
      padding: "40px 20px", color: "#fff", position: "relative", overflow: "hidden"
    }}>
      
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "800px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ 
            width: 10, height: 10, borderRadius: "50%", 
            background: isConnected ? "#10B981" : "#EF4444",
            boxShadow: `0 0 10px ${isConnected ? "#10B981" : "#EF4444"}`
          }} />
          <span style={{ fontSize: "14px", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
            {isConnected ? "Agent Active" : "Agent Offline"}
          </span>
        </div>
        <button style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
          <Settings size={20} />
        </button>
      </div>

      {/* Main Orb Visualizer */}
      <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: "40vh" }}>
        
        {/* Outer glowing rings */}
        <AnimatePresence>
          {(isListening || isSpeaking) && (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0.1, 0.3, 0.1], 
                  scale: [1, 1 + audioLevel * 0.5, 1] 
                }}
                transition={{ duration: isSpeaking ? 0.8 : 2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute", width: 300, height: 300, borderRadius: "50%",
                  background: isSpeaking ? "rgba(56, 189, 248, 0.2)" : "rgba(167, 139, 250, 0.2)",
                  filter: "blur(20px)"
                }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0.2, 0.5, 0.2], 
                  scale: [1, 1 + audioLevel * 0.3, 1] 
                }}
                transition={{ duration: isSpeaking ? 0.4 : 1.5, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute", width: 200, height: 200, borderRadius: "50%",
                  background: isSpeaking ? "rgba(56, 189, 248, 0.3)" : "rgba(167, 139, 250, 0.3)",
                  filter: "blur(10px)"
                }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Core AI Orb */}
        <motion.div
          animate={{
            scale: isConnected ? 1 : 0.8,
            boxShadow: isSpeaking 
              ? "0 0 60px rgba(56, 189, 248, 0.6), inset 0 0 30px rgba(255,255,255,0.8)" 
              : isListening 
                ? "0 0 40px rgba(167, 139, 250, 0.6), inset 0 0 20px rgba(255,255,255,0.4)"
                : "0 0 20px rgba(255,255,255,0.1), inset 0 0 10px rgba(255,255,255,0.1)"
          }}
          transition={{ duration: 0.5 }}
          style={{
            width: 120, height: 120, borderRadius: "50%",
            background: isSpeaking 
              ? "linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)"
              : isListening
                ? "linear-gradient(135deg, #A78BFA 0%, #6D28D9 100%)"
                : "linear-gradient(135deg, #334155 0%, #0F172A 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", zIndex: 10,
            border: "2px solid rgba(255,255,255,0.2)"
          }}
        >
          {isSpeaking ? (
            <Activity size={32} color="#fff" />
          ) : isListening ? (
            <Mic size={32} color="#fff" />
          ) : (
            <span style={{ fontSize: "24px", fontWeight: "bold" }}>Sofia</span>
          )}
        </motion.div>
      </div>

      {/* Transcript Area */}
      <div style={{ width: "100%", maxWidth: "600px", height: "150px", textAlign: "center", zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <AnimatePresence mode="wait">
          {aiResponse ? (
            <motion.div
              key="ai-text"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ fontSize: "20px", fontWeight: 500, color: "#38BDF8", lineHeight: 1.5 }}
            >
              "{aiResponse}"
            </motion.div>
          ) : transcript ? (
            <motion.div
              key="user-text"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ fontSize: "18px", color: "rgba(255,255,255,0.8)", fontStyle: "italic" }}
            >
              {transcript}
            </motion.div>
          ) : isListening ? (
            <motion.div
              key="listening"
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              style={{ fontSize: "16px", color: "#A78BFA" }}
            >
              Listening...
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 32, alignItems: "center", zIndex: 10, marginTop: "40px" }}>
        {isConnected && (
          <button
            onClick={toggleMic}
            style={{
              width: 64, height: 64, borderRadius: "50%", border: "none", cursor: "pointer",
              background: isListening ? "#A78BFA" : "rgba(255,255,255,0.1)",
              color: isListening ? "#fff" : "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", backdropFilter: "blur(10px)"
            }}
          >
            {isListening ? <Mic size={28} /> : <MicOff size={28} />}
          </button>
        )}

        <button
          onClick={toggleCall}
          style={{
            width: 80, height: 80, borderRadius: "50%", border: "none", cursor: "pointer",
            background: isConnected ? "#EF4444" : "#10B981", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 10px 25px ${isConnected ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)"}`,
            transition: "all 0.2s"
          }}
        >
          {isConnected ? <PhoneOff size={32} /> : <Activity size={36} />}
        </button>

        {isConnected && (
          <button
            style={{
              width: 64, height: 64, borderRadius: "50%", border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", backdropFilter: "blur(10px)"
            }}
          >
            <User size={28} />
          </button>
        )}
      </div>
    </div>
  );
}
