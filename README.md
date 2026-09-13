# Velora

Velora is an AI-assisted healthcare portal with a medical disease directory, diagnostic insights, anatomical visualization, patient authentication, doctor discovery, and appointment booking.

## Features

- A-Z disease encyclopedia with search and AI insight summaries
- FastAPI backend with SQLite medical data
- MongoDB-backed patient accounts and appointments
- JWT authentication for patient dashboard access
- Appointment and token booking workflows
- Video-based hero, footer, and anatomical visualization sections
- Interactive API documentation through Swagger

## Requirements

- Python 3.10+
- MongoDB running locally on `mongodb://localhost:27017`
- A modern web browser

## Setup

1. Create and activate a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install the Python dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

3. Start MongoDB locally.

4. Start Velora:

   ```powershell
   python start_server.py
   ```

5. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser.

The API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Project Structure

- `main.py` - FastAPI application, database initialization, authentication, and API routes
- `start_server.py` - local development launcher
- `index.html` - public landing page
- `login.html` - patient login and registration page
- `dashboard.html` - authenticated patient dashboard
- `app.js` and `dashboard.js` - frontend behavior
- `style.css` - application styling
- `healthcare.db` - local SQLite database created and populated by the backend
- `*.mp4`, `*.jpeg`, `*.png` - visual assets used by the frontend

## Notes

This project is an educational healthcare application and does not replace professional medical advice, diagnosis, or treatment. Configure production secrets, CORS, database credentials, and deployment settings before using it outside local development.
