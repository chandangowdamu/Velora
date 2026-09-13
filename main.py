import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Header, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from pymongo import MongoClient
from bson import ObjectId
import bcrypt
from jose import jwt, JWTError

# --- JWT Configuration ---
JWT_SECRET = "velora-healthcare-secret-2026-secure"
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

app = FastAPI(
    title="Velora AI Healthcare API",
    description="Backend service providing AI healthcare insights, patient authentication, A-Z disease dictionary, and appointment management with MongoDB.",
    version="2.0.0"
)

# --- MongoDB Connection ---
mongo_client = MongoClient("mongodb://localhost:27017")
mongo_db = mongo_client["velora_db"]
patients_collection = mongo_db["patients"]
appointments_mongo = mongo_db["appointments"]

# Create unique index on email
patients_collection.create_index("email", unique=True)

# Enable CORS for cross-origin frontend support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "healthcare.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. API Keys Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_value TEXT UNIQUE NOT NULL,
            client_name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2. Diseases Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS diseases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            overview TEXT NOT NULL,
            symptoms TEXT NOT NULL,
            ai_insight TEXT NOT NULL,
            treatment TEXT NOT NULL,
            severity TEXT DEFAULT 'Moderate'
        )
    ''')

    # 3. Departments Table (Inspired by reference image)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon_type TEXT NOT NULL,
            description TEXT NOT NULL,
            doctors_count INTEGER NOT NULL,
            url TEXT NOT NULL
        )
    ''')

    # 4. Featured Services Table (Inspired by reference image)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT NOT NULL,
            online_url TEXT NOT NULL
        )
    ''')

    # 5. Appointments Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT,
            department TEXT NOT NULL,
            doctor TEXT NOT NULL,
            appointment_date TEXT NOT NULL,
            status TEXT DEFAULT 'Confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 6. Doctors Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS doctors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            specialization TEXT NOT NULL,
            qualification TEXT NOT NULL,
            experience_years INTEGER NOT NULL,
            rating REAL DEFAULT 4.5,
            bio TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#0ea5e9'
        )
    ''')

    # 7. Disease-Doctor Mapping Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS disease_doctor_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            disease_name TEXT NOT NULL,
            doctor_id INTEGER NOT NULL,
            FOREIGN KEY (doctor_id) REFERENCES doctors(id)
        )
    ''')

    # 8. Token Bookings Table (30 tokens per doctor per day)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS token_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor_id INTEGER NOT NULL,
            booking_date TEXT NOT NULL,
            token_number INTEGER NOT NULL,
            patient_name TEXT NOT NULL,
            patient_email TEXT DEFAULT '',
            disease TEXT NOT NULL,
            status TEXT DEFAULT 'Confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (doctor_id) REFERENCES doctors(id)
        )
    ''')

    # Insert Default API Key if empty
    cursor.execute("SELECT COUNT(*) FROM api_keys")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO api_keys (key_value, client_name) VALUES (?, ?)",
            ("CP-AI-KEY-2026-SECURE", "CarePlus Portal Main Client")
        )

    # Insert Pre-populated Diseases for A-Z
    cursor.execute("SELECT COUNT(*) FROM diseases")
    if cursor.fetchone()[0] == 0:
        disease_data = [
            # A
            ("A", "Asthma", "Respiratory", 
             "A chronic condition that inflames and narrows the airways in the lungs, making breathing difficult.",
             "Shortness of breath, chest tightness, wheezing, coughing especially at night or early morning.",
             "AI Diagnostic model detects respiratory airway constriction patterns with 96.4% precision using acoustic breath waveform analysis.",
             "Inhaled corticosteroids, bronchodilators, avoiding trigger factors, and personalized AI peak-flow tracking."),
            ("A", "Alzheimer's Disease", "Neurology",
             "A progressive neurological disorder that causes brain atrophy and memory loss.",
             "Memory loss affecting daily activities, difficulty planning, spatial disorientation, mood shifts.",
             "AI neuroimaging models analyze structural MRI scans to detect early hippocampal volume reductions prior to severe symptom onset.",
             "Cholinesterase inhibitors, memantine, cognitive stimulation therapy, structured daily care plans."),
            ("A", "Arrhythmia", "Cardiology",
             "An irregular heartbeat pattern where the heart beats too fast, too slow, or unevenly.",
             "Palpitations, chest fluttering, dizziness, fatigue, lightheadedness.",
             "Wearable AI ECG analysis algorithms monitor real-time sinus rhythm anomalies to flag silent atrial fibrillation.",
             "Antiarrhythmic medication, pacemaker implantation, lifestyle modification, radiofrequency ablation."),
            
            # B
            ("B", "Bronchitis", "Respiratory",
             "Inflammation of the lining of your bronchial tubes, which carry air to and from your lungs.",
             "Persistent cough with mucus, fatigue, shortness of breath, mild fever and chest discomfort.",
             "AI lung sound classification distinguishes bacterial bronchitis from viral causes using deep audio spectrogram analysis.",
             "Rest, hydration, bronchodilators, humidifier therapy, anti-inflammatory support."),
            ("B", "Bell's Palsy", "Neurology",
             "Sudden weakness or paralysis in the muscles on one side of the face due to facial nerve inflammation.",
             "Rapid onset of mild weakness to total paralysis on one side of face, drooping eyelid, loss of taste.",
             "Facial computer vision AI measures facial symmetry index to track micro-recovery trends over time.",
             "Corticosteroids, physical therapy, eye drops/protection, facial rehabilitation exercises."),

            # C
            ("C", "Cardiomyopathy", "Cardiology",
             "A disease of the heart muscle that makes it harder for your heart to pump blood to the rest of your body.",
             "Breathlessness with exertion or rest, swelling of legs and ankles, fatigue, rapid heartbeat.",
             "AI echocardiogram segmentation automates ejection fraction calculations and structural wall thickness measurement.",
             "ACE inhibitors, beta-blockers, lifestyle modifications, implanted cardioverter-defibrillators (ICD)."),
            ("C", "Celiac Disease", "Gastroenterology",
             "An autoimmune reaction to eating gluten, a protein found in wheat, barley, and rye.",
             "Diarrhea, bloating, gas, fatigue, weight loss, anemia, abdominal discomfort.",
             "Genomic AI screening correlates HLA-DQ2/DQ8 biomarkers with clinical symptomatology.",
             "Strict lifelong gluten-free diet, nutritional supplements, intestinal healing monitoring."),

            # D
            ("D", "Diabetes Mellitus", "Endocrinology",
             "A group of metabolic diseases characterized by elevated blood glucose levels over a prolonged period.",
             "Increased thirst, frequent urination, unexplained weight loss, fatigue, blurred vision.",
             "AI continuous glucose predictor forecasts 2-hour postprandial glucose curves using neural time-series models.",
             "Insulin therapy, metformin, dietary control, regular exercise, continuous glucose monitoring."),
            ("D", "Deep Vein Thrombosis (DVT)", "Cardiovascular",
             "A medical condition that occurs when a blood clot forms in a deep vein, usually in the legs.",
             "Swelling in the affected leg, localized pain or tenderness, warm sensation, skin redness.",
             "Ultrasound computer vision models isolate venous compression non-invasively.",
             "Anticoagulant blood thinners, compression stockings, thrombolytic therapy if severe."),

            # E
            ("E", "Epilepsy", "Neurology",
             "A central nervous system disorder in which brain activity becomes abnormal, causing seizures.",
             "Temporary confusion, staring spell, uncontrollable jerking movements of arms and legs, loss of consciousness.",
             "Deep learning EEG seizure prediction algorithms provide early alerts up to 15 minutes prior to onset.",
             "Antiepileptic medications, vagus nerve stimulation, ketogenic diet therapy, surgical intervention."),

            # F
            ("F", "Fibromyalgia", "Rheumatology",
             "A disorder characterized by widespread musculoskeletal pain accompanied by fatigue, sleep, and memory issues.",
             "Widespread dull aching pain, fatigue, fibro-fog (cognitive difficulties), sleep disturbances.",
             "Multi-modal AI biomarker profiling correlates sleep architecture data with pain map telemetry.",
             "Analgesics, antidepressants, physical therapy, stress reduction techniques, sleep hygiene."),

            # G
            ("G", "Glaucoma", "Ophthalmology",
             "A group of eye conditions that damage the optic nerve, often caused by abnormally high pressure in your eye.",
             "Loss of peripheral vision, patchy blind spots, eye pain, severe headache, blurred vision.",
             "AI retinal fundus image classification detects optic disc cupping with high diagnostic accuracy.",
             "Prescription eye drops, laser trabeculoplasty, minimally invasive glaucoma surgery (MIGS)."),

            # H
            ("H", "Hypertension", "Cardiology",
             "A common condition in which the long-term force of the blood against your artery walls is high enough to cause health issues.",
             "Often asymptomatic ('silent killer'), severe headaches, nosebleeds, shortness of breath if severe.",
             "AI arterial stiffness calculator predicts cardiovascular risk from photoplethysmography (PPG) signals.",
             "Antihypertensive agents (ACE inhibitors, ARBs), sodium reduction, regular aerobic exercise."),

            # I
            ("I", "Influenza", "Infectious Disease",
             "A contagious respiratory illness caused by influenza viruses that infect the nose, throat, and sometimes lungs.",
             "High fever, body aches, chills, fatigue, dry cough, sore throat.",
             "Predictive epidemiological AI tracks viral variant mutation trends and local outbreak spikes.",
             "Antiviral medications (e.g. oseltamivir), symptomatic care, hydration, rest."),

            # J
            ("J", "Jaundice", "Hepatology",
             "A condition in which the skin, sclera (whites of eyes), and mucous membranes turn yellow due to high bilirubin levels.",
             "Yellowish discoloration of skin and eyes, pale stools, dark urine, abdominal itchiness.",
             "Smartphone camera AI quantifies scleral bilirubin levels for non-invasive neonatal screening.",
             "Phototherapy for neonates, underlying cause treatment (biliary obstruction removal, liver disease management)."),

            # K
            ("K", "Kidney Stones (Nephrolithiasis)", "Urology",
             "Hard deposits made of minerals and salts that form inside your kidneys.",
             "Severe sharp pain in the side and back, pain on urination, pink or brown urine, nausea.",
             "CT radiomics AI categorizes stone composition (calcium oxalate vs uric acid) automatically.",
             "Increased fluid intake, pain relievers, alpha blockers, shock wave lithotripsy (ESWL)."),

            # L
            ("L", "Lupus (Systemic Lupus Erythematosus)", "Immunology",
             "An autoimmune disease in which the body's immune system mistakenly attacks healthy tissue in many parts of the body.",
             "Butterfly-shaped facial rash, joint pain and swelling, fatigue, unexplained fever, chest pain.",
             "Immune biomarker AI analyzes multi-antibody panel combinations to assist early diagnosis.",
             "NSAIDs, antimalarial drugs (hydroxychloroquine), immunosuppressants, corticosteroids."),

            # M
            ("M", "Migraine", "Neurology",
             "A neurological condition that can cause severe throbbing pain or a pulsing sensation, usually on one side of the head.",
             "Throbbing headache, sensitivity to light and sound, nausea, visual aura prior to headache.",
             "Digital diary AI isolates dietary and environmental headache triggers using predictive pattern matching.",
             "Triptans, CGRP inhibitors, preventative beta-blockers, biofeedback, stress management."),

            # N
            ("N", "Neuropathy (Peripheral)", "Neurology",
             "Damage to the peripheral nerves, often causing weakness, numbness and pain, usually in the hands and feet.",
             "Gradual onset of numbness and tingling, sharp burning or freezing pain, extreme sensitivity to touch.",
             "AI nerve conduction velocity simulation maps localized demyelination patterns.",
             "Gabapentinoids, topical lidocaine, physical therapy, blood sugar control for diabetic etiology."),

            # O
            ("O", "Osteoarthritis", "Orthopedics",
             "The most common form of arthritis, occurring when the protective cartilage that cushions the ends of the bones wears down.",
             "Joint pain during or after movement, stiffness, tenderness, loss of flexibility, bone spurs.",
             "X-ray deep learning models grade Kellgren-Lawrence joint space narrowing in real-time.",
             "Physical therapy, weight loss, joint injections (hyaluronic acid/steroids), total joint replacement."),

            # P
            ("P", "Pneumonia", "Pulmonary",
             "An infection that inflames the air sacs in one or both lungs, which may fill with fluid or pus.",
             "Cough with phlegm, fever, chills, difficulty breathing, sharp chest pain during breathing.",
             "Chest X-ray AI diagnostic engine segments pulmonary infiltrates with sub-second processing speed.",
             "Antibiotics or antivirals depending on pathogen, oxygen therapy, fluids, rest."),

            # Q
            ("Q", "Q Fever", "Infectious Disease",
             "A bacterial infection caused by Coxiella burnetii, transmitted primarily through domestic ruminants.",
             "High fever, severe headache, fatigue, chills, confusion, muscle aches.",
             "Geospatial AI tracks zono-vector proximity to forecast potential rural vector transmission.",
             "Doxycycline antibiotic therapy, symptomatic supportive care."),

            # R
            ("R", "Rheumatoid Arthritis", "Rheumatology",
             "A chronic inflammatory disorder affecting joints and potentially damaging a wide variety of body systems.",
             "Tender, warm, swollen joints, joint stiffness worse in mornings, fatigue, fever.",
             "AI synovial MRI analyzer quantifies inflammatory pannus thickness and bone erosion risk.",
             "Disease-modifying antirheumatic drugs (DMARDs), biologic agents, physical therapy."),

            # S
            ("S", "Stroke (Ischemic)", "Neurology",
             "Occurs when the blood supply to part of your brain is interrupted or reduced, preventing brain tissue from getting oxygen.",
             "Sudden numbness or weakness of face/arm/leg, trouble speaking, sudden vision loss, severe sudden headache.",
             "Automated CT perfusion AI maps ischemic core vs penumbra volume in emergency triage.",
             "Intravenous tPA thrombolysis, mechanical thrombectomy, antiplatelet therapy, rehabilitation."),

            # T
            ("T", "Thyroiditis (Hashimoto's)", "Endocrinology",
             "An autoimmune condition where immune cells lead to the destruction of the thyroid gland, resulting in hypothyroidism.",
             "Fatigue, weight gain, cold intolerance, dry skin, muscle weakness, memory issues.",
             "Ultrasound AI classifies thyroid nodule elasticity and autoimmune parenchymal changes.",
             "Levothyroxine hormone replacement therapy, periodic TSH monitoring."),

            # U
            ("U", "Ulcerative Colitis", "Gastroenterology",
             "An inflammatory bowel disease that causes long-lasting inflammation and ulcers in your digestive tract.",
             "Diarrhea often with blood or pus, rectal pain, abdominal cramps, weight loss.",
             "Endoscopy computer vision models calculate Mayo endoscopic severity scores automatically.",
             "5-ASA compounds, corticosteroids, immunomodulators, biologic therapies."),

            # V
            ("V", "Vertigo (BPPV)", "Otolaryngology",
             "A sensation of spinning or feeling off-balance caused by displaced calcium crystals in the inner ear.",
             "Sensation of spinning, dizziness, loss of balance, nausea, vomiting, nystagmus.",
             "Video-oculography AI detects characteristic eye-flicker patterns to identify affected canal.",
             "Epley maneuver canalith repositioning, vestibular rehabilitation exercises."),

            # W
            ("W", "Wilson's Disease", "Genetics / Hepatology",
             "A rare inherited disorder that causes copper to accumulate in your liver, brain and other vital organs.",
             "Fatigue, yellowing of skin (jaundice), Kayser-Fleischer eye rings, involuntary movements.",
             "Genetic mutation AI predictor analyzes ATP7B variant pathogenicity.",
             "Chelation therapy (penicillamine, trientine), zinc acetate maintenance therapy."),

            # X
            ("X", "Xerostomia (Dry Mouth)", "Oral Health / Rheumatology",
             "A condition characterized by dry mouth resulting from reduced or absent saliva flow.",
             "Dryness in mouth, thick saliva, difficulty chewing/swallowing, cracked lips, altered taste.",
             "Salivary gland ultrasound AI quantifies parenchymal heterogeneity in Sjögren's screening.",
             "Saliva substitutes, sialagogues (pilocarpine), room humidifiers, rigorous oral hygiene."),

            # Y
            ("Y", "Yellow Fever", "Tropical Medicine",
             "A viral infection spread by Aedes mosquitoes prevalent in tropical regions.",
             "Fever, headache, jaundice, muscle pain, nausea, severe bleeding in advanced stages.",
             "Predictive vector AI calculates transmission risk based on temperature and satellite rain maps.",
             "Supportive care, fluids, fever management, strict mosquito protection, preventive vaccine."),

            # Z
            ("Z", "Zika Virus Infection", "Infectious Disease",
             "A mosquito-borne flavivirus infection causing mild illness or severe congenital microcephaly.",
             "Mild fever, rash, joint pain, conjunctivitis, muscle pain, headache.",
             "Genomic AI tracks micro-mutations in viral RNA to accelerate vaccine candidate validation.",
             "Rest, hydration, acetaminophen for fever and pain, mosquito prevention measures.")
        ]
        
        cursor.executemany(
            "INSERT INTO diseases (letter, name, category, overview, symptoms, ai_insight, treatment) VALUES (?, ?, ?, ?, ?, ?, ?)",
            disease_data
        )

    # Insert Default Departments (Matching reference image)
    cursor.execute("SELECT COUNT(*) FROM departments")
    if cursor.fetchone()[0] == 0:
        departments_data = [
            ("Emergency Care", "ambulance", 
             "24/7 rapid response trauma unit powered by real-time triage AI and immediate life support.", 
             14, "https://careplus-medical.example.com/departments/emergency"),
            ("Pediatric Department", "bear", 
             "Child-friendly compassionate healthcare, newborn monitoring, and pediatric specialty diagnostics.", 
             18, "https://careplus-medical.example.com/departments/pediatric"),
            ("Cardiology", "heart", 
             "Advanced cardiovascular care, continuous ECG AI monitoring, and non-invasive heart diagnostics.", 
             12, "https://careplus-medical.example.com/departments/cardiology"),
            ("AI Radiomics & Diagnostics", "scanner", 
             "Ultra-high resolution MRI, CT, and AI-assisted lesion screening for fast diagnostic precision.", 
             10, "https://careplus-medical.example.com/departments/radiology"),
            ("Neurology & Brain Sciences", "brain", 
             "Specialized brain imaging, epilepsy management, stroke intervention, and cognitive therapy.", 
             15, "https://careplus-medical.example.com/departments/neurology"),
            ("Orthopedics & Joint Care", "bone", 
             "Reconstructive joint surgery, spine care, physical therapy, and AI motion kinematics analysis.", 
             11, "https://careplus-medical.example.com/departments/orthopedics")
        ]
        cursor.executemany(
            "INSERT INTO departments (name, icon_type, description, doctors_count, url) VALUES (?, ?, ?, ?, ?)",
            departments_data
        )

    # Insert Default Featured Services (Matching reference image)
    cursor.execute("SELECT COUNT(*) FROM services")
    if cursor.fetchone()[0] == 0:
        services_data = [
            ("Advanced Diagnostics", 
             "Advanced diagnostics with state-of-the-art modern imaging machines and predictive AI diagnostic algorithms.",
             "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80",
             "https://careplus-medical.example.com/services/advanced-diagnostics"),
            ("Specialized Surgeries", 
             "Specialized surgeries with robotic precision, sterile operating theaters, and expert surgical teams.",
             "https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=800&q=80",
             "https://careplus-medical.example.com/services/specialized-surgeries"),
            ("AI Health Profiling", 
             "Comprehensive preventive health risk assessment leveraging patient biomarkers and deep learning models.",
             "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
             "https://careplus-medical.example.com/services/ai-health-profiling"),
            ("Telemedicine Connect", 
             "24/7 instant online video consultations with top board-certified medical specialists worldwide.",
             "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80",
             "https://careplus-medical.example.com/services/telemedicine-connect")
        ]
        cursor.executemany(
            "INSERT INTO services (title, description, image_url, online_url) VALUES (?, ?, ?, ?)",
            services_data
        )

    # Insert Doctors and Disease-Doctor Mappings
    cursor.execute("SELECT COUNT(*) FROM doctors")
    if cursor.fetchone()[0] == 0:
        doctors_data = [
            # Disease 1: Diabetes
            ("Dr. Anita Sharma", "Endocrinology", "MD, DM (Endocrinology)", 15, 4.8, "Specialist in diabetes management and metabolic disorders with 15 years of clinical excellence.", "#8b5cf6"),
            ("Dr. Rajesh Gupta", "Endocrinology", "MBBS, MD (Internal Medicine)", 12, 4.6, "Expert in insulin therapy, glucose monitoring and diabetic complications prevention.", "#0ea5e9"),
            # Disease 2: Asthma
            ("Dr. Priya Nair", "Pulmonology", "MD, DM (Pulmonology)", 10, 4.7, "Renowned pulmonologist specializing in chronic respiratory conditions and asthma care.", "#ec4899"),
            ("Dr. Vikram Mehta", "Pulmonology", "MBBS, DNB (Pulmonary Medicine)", 14, 4.5, "Focused on advanced bronchial therapies and AI-assisted respiratory diagnostics.", "#f59e0b"),
            # Disease 3: Hypertension
            ("Dr. Sunita Reddy", "Cardiology", "MD, DM (Cardiology)", 18, 4.9, "Leading cardiologist with expertise in hypertension management and preventive cardiac care.", "#ef4444"),
            ("Dr. Amit Patel", "Cardiology", "MBBS, MD (Cardiology)", 11, 4.6, "Specialist in cardiovascular risk assessment and blood pressure optimization.", "#10b981"),
            # Disease 4: Migraine
            ("Dr. Kavitha Iyer", "Neurology", "MD, DM (Neurology)", 13, 4.7, "Expert in migraine and headache disorders with advanced pain management techniques.", "#6366f1"),
            ("Dr. Arjun Das", "Neurology", "MBBS, DNB (Neurology)", 9, 4.5, "Focused on neurological pain syndromes and innovative migraine treatment protocols.", "#14b8a6"),
            # Disease 5: Arthritis
            ("Dr. Deepa Menon", "Orthopedics", "MS (Orthopedics), Fellowship", 16, 4.8, "Joint care specialist with extensive experience in arthritis management and rehabilitation.", "#f97316"),
            ("Dr. Suresh Kumar", "Orthopedics", "MBBS, MS (Orthopedics)", 20, 4.9, "Senior orthopedic surgeon specializing in degenerative joint disease and physiotherapy.", "#0284c7"),
            # Disease 6: Depression
            ("Dr. Meena Joshi", "Psychiatry", "MD (Psychiatry)", 12, 4.7, "Compassionate psychiatrist specializing in clinical depression and cognitive behavioral therapy.", "#a855f7"),
            ("Dr. Rohit Saxena", "Psychiatry", "MBBS, DPM (Psychiatry)", 8, 4.4, "Expert in mood disorders, anxiety management, and holistic mental health care.", "#06b6d4"),
            # Disease 7: Kidney Stones
            ("Dr. Lakshmi Rao", "Urology", "MS, MCh (Urology)", 14, 4.8, "Leading urologist specializing in kidney stone treatment and minimally invasive procedures.", "#d946ef"),
            ("Dr. Nikhil Verma", "Urology", "MBBS, MS (Urology)", 10, 4.5, "Expert in lithotripsy, renal stone prevention, and urological care.", "#84cc16"),
            # Disease 8: Pneumonia
            ("Dr. Swathi Bhat", "Pulmonology", "MD (Pulmonology)", 11, 4.6, "Specialized in pneumonia treatment, respiratory infections, and critical lung care.", "#e11d48"),
            ("Dr. Karthik Nair", "Pulmonology", "MBBS, DNB (Respiratory Medicine)", 13, 4.7, "Expert in infectious lung diseases, ventilator management, and AI-assisted diagnosis.", "#0891b2"),
            # Disease 9: Thyroid Disorder
            ("Dr. Pooja Singh", "Endocrinology", "MD, DM (Endocrinology)", 9, 4.5, "Thyroid specialist focused on Hashimoto's, Graves' disease, and hormonal therapy.", "#7c3aed"),
            ("Dr. Manish Tiwari", "Endocrinology", "MBBS, MD (Endocrinology)", 17, 4.8, "Senior endocrinologist with deep expertise in thyroid nodule management.", "#059669"),
            # Disease 10: Skin Allergy
            ("Dr. Ritu Agarwal", "Dermatology", "MD (Dermatology)", 10, 4.6, "Dermatologist specializing in allergic skin conditions, eczema, and immunological skin care.", "#db2777"),
            ("Dr. Sanjay Mishra", "Dermatology", "MBBS, DVD (Dermatology)", 15, 4.7, "Expert in contact dermatitis, urticaria, and advanced allergy testing.", "#ea580c")
        ]
        cursor.executemany(
            "INSERT INTO doctors (name, specialization, qualification, experience_years, rating, bio, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)",
            doctors_data
        )

        # Disease-Doctor Mappings (doctor IDs 1-20 in insertion order)
        disease_doctor_data = [
            ("Diabetes", 1), ("Diabetes", 2),
            ("Asthma", 3), ("Asthma", 4),
            ("Hypertension", 5), ("Hypertension", 6),
            ("Migraine", 7), ("Migraine", 8),
            ("Arthritis", 9), ("Arthritis", 10),
            ("Depression", 11), ("Depression", 12),
            ("Kidney Stones", 13), ("Kidney Stones", 14),
            ("Pneumonia", 15), ("Pneumonia", 16),
            ("Thyroid Disorder", 17), ("Thyroid Disorder", 18),
            ("Skin Allergy", 19), ("Skin Allergy", 20)
        ]
        cursor.executemany(
            "INSERT INTO disease_doctor_map (disease_name, doctor_id) VALUES (?, ?)",
            disease_doctor_data
        )

    conn.commit()
    conn.close()

