from flask import Flask,render_template,request,jsonify,redirect,session
from functools import wraps
import os
from core.database import *
from core.adaptive_ai import analyze_patient,recommend_next_activity,compute_difficulty,get_streak
from core.ai_service import ask
from core.translations import LANGUAGES,tr
app=Flask(__name__)
app.secret_key=os.getenv('SECRET_KEY','ner-cognicare-dev-key-change-in-production')
CAREGIVER_PIN=os.getenv('CAREGIVER_PIN','1234')
init_db();seed_demo_data()

def caregiver_required(fn):
    """Guards caregiver-only data endpoints so trends, notes and session history are
    not readable without the caregiver PIN — a real (if lightweight) implementation
    of the 'Secure & Privacy-Focused... role-based access' feature pitched for CogniCare."""
    @wraps(fn)
    def wrapped(*a,**kw):
        if not session.get('caregiver_unlocked'):
            return jsonify(ok=False,error='Caregiver access required.'),401
        return fn(*a,**kw)
    return wrapped

@app.get('/api/caregiver/status')
def caregiver_status(): return jsonify(unlocked=bool(session.get('caregiver_unlocked')))
@app.post('/api/caregiver/unlock')
def caregiver_unlock():
    d=request.get_json() or {}
    if str(d.get('pin','')).strip()==CAREGIVER_PIN:
        session['caregiver_unlocked']=True; return jsonify(ok=True)
    return jsonify(ok=False,error='Incorrect PIN.'),403

@app.get('/api/health')
def health():
    return jsonify(ok=True, flask=True, ai_key_configured=bool(os.getenv('OPENAI_API_KEY','').strip()), ai_model=os.getenv('OPENAI_MODEL','gpt-5.6-luna'))

GAMES={
"Memory Match":{"icon":"🧠","desc":"Find familiar pairs and build visual memory."},
"Pattern Recall":{"icon":"◈","desc":"Remember a calm visual pattern in the right order."},
"Attention & Focus":{"icon":"◎","desc":"Respond to a target while ignoring distractions."},
"Daily Routine Recall":{"icon":"☀","desc":"Put familiar everyday steps in a sensible order."},
"Find the Change":{"icon":"🔎","desc":"Notice one small change between two views."},
"Grocery Basket":{"icon":"🛒","desc":"Remember everyday items from a small shopping list."},
"Where Does It Belong?":{"icon":"🏠","desc":"Connect familiar objects with the place they belong."},
"Who Is Missing?":{"icon":"👥","desc":"Remember who was in a small group."},
"What Happened First?":{"icon":"🕰","desc":"Put familiar daily actions in order."},
"Odd One Out":{"icon":"🧩","desc":"Find the item that does not belong."}}

@app.route('/')
def index(): return render_template('index.html',patients=get_patients(),languages=LANGUAGES,ui=tr('English'))
@app.route('/patient/<int:pid>')
def patient(pid):
    p=get_patient(pid)
    return render_template('patient.html',patient=p,recommendation=recommend_next_activity(pid),streak=get_streak(pid),ui=tr(p['language'] if p else 'English')) if p else redirect('/')
@app.route('/games/<int:pid>')
def games(pid):
    p=get_patient(pid)
    return render_template('games.html',patient=p,games=GAMES,ui=tr(p['language'] if p else 'English'))
@app.route('/memory/<int:pid>')
def memory(pid):
    p=get_patient(pid)
    return render_template('memory.html',patient=p,ui=tr(p['language'] if p else 'English'))
@app.route('/caregiver/<int:pid>')
def caregiver(pid):
    p=get_patient(pid)
    return render_template('caregiver.html',patient=p,ui=tr(p['language'] if p else 'English'))
