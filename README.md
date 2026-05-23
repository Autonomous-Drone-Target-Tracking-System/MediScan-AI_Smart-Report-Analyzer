# MediScan AI: Next-Gen Enterprise Healthcare Platform

MediScan AI is a comprehensive, AI-powered healthcare ecosystem designed to seamlessly bridge the gap between patient diagnostics and enterprise clinic operations. Originally built as an intelligent medical report analyzer, MediScan has evolved into a fully scalable B2B healthcare product featuring **Sofia Voice AI** and the **Sofia Enterprise Module**.

##  Key Features & Architecture

### 1. Smart Medical Report Analyzer
- **Biomarker Extraction Engine**: Automatically extracts critical biomarkers from uploaded PDF reports (e.g., lipid panels, liver function, CBC) and maps them to standard clinical reference ranges.
- **Risk Categorization**: Flags abnormalities with severity levels (`Normal`, `Moderate`, `Critical`) and provides plain-English AI explanations for patients.
- **Specialized Workflows**:
  - **Radiology**: Analyzes structured radiology findings and outputs anatomical abnormalities.
  - **Cardiac / ECG**: Parses cardiac parameters (Heart Rate, QTc) and immediately flags `Emergency` conditions.
  - **DICOM Integration**: Backend support for ingesting structured medical imaging metadata.

### 2. Sofia Voice AI Platform
An immersive, real-time conversational healthcare assistant designed for ultra-low latency, empathetic voice interactions.
- **Real-Time WebSockets**: Streams audio and token data bidirectionally without waiting for full generation.
- **Human-Like Interruption Handling**: If the AI is speaking and the patient begins to talk, the system instantly cancels the TTS buffer and flushes the queue, creating natural turn-taking dynamics.
- **Web Speech API Integration**: Leverages native browser APIs for high-performance Speech-to-Text and Text-to-Speech simulation.
- **Contextual Healthcare Reasoning**: Built to guide patients through their reports, explain complex medical terms, and assist in appointment booking.

### 3. Geospatial Healthcare Discovery (Find Care)
- **Interactive Provider Map**: A beautiful, framer-motion powered simulated map experience mapping recommended doctors, clinics, and emergency rooms near the patient.
- **Emergency Escalation UI**: If a patient's report is flagged as `CRITICAL`, the system bypasses standard booking UI to display flashing red "Call ER Now" and "Get Directions" alerts.
- **Semantic Filtering**: Allows users to filter providers by AI-inferred specialties based on their specific health report findings.

### 4. Sofia Enterprise Module (B2B Clinic Operations)
Transforming MediScan into a scalable product that healthcare enterprises can deploy across networks.
- **Multi-Modality Scheduling**: Intelligent booking workflows that adapt to CT, MRI, Ultrasound, and X-ray needs.
- **AI Safety Checks**: A safeguard engine that checks the patient's profile *before* booking (e.g., blocking an MRI if the patient has a metal implant, or a CT if they have an iodine allergy).
- **RIS Reservation Integration**: Seamlessly syncs with external Radiology Information Systems (RIS) to reserve slots automatically.
- **Automated Prep Guidelines & SMS**: Generates scan-specific preparation instructions (e.g., "fast for 4 hours") and triggers SMS dispatches.
- **Bulk Billing Engine**: Streamlines clinic operations by grouping unbilled appointments into a single, scalable financial transaction.
- **Multi-Center Deployments**: Dashboards designed to handle multi-clinic rosters.

##  Tech Stack

### Frontend
- **Framework**: Next.js (App Router), React
- **Styling & Animation**: CSS Modules, Framer Motion (for voice orbs and map interactions)
- **Icons**: Lucide React
- **HTTP/State**: Axios, React Hooks

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (SQLAlchemy / raw cursors for high-performance queries)
- **Real-Time**: WebSockets (for Voice AI streaming)
- **AI/Extraction**: LangChain, Groq API (Llama3/Mixtral)
- **Architecture**: Modular routing (`auth.py`, `enterprise.py`, `recommendations.py`, `voice.py`)

##  Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables (copy `.env.example` to `.env` and add your API keys).
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
   echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> .env.local
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

##  Navigation & Demos
- **Dashboard**: View analyzed reports and health scores.
- **Find Doctors**: Click on the "Find Doctors" pin on any analyzed report to see the Geospatial Recommendation system in action.
- **Sofia Voice AI**: Click "Sofia Voice AI" in the navbar to interact with the real-time, interruptible conversational agent.
- **Enterprise Operations**: Click "Sofia Enterprise" in the navbar to access the B2B Clinic Dashboard, simulate safety checks, and run bulk billing pipelines.