# Initialize DB on start
init_db()

# --- Pydantic Data Models ---
class AppointmentCreate(BaseModel):
    patient_name: Optional[str] = "Guest Patient"
    department: str
    doctor: str
    appointment_date: str

class APIKeyCheck(BaseModel):
    api_key: str

class PatientSignup(BaseModel):
    name: str
    email: str
    password: str
    age: Optional[int] = None
    gender: Optional[str] = None
    conditions: Optional[str] = ""
    allergies: Optional[str] = ""

class PatientLogin(BaseModel):
    email: str
    password: str

class PatientProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    conditions: Optional[str] = None
    allergies: Optional[str] = None

class PatientAppointment(BaseModel):
    department: str
    doctor: str
    appointment_date: str
    notes: Optional[str] = ""

class TokenBookingCreate(BaseModel):
    doctor_id: int
    booking_date: str
    patient_name: str
    patient_email: Optional[str] = ""
    disease: str

class ChatMessage(BaseModel):
    message: str

def create_jwt_token(patient_id: str, email: str) -> str:
    payload = {
        "sub": patient_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")

def get_current_patient(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required. Please login.")
    token = authorization.replace("Bearer ", "")
    payload = verify_jwt_token(token)
    patient = patients_collection.find_one({"_id": ObjectId(payload["sub"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    return patient

# --- API Endpoints ---

@app.get("/api/diseases")
def get_diseases(letter: Optional[str] = Query(None, max_length=1), query: Optional[str] = Query(None)):
    """Retrieve diseases starting with letter or matching search term."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if letter:
        cursor.execute("SELECT * FROM diseases WHERE letter = ? ORDER BY name ASC", (letter.upper(),))
    elif query:
        cursor.execute("SELECT * FROM diseases WHERE name LIKE ? OR category LIKE ? OR symptoms LIKE ? ORDER BY name ASC", 
                       (f"%{query}%", f"%{query}%", f"%{query}%"))
    else:
        cursor.execute("SELECT * FROM diseases ORDER BY name ASC LIMIT 30")
        
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/diseases/{disease_id}")
def get_disease_detail(disease_id: int):
    """Retrieve full detail, explanation, symptoms, AI insight, and treatment for a disease."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM diseases WHERE id = ?", (disease_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Disease record not found.")
    return dict(row)

@app.get("/api/departments")
def get_departments():
    """Retrieve list of hospital departments (inspired by reference image)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM departments ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/services")
def get_services():
    """Retrieve featured services with image links and online hospital URLs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM services ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Doctor & Token Booking Endpoints ---

@app.get("/api/doctors")
def get_doctors(disease: Optional[str] = Query(None)):
    """Get all doctors, optionally filtered by disease name."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if disease:
        cursor.execute("""
            SELECT d.* FROM doctors d
            JOIN disease_doctor_map ddm ON d.id = ddm.doctor_id
            WHERE ddm.disease_name = ?
            ORDER BY d.rating DESC
        """, (disease,))
    else:
        cursor.execute("SELECT * FROM doctors ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/doctors/{doctor_id}")
def get_doctor_profile(doctor_id: int):
    """Get a single doctor's full profile."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM doctors WHERE id = ?", (doctor_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Doctor not found.")
    doctor = dict(row)
    # Also get the diseases this doctor handles
    cursor.execute("SELECT disease_name FROM disease_doctor_map WHERE doctor_id = ?", (doctor_id,))
    diseases = [r["disease_name"] for r in cursor.fetchall()]
    doctor["diseases"] = diseases
    conn.close()
    return doctor

@app.get("/api/doctors/{doctor_id}/slots")
def get_doctor_slots(doctor_id: int, date: str = Query(...)):
    """Get slot availability for a doctor on a specific date. Max 30 tokens/day."""
    MAX_TOKENS = 30
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) as booked FROM token_bookings WHERE doctor_id = ? AND booking_date = ?",
        (doctor_id, date)
    )
    booked = cursor.fetchone()["booked"]
    conn.close()
    return {
        "doctor_id": doctor_id,
        "date": date,
        "max_tokens": MAX_TOKENS,
        "booked": booked,
        "available": MAX_TOKENS - booked
    }

@app.post("/api/book-token")
def book_token(data: TokenBookingCreate):
    """Book a token for a doctor on a specific date. Returns token number and receipt."""
    MAX_TOKENS = 30
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check doctor exists
    cursor.execute("SELECT * FROM doctors WHERE id = ?", (data.doctor_id,))
    doctor = cursor.fetchone()
    if not doctor:
        conn.close()
        raise HTTPException(status_code=404, detail="Doctor not found.")

    # Check current bookings for the date
    cursor.execute(
        "SELECT COUNT(*) as booked FROM token_bookings WHERE doctor_id = ? AND booking_date = ?",
        (data.doctor_id, data.booking_date)
    )
    booked = cursor.fetchone()["booked"]

    if booked >= MAX_TOKENS:
        conn.close()
        raise HTTPException(status_code=400, detail=f"All {MAX_TOKENS} tokens are booked for this date. Please choose another date.")

    token_number = booked + 1

    cursor.execute(
        "INSERT INTO token_bookings (doctor_id, booking_date, token_number, patient_name, patient_email, disease) VALUES (?, ?, ?, ?, ?, ?)",
        (data.doctor_id, data.booking_date, token_number, data.patient_name, data.patient_email, data.disease)
    )
    booking_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": "Token booked successfully!",
        "receipt": {
            "booking_id": booking_id,
            "token_number": token_number,
            "total_booked": token_number,
            "max_tokens": MAX_TOKENS,
            "doctor_name": doctor["name"],
            "doctor_specialization": doctor["specialization"],
            "disease": data.disease,
            "patient_name": data.patient_name,
            "booking_date": data.booking_date,
            "status": "Confirmed"
        }
    }

@app.get("/api/disease-list")
def get_disease_list():
    """Get the list of 10 diseases used in doctor mapping."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT disease_name FROM disease_doctor_map ORDER BY disease_name ASC")
    rows = cursor.fetchall()
    conn.close()
    return [r["disease_name"] for r in rows]

@app.get("/api/token-bookings")
def get_token_bookings(patient_name: Optional[str] = Query(None)):
    """Get token booking history, optionally filtered by patient name."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if patient_name:
        cursor.execute("""
            SELECT tb.*, d.name as doctor_name, d.specialization
            FROM token_bookings tb
            JOIN doctors d ON d.id = tb.doctor_id
            WHERE tb.patient_name = ?
            ORDER BY tb.created_at DESC
        """, (patient_name,))
    else:
        cursor.execute("""
            SELECT tb.*, d.name as doctor_name, d.specialization
            FROM token_bookings tb
            JOIN doctors d ON d.id = tb.doctor_id
            ORDER BY tb.created_at DESC
        """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/appointments")
def create_appointment(data: AppointmentCreate):
    """Book a new medical appointment."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO appointments (patient_name, department, doctor, appointment_date) VALUES (?, ?, ?, ?)",
        (data.patient_name, data.department, data.doctor, data.appointment_date)
    )
    appointment_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": "Appointment booked successfully!",
        "appointment_id": appointment_id,
        "details": {
            "department": data.department,
            "doctor": data.doctor,
            "date": data.appointment_date
        }
    }

@app.post("/api/auth/verify-key")
def verify_api_key(data: APIKeyCheck):
    """Verify an API key against the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM api_keys WHERE key_value = ? AND status = 'active'", (data.api_key.strip(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            "valid": True,
            "client_name": row["client_name"],
            "created_at": row["created_at"],
            "message": "API Key authenticated successfully. AI diagnostic backend unlocked."
        }
    else:
        return {
            "valid": False,
            "message": "Invalid or revoked API Key. Please enter a valid key (e.g. CP-AI-KEY-2026-SECURE)."
        }

# --- Patient Authentication Endpoints (MongoDB) ---

@app.post("/api/auth/signup")
def patient_signup(data: PatientSignup):
    """Register a new patient with profile details. Stores in MongoDB."""
    # Check if email already exists
    existing = patients_collection.find_one({"email": data.email.lower().strip()})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please login.")
    
    # Hash password
    hashed_pw = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt())
    
    # Create patient document
    patient_doc = {
        "name": data.name.strip(),
        "email": data.email.lower().strip(),
        "password_hash": hashed_pw.decode('utf-8'),
        "age": data.age,
        "gender": data.gender,
        "conditions": data.conditions,
        "allergies": data.allergies,
        "created_at": datetime.utcnow().isoformat(),
        "profile_complete": bool(data.age and data.gender)
    }
    
    result = patients_collection.insert_one(patient_doc)
    patient_id = str(result.inserted_id)
    
    # Generate JWT token
    token = create_jwt_token(patient_id, data.email)
    
    return {
        "status": "success",
        "message": "Account created successfully! Welcome to Velora.",
        "token": token,
        "patient": {
            "id": patient_id,
            "name": data.name,
            "email": data.email
        }
    }

@app.post("/api/auth/login")
def patient_login(data: PatientLogin):
    """Authenticate a patient and return JWT token."""
    patient = patients_collection.find_one({"email": data.email.lower().strip()})
    if not patient:
        raise HTTPException(status_code=401, detail="No account found with this email. Please sign up first.")
    
    # Verify password
    if not bcrypt.checkpw(data.password.encode('utf-8'), patient["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
    
    patient_id = str(patient["_id"])
    token = create_jwt_token(patient_id, patient["email"])
    
    return {
        "status": "success",
        "message": f"Welcome back, {patient['name']}!",
        "token": token,
        "patient": {
            "id": patient_id,
            "name": patient["name"],
            "email": patient["email"]
        }
    }

@app.get("/api/auth/profile")
def get_patient_profile(patient: dict = Depends(get_current_patient)):
    """Get the logged-in patient's profile."""
    return {
        "id": str(patient["_id"]),
        "name": patient.get("name", ""),
        "email": patient.get("email", ""),
        "age": patient.get("age"),
        "gender": patient.get("gender", ""),
        "conditions": patient.get("conditions", ""),
        "allergies": patient.get("allergies", ""),
        "created_at": patient.get("created_at", ""),
        "profile_complete": patient.get("profile_complete", False)
    }

@app.put("/api/auth/profile")
def update_patient_profile(data: PatientProfileUpdate, patient: dict = Depends(get_current_patient)):
    """Update the logged-in patient's profile."""
    update_fields = {}
    if data.name is not None:
        update_fields["name"] = data.name.strip()
    if data.age is not None:
        update_fields["age"] = data.age
    if data.gender is not None:
        update_fields["gender"] = data.gender
    if data.conditions is not None:
        update_fields["conditions"] = data.conditions
    if data.allergies is not None:
        update_fields["allergies"] = data.allergies
    
    if update_fields:
        # Check profile completeness
        merged = {**patient, **update_fields}
        update_fields["profile_complete"] = bool(merged.get("age") and merged.get("gender"))
        patients_collection.update_one({"_id": patient["_id"]}, {"$set": update_fields})
    
    return {"status": "success", "message": "Profile updated successfully."}

@app.post("/api/patient/appointments")
def create_patient_appointment(data: PatientAppointment, patient: dict = Depends(get_current_patient)):
    """Book appointment linked to authenticated patient (stored in MongoDB)."""
    appointment_doc = {
        "patient_id": str(patient["_id"]),
        "patient_name": patient["name"],
        "patient_email": patient["email"],
        "department": data.department,
        "doctor": data.doctor,
        "appointment_date": data.appointment_date,
        "notes": data.notes,
        "status": "Confirmed",
        "created_at": datetime.utcnow().isoformat()
    }
    
    result = appointments_mongo.insert_one(appointment_doc)
    
    return {
        "status": "success",
        "message": "Appointment booked successfully!",
        "appointment_id": str(result.inserted_id),
        "details": {
            "department": data.department,
            "doctor": data.doctor,
            "date": data.appointment_date
        }
    }

@app.get("/api/patient/appointments")
def get_patient_appointments(patient: dict = Depends(get_current_patient)):
    """Get all appointments for the logged-in patient."""
    appointments = list(appointments_mongo.find(
        {"patient_id": str(patient["_id"])}
    ).sort("created_at", -1))
    
    return [{
        "id": str(apt["_id"]),
        "department": apt["department"],
        "doctor": apt["doctor"],
        "appointment_date": apt["appointment_date"],
        "notes": apt.get("notes", ""),
        "status": apt["status"],
        "created_at": apt["created_at"]
    } for apt in appointments]

@app.post("/api/chat")
def chatbot_response(data: ChatMessage):
    """AI Health Chatbot — searches disease database and returns intelligent structured responses."""
    message_lower = data.message.lower().strip()
    conn = get_db_connection()
    cursor = conn.cursor()

    search_term = f"%{message_lower}%"
    cursor.execute("""
        SELECT * FROM diseases
        WHERE LOWER(name) LIKE ?
           OR LOWER(symptoms) LIKE ?
           OR LOWER(category) LIKE ?
           OR LOWER(overview) LIKE ?
           OR LOWER(treatment) LIKE ?
        ORDER BY
            CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
            name ASC
        LIMIT 3
    """, (search_term, search_term, search_term, search_term, search_term, search_term))
    diseases = [dict(r) for r in cursor.fetchall()]
    conn.close()

    # Detect intent from user message
    intent = "disease_info" if diseases else "not_found"
    if any(w in message_lower for w in ["symptom", "sign", "feel", "experiencing", "suffer"]):
        intent = "symptoms"
    elif any(w in message_lower for w in ["treat", "cure", "medicine", "medication", "remedy", "therapy"]):
        intent = "treatment"
    elif any(w in message_lower for w in ["ai", "insight", "diagnos", "detect"]):
        intent = "ai_insight"

    return {"intent": intent, "diseases": diseases, "query": data.message}

# Serve Static Files (HTML/CSS/JS)
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