@app.post('/api/patients')
def patients_api():
    d=request.get_json() or {}
    try: pid=create_patient({"name":d.get("name","New Patient"),"age":int(d.get("age",0)),"language":d.get("language","English"),"dementia_type":d.get("dementia_type","Not specified"),"voice":d.get("voice","Default"),"interests":d.get("interests",""),"routine":d.get("routine","")})
    except: return jsonify(ok=False,error='Please provide a valid age.'),400
    return jsonify(ok=True,patient_id=pid)
@app.get('/api/patient/<int:pid>/summary')
@caregiver_required
def summary(pid): return jsonify(summary=get_patient_summary(pid),ai=analyze_patient(pid),recommendation=recommend_next_activity(pid),trends=get_trends(pid,90))
@app.get('/api/patient/<int:pid>/sessions')
@caregiver_required
def sessions(pid): return jsonify(get_sessions(pid))
@app.get('/api/patient/<int:pid>/games')
@caregiver_required
def game_data(pid): return jsonify(get_game_breakdown(pid))
@app.get('/api/patient/<int:pid>/difficulty/<path:game>')
def difficulty(pid,game): return jsonify(compute_difficulty(pid,game))
@app.get('/api/patient/<int:pid>/trends/<int:days>')
@caregiver_required
def trends(pid,days): return jsonify(get_trends(pid,min(max(days,7),90)))
@app.route('/api/patient/<int:pid>/memories',methods=['GET','POST'])
def memories(pid):
    if request.method=='POST':
        d=request.get_json() or {};q=d.get('question','').strip();a=d.get('answer','').strip()
        if not q or not a:return jsonify(ok=False,error='Both fields are required.'),400
        add_memory(pid,q,a);return jsonify(ok=True)
    return jsonify(get_memories(pid))
@app.route('/api/patient/<int:pid>/reminders',methods=['GET','POST'])
def reminders(pid):
    if request.method=='POST':
        d=request.get_json() or {}; title=d.get('title','').strip(); due=d.get('due','').strip()
        if not title or not due:return jsonify(ok=False,error='Title and time are required.'),400
        add_reminder(pid,title,due);return jsonify(ok=True)
    return jsonify(get_reminders(pid))
@app.post('/api/reminders/<int:rid>/complete')
def reminder_complete(rid): complete_reminder(rid); return jsonify(ok=True)
@app.delete('/api/reminders/<int:rid>')
def reminder_delete(rid): delete_reminder(rid); return jsonify(ok=True)
@app.route('/api/patient/<int:pid>/notes',methods=['GET','POST'])
@caregiver_required
def notes(pid):
    if request.method=='POST':
        n=(request.get_json() or {}).get('note','').strip()
        if not n:return jsonify(ok=False,error='Note is empty.'),400
        add_caregiver_note(pid,n);return jsonify(ok=True)
    return jsonify(get_caregiver_notes(pid))
@app.post('/api/patient/<int:pid>/sessions')
def save_session(pid):
    d=request.get_json() or {}
    try:
        d['accuracy']=float(d.get('accuracy',0)); d['score']=float(d.get('score',0)); d['avg_response']=float(d.get('avg_response',0)); d['attempts']=int(d.get('attempts',0)); d['hints']=int(d.get('hints',0)); d['difficulty']=int(d.get('difficulty',1)); d['completed']=int(bool(d.get('completed',True)))
        for k in ['wrong_selections','total_items','sequence_errors','distractor_errors','position_errors']: d[k]=int(d.get(k,0))
        for k in ['time_spent','reaction_min','reaction_max','hint_rate']: d[k]=float(d.get(k,0))
        log_session(pid,d); return jsonify(ok=True)
    except Exception as e:return jsonify(ok=False,error=str(e)),400
@app.post('/api/ai')
def ai():
    d=request.get_json() or {}; pid=int(d.get('patient_id') or 0); msg=(d.get('message') or '').strip()
    if not get_patient(pid) or not msg:return jsonify(ok=False,error='Patient and message are required.'),400
    return jsonify(ok=True,**ask(pid,msg,d.get('history') or []))

if __name__=='__main__': app.run(host='127.0.0.1',port=5050,debug=True)
