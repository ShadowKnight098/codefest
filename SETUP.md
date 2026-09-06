# CodeFest - Setup on a New PC

Follow these steps in order to get the full project running on any new Windows machine.

---

## Step 1: Install Prerequisites

| Tool | Download Link | Notes |
|---|---|---|
| Git | https://git-scm.com/download/win | For cloning the repo |
| Node.js v20+ | https://nodejs.org/ | Choose the LTS version |
| Python 3.11+ | https://www.python.org/downloads/ | Check "Add to PATH" during install |

---

## Step 2: Clone the Repository

Open PowerShell and run:
```
git clone https://github.com/ShadowKnight098/codefest.git
cd codefest
```

---

## Step 3: Set Up the Backend (Python)

```
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

Create a file at backend\.env with:

```
DATABASE_URL=postgresql+asyncpg://neondb_owner:npg_Gdi4rHnj6qEb@ep-twilight-forest-b35ndvrv-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?ssl=require
SECRET_KEY=your-secret-key-here
JUDGE0_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your-rapidapi-key
RAPIDAPI_HOST=judge0-ce.p.rapidapi.com
CORS_ORIGINS=http://localhost:5173,https://codefest2.vercel.app
```

---

## Step 4: Set Up the Frontend (Node.js)

```
cd frontend
npm install
```

Create frontend\.env.local with:

```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Step 5: Run the Project

Open TWO PowerShell windows:

Terminal 1 - Backend:
```
venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend --reload
```

Terminal 2 - Frontend:
```
cd frontend
npm run dev
```

Open browser: http://localhost:5173

---

## Step 6: Admin Panel

Access it at: http://localhost:5173/#admin
Or press: Ctrl + Shift + A

Default credentials:
- admin / admin2026 (SUPERADMIN)
- maam / admin2026 (SUPERADMIN)
- organizer / fest2026 (ORGANIZER - leaderboard only)

---

## Step 7: Tailscale (Lab Computers - No Same WiFi Needed!)

On your main PC:
1. Install Tailscale from tailscale.com and log in
2. Note your Tailscale IP: 100.x.y.z
3. Run backend with --host 0.0.0.0 (already done)
4. Build frontend: npm run build
5. Preview on network: npm run preview -- --host 0.0.0.0

On lab computers:
1. Install Tailscale, log in with SAME account
2. Open browser: http://100.x.y.z:4173
Done - No same WiFi needed!

---

## Common Issues

| Problem | Fix |
|---|---|
| uvicorn not found | Activate venv first |
| npm not found | Install Node.js |
| Database error | Check backend\.env DATABASE_URL |
| CORS error | Check VITE_API_BASE_URL in frontend\.env.local |

---

Production URLs:
- Frontend: https://codefest2.vercel.app
- Backend: https://codefest-jqh3.onrender.com
- GitHub: https://github.com/ShadowKnight098/codefest
