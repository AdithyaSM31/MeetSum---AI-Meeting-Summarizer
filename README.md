# 🎙️ Meeting Summarizer

<div align="center">
  <img src="meetsum_logo.png" alt="MeetSum Logo" width="300"/>
</div>

AI-powered meeting summarizer that transcribes audio recordings and generates actionable summaries with key decisions and action items.

### 🌐 **[Live Demo Available Here](https://meet-sum-ai-meeting-summarizer.vercel.app/)**

https://github.com/user-attachments/assets/d2dc2380-87c4-44be-8b42-31959ae24f82

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Whisper%20%2B%20GPT--4o--mini-412991?style=flat-square&logo=openai&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=flat-square&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

## ✨ Features

- **🎤 Audio Transcription** — Converts meeting audio to text using OpenAI Whisper API
- **📝 AI Summarization** — Generates executive summaries using GPT-4o-mini
- **✅ Action Items** — Automatically extracts tasks with owners, deadlines, and priorities
- **🎯 Key Decisions** — Highlights important decisions made during the meeting
- **📂 Meeting Dashboard** — Browse and manage all your meeting summaries
- **🖱️ Drag & Drop Upload** — Intuitive file upload with progress tracking
- **📋 Copy to Clipboard** — One-click copy for transcripts
- **🌙 Premium Dark UI** — Glassmorphism design with smooth animations

## 🏗️ Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend SPA   │────▶│  Express Backend  │────▶│  OpenAI Whisper  │
│  (HTML/CSS/JS)   │     │   (Node.js)       │     │  (Transcription) │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐     ┌──────────────────┐
                         │  SQLite Database  │     │  OpenAI GPT-4o   │
                         │  (Persistence)    │◀────│  (Summarization) │
                         └──────────────────┘     └──────────────────┘
```

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Vanilla HTML/CSS/JS | Premium SPA with glassmorphism dark theme |
| Backend | Node.js + Express | REST API, file uploads, processing pipeline |
| ASR | OpenAI Whisper API (`whisper-1`) | Speech-to-text transcription |
| LLM | OpenAI GPT-4o-mini | Meeting summarization & action item extraction |
| Database | SQLite (better-sqlite3) | Persistent storage for meetings |
| Upload | Multer | Multipart file upload handling |

## 📋 Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **OpenAI API Key** with access to `whisper-1` and `gpt-4o-mini` models ([Get one](https://platform.openai.com/api-keys))

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/meeting-summarizer.git
cd meeting-summarizer
```

### 2. Install dependencies

```bash
cd server
npm install
```

### 3. Configure environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-key-here
```

### 4. Start the server

```bash
npm run dev
```

### 5. Open in browser

Navigate to **http://localhost:3001** 🎉

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/meetings/upload` | Upload audio file (multipart/form-data, field: `audio`) |
| `GET` | `/api/meetings` | List all meetings |
| `GET` | `/api/meetings/:id` | Get meeting details (transcript + summary + action items) |
| `DELETE` | `/api/meetings/:id` | Delete a meeting |

### Example: Upload via cURL

```bash
curl -X POST http://localhost:3001/api/meetings/upload \
  -F "audio=@./my-meeting.mp3"
```

## 🤖 LLM Prompt Engineering

The summarization uses a carefully crafted system prompt that instructs GPT-4o-mini to:

1. **Summarize** — Generate a 3-5 sentence executive summary
2. **Identify Decisions** — Extract key decisions made during the meeting
3. **Extract Action Items** — List tasks with owner, deadline, and priority
4. **List Topics** — Identify main discussion topics

Key prompt design choices:
- **Low temperature (0.2)** — Ensures factual, consistent output
- **JSON mode** — Structured output for reliable parsing
- **Anti-hallucination rules** — Only includes information explicitly in the transcript
- **Persona-based** — Acts as a professional meeting assistant

## 📁 Project Structure

```
meeting-summarizer/
├── client/                    # Frontend SPA
│   ├── index.html            # HTML shell with semantic markup
│   ├── styles.css            # Premium dark theme (glassmorphism)
│   └── app.js                # SPA router, API client, UI components
├── server/                    # Backend
│   ├── index.js              # Express server entry point
│   ├── db.js                 # SQLite database setup
│   ├── routes/
│   │   └── meetings.js       # REST API routes
│   ├── services/
│   │   ├── transcription.js  # OpenAI Whisper integration
│   │   └── summarization.js  # GPT-4o-mini summarization
│   ├── uploads/              # Uploaded audio files (gitignored)
│   ├── .env                  # Environment variables (gitignored)
│   ├── .env.example          # Environment template
│   └── package.json          # Dependencies
├── .gitignore
└── README.md
```

## 🎨 UI Features

- **Dark Mode** — Rich `#06070d` background with ambient glow
- **Glassmorphism** — Frosted glass cards with backdrop blur
- **Gradient Accents** — Purple → Blue → Teal color scheme
- **Micro-animations** — Fade-in, slide-up, hover effects, loading spinners
- **Responsive Design** — Works on mobile, tablet, and desktop
- **Toast Notifications** — Non-intrusive success/error feedback

## ⚠️ Limitations

- Audio files up to **200 MB** supported (auto-split into chunks for Whisper's 25 MB API limit)
- Supported formats: MP3, WAV, M4A, MP4, WebM, OGG, FLAC
- Requires active internet connection for OpenAI API calls
- Transcript quality depends on audio clarity

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
