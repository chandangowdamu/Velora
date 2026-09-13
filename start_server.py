import os
import sys
import subprocess
import webbrowser

def main():
    print("=" * 60)
    print("  🚀 CAREPLUS MEDICAL & AI CARE - APPLICATION LAUNCHER")
    print("=" * 60)
    
    # Verify Python packages
    try:
        import fastapi
        import uvicorn
        print("✅ Dependencies verified: FastAPI & Uvicorn installed.")
    except ImportError:
        print("📦 Installing required dependencies from requirements.txt...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

    print("\n⚡ Starting FastAPI Backend Server on http://127.0.0.1:8000 ...")
    print("🌐 Open http://127.0.0.1:8000 in your browser to view the application.")
    print("📘 Swagger API Docs available at: http://127.0.0.1:8000/docs")
    print("=" * 60)

    try:
        import uvicorn
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
    except KeyboardInterrupt:
        print("\n👋 CarePlus Medical Server stopped successfully.")

if __name__ == "__main__":
    main()
