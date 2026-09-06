# TechFest 2026 - Production Deployment Guide

The platform is architected as a **unified Single Page Application (SPA)**: FastAPI serves the compiled React frontend, REST APIs, and code execution sandbox from a single port (8000).

---

## 🚀 Option 1: Free Cloud Deployment (Render.com) - 3 Minutes

Render can build and run your Docker container directly from your GitHub repository for free.

1. **Push your code to GitHub** (see instructions in chat or git push origin main).
2. Go to [dashboard.render.com](https://dashboard.render.com/) and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Render will auto-detect the Dockerfile:
   - **Environment**: Docker
   - **Region**: Choose closest to your college (e.g. Singapore or Frankfurt).
   - **Plan**: Free
5. Under **Environment Variables**, add:
   - DATABASE_URL: Your Supabase connection string (postgresql+asyncpg://postgres:[PASSWORD]@[HOST]:5432/postgres)
   - SECRET_KEY: Any random 32-character string
   - ENVIRONMENT: production
   - JUDGE0_ENDPOINTS: []
6. Click **Deploy Web Service**!
   - Render builds the frontend, sets up Python/Compilers, and gives you an HTTPS URL:  
     https://techfest-2026.onrender.com

---

## 🏢 Option 2: College LAN / Campus Lab Server (Recommended for Fest Day)

For 400-500 students in college labs, running on a campus lab PC ensures **zero internet latency** and prevents campus proxy/firewall issues.

### Step 1: Build the Frontend
`ash
cd frontend
npm run build
`

### Step 2: Start the Server on Local Network
From the root directory:
`ash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend --workers 4
`

### Step 3: Find the Host Machine IP
In PowerShell / Command Prompt on the host machine:
`ash
ipconfig
# Note your IPv4 Address, e.g.: 192.168.1.50
`

### Step 4: Students Connect
All participant computers connected to the college Wi-Fi / LAN simply open:
`
http://192.168.1.50:8000
`
*(Organizers access Admin Command Center at http://192.168.1.50:8000/#admin)*

---

## 🐳 Option 3: Docker Deployment (VPS / DigitalOcean / AWS / GCP)

Run with a single command on any Linux or Windows server with Docker:

`ash
docker compose up -d --build
`
Access at http://<SERVER_IP>:8000.
