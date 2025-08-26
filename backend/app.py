from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import spacy
import os
import requests
from pdfminer.high_level import extract_text
from docx import Document
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from a .env file if present (non-fatal if missing)
load_dotenv()

app = Flask(__name__)
CORS(app)

# Load the spaCy model
nlp = spacy.load('en_core_web_sm')

# Flask application for resume analysis
# This application provides endpoints for uploading resumes and serving static files

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")  # default model; override via env
GROQ_API_KEY = os.getenv("GROQ_API_KEY")  # EXPECT user to export/set this (never hardcode secrets)

if not GROQ_API_KEY:
    # Fail fast with a clear message (returned later if endpoints hit)
    print("[WARN] GROQ_API_KEY not set in environment. Set it before calling endpoints.")

client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL) if GROQ_API_KEY else None

def _call_groq(prompt: str, max_retries: int = 3) -> str:
    """Send a prompt to Groq using the OpenAI-compatible client and return text.

    Retries on transient HTTP / rate / timeout errors.
    """
    if not client:
        raise RuntimeError("GROQ_API_KEY is not configured on the server.")
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            # Using responses endpoint (Groq supports OpenAI responses API)
            resp = client.responses.create(
                model=GROQ_MODEL,
                input=prompt,
                max_output_tokens=2048,
            )
            # resp.output_text for convenience (OpenAI python >=1.0 style)
            return resp.output_text.strip()
        except Exception as e:  # Broad catch to simplify; could refine (RateLimitError, etc.)
            last_err = e
            if attempt == max_retries:
                break
    raise RuntimeError(f"Groq AI request failed after {max_retries} attempts: {last_err}")

def extract_resume_text(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.pdf':
        return extract_text(file_path)
    elif ext == '.docx':
        doc = Document(file_path)
        return '\n'.join([p.text for p in doc.paragraphs])
    else:
        return ''

@app.route('/upload', methods=['POST'])
# Endpoint to handle resume uploads
def upload_resume():
    if 'resume' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['resume']
    try:
        # Save the uploaded file temporarily
        temp_path = os.path.join('temp', file.filename)
        file.save(temp_path)
        # Extract text from PDF or DOCX
        resume_text = extract_resume_text(temp_path)
        os.remove(temp_path)
        if not resume_text.strip():
            return jsonify({'error': 'Could not extract text from resume.'}), 400
        # Call the analyze_resume logic directly
        prompt = (
            "You are an expert resume reviewer and career advisor. "
            "Carefully analyze the following resume and provide highly actionable, specific, and detailed suggestions for improvement. "
            "For each suggestion, include a concrete example or rewrite (e.g., 'Instead of X, do Y' or 'For example: ...'). "
            "After the suggestions, provide an example of a rewritten section (such as the summary or a project description) that would be considered a 10 out of 10, based on your feedback. "
            "Be strict about the format and do not skip any section. "
            "Consider clarity, structure, skills, achievements, relevance to modern job markets, and overall professionalism. "
            "Also, give an overall rating for the resume on a scale of 1 to 10, where 10 is outstanding and 1 is very poor. "
            "Respond in the following format (do not include anything else):\n"
            "Rating: <number>\nSuggestions:\n<bullet points or text, each with an improved example or rewrite>\nExample of rewritten section (10/10):\n<your rewritten section>\n"
            f"\nResume:\n{resume_text}"
        )
        import re
        ai_reply = _call_groq(prompt)
        rating_match = re.search(r'Rating\s*[:\-]?\s*(\d{1,2})', ai_reply, re.IGNORECASE)
        suggestions_match = re.search(r'Suggestions\s*[:\-]?\s*(.*?)(?:Example of rewritten section|$)', ai_reply, re.IGNORECASE | re.DOTALL)
        example_match = re.search(r'Example of rewritten section.*?:\s*(.*)', ai_reply, re.IGNORECASE | re.DOTALL)
        rating = rating_match.group(1) if rating_match else None
        suggestions = suggestions_match.group(1).strip() if suggestions_match else None
        example = example_match.group(1).strip() if example_match else None
        if not (rating and suggestions and example):
            return jsonify({'error': 'AI could not provide a complete analysis. Please try again.', 'raw_ai_output': ai_reply}), 500
        return jsonify({'ai_rating': rating, 'ai_suggestions': suggestions, 'ai_example': example, 'raw_ai_output': ai_reply})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_resume():
    data = request.get_json()
    resume_text = data.get('resume_text', '')
    if not resume_text:
        return jsonify({'error': 'No resume text provided'}), 400

    prompt = (
        "You are an expert resume coach. Provide concise, actionable improvement suggestions (bullet list) and then a polished summary rewrite.\n" \
        f"Resume text:\n{resume_text}"
    )
    try:
        ai_reply = _call_groq(prompt)
        return jsonify({'ai_suggestions': ai_reply, 'model': GROQ_MODEL})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def serve_index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

if __name__ == '__main__':
    # Run the Flask application in debug mode
    app.run(debug=True)