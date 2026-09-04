import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

DB_PATH=Path(__file__).resolve().parent.parent/"cognicare.db"

def conn():
    c=sqlite3.connect(DB_PATH); c.row_factory=sqlite3.Row; return c

def _add_column(db, table, col, definition):
    cols={r[1] for r in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if col not in cols: db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")

def init_db():
    with conn() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,age INTEGER,language TEXT,dementia_type TEXT,voice TEXT,interests TEXT,routine TEXT,photo TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id INTEGER,question TEXT,answer TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id INTEGER,title TEXT,due TEXT,completed INTEGER DEFAULT 0,created_at TEXT);
        CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id INTEGER,game TEXT,accuracy REAL,score REAL,avg_response REAL,attempts INTEGER,hints INTEGER,difficulty INTEGER,completed INTEGER DEFAULT 1,played_at TEXT);
        CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id INTEGER,note TEXT,created_at TEXT);
        """)
        for col,definition in [
            ("wrong_selections","INTEGER DEFAULT 0"),("total_items","INTEGER DEFAULT 0"),("time_spent","REAL DEFAULT 0"),
            ("reaction_min","REAL DEFAULT 0"),("reaction_max","REAL DEFAULT 0"),("sequence_errors","INTEGER DEFAULT 0"),
            ("distractor_errors","INTEGER DEFAULT 0"),("position_errors","INTEGER DEFAULT 0"),("hint_rate","REAL DEFAULT 0"),
            ("game_version","TEXT DEFAULT 'v4'")]: _add_column(db,"sessions",col,definition)
        db.commit()

def seed_demo_data():
    with conn() as db:
        if db.execute("SELECT COUNT(*) FROM patients").fetchone()[0]: return
        now=datetime.now()
        ps=[
        ("Ananya Das",72,"Assamese","Alzheimer's disease","Female","Gardening, old music, family","Wake up 7:00; breakfast 8:00; walk 10:00; rest 14:00"),
        ("Ramesh Singh",68,"Hindi","Vascular dementia","Male","Cricket, cooking, grandchildren","Breakfast 8:00; medicine reminder 9:00; walk 18:00"),
        ("Mary Kharshiing",76,"Khasi","Mixed dementia","Female","Singing, flowers, family","Breakfast 8:30; garden 10:30; family call 19:00")]
        for p in ps: db.execute("INSERT INTO patients(name,age,language,dementia_type,voice,interests,routine,created_at) VALUES(?,?,?,?,?,?,?,?)",(*p,now.isoformat()))
        configs=[
        [("Memory Match",.92,86,3.1,24,1,3),("Pattern Recall",.81,78,4,17,2,3),("Attention & Focus",.88,82,2.7,30,0,3),("Daily Routine Recall",.76,72,4.8,14,2,2),("Find the Change",.84,80,4.0,12,1,3),("Grocery Basket",.79,76,4.4,15,2,2),("Where Does It Belong?",.87,83,3.5,14,1,3)],
        [("Memory Match",.70,68,4.8,31,3,2),("Pattern Recall",.58,59,5.9,22,4,2),("Attention & Focus",.83,77,3.2,29,1,3),("Daily Routine Recall",.63,64,5.2,19,3,2),("Find the Change",.61,62,5.5,13,3,2),("Grocery Basket",.67,65,5.0,16,3,2),("Where Does It Belong?",.74,70,4.6,15,2,2)],
        [("Memory Match",.79,74,4.3,28,2,2),("Pattern Recall",.72,69,5,24,2,2),("Attention & Focus",.91,88,2.4,31,0,3),("Daily Routine Recall",.66,61,5.7,21,4,2),("Find the Change",.76,73,4.4,14,2,2),("Grocery Basket",.71,68,4.7,16,2,2),("Where Does It Belong?",.83,79,3.8,15,1,3)]]
        for pid,rows in enumerate(configs,1):
            for day in range(1,22):
                for idx,(game,acc,score,resp,attempts,hints,diff) in enumerate(rows):
                    drift=((day%7)-3)*.006
                    a=max(.35,min(.98,acc+drift)); s=max(30,min(99,score+drift*40)); r=max(1.5,resp-drift*4)
                    total=max(10,attempts); wrong=max(0,int(round(total*(1-a))))
                    db.execute("""INSERT INTO sessions(patient_id,game,accuracy,score,avg_response,attempts,hints,difficulty,played_at,wrong_selections,total_items,time_spent,reaction_min,reaction_max,sequence_errors,distractor_errors,position_errors,hint_rate,game_version)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(pid,game,a,s,r,attempts,hints,diff,(now-timedelta(days=22-day,hours=idx*2)).isoformat(),wrong,total,total*r,r*.55,r*1.7,int(wrong*.2),int(wrong*.25),int(wrong*.15),hints/total,"v4"))
        memories=[
        [(1,"What is your daughter's name?","Ananya"),(1,"What is your favorite hobby?","Gardening"),(1,"Which place feels familiar to you?","Our family garden"),(1,"Who do you like talking to?","My family")],
        [(2,"What do you enjoy watching?","Cricket"),(2,"Who do you like spending time with?","My grandchildren"),(2,"What food do you enjoy cooking?","Dal and rice")],
        [(3,"What do you enjoy?","Singing and flowers"),(3,"Who do you like calling in the evening?","My family"),(3,"What is a familiar place?","The garden")]]
        for group in memories:
            for pid,q,a in group: db.execute("INSERT INTO memories(patient_id,question,answer,created_at) VALUES(?,?,?,?)",(pid,q,a,now.isoformat()))
        for pid,title,due in [(1,"Morning walk","Today 10:00"),(1,"Call Ananya","Today 18:30"),(2,"Family call","Tomorrow 19:00"),(3,"Garden time","Today 10:30")]: db.execute("INSERT INTO reminders(patient_id,title,due,created_at) VALUES(?,?,?,?)",(pid,title,due,now.isoformat()))
        for pid,note in [(1,"Prefers gentle voice prompts. Enjoys gardening examples."),(2,"Strongest engagement appears during visual activities."),(3,"Responds well to familiar music and family prompts.")]: db.execute("INSERT INTO notes(patient_id,note,created_at) VALUES(?,?,?)",(pid,note,now.isoformat()))
        db.commit()

def rows(sql,args=()):
    with conn() as db:return [dict(r) for r in db.execute(sql,args).fetchall()]
def one(sql,args=()):
    with conn() as db:
        r=db.execute(sql,args).fetchone();return dict(r) if r else None

def get_patients(): return rows("SELECT * FROM patients ORDER BY name")
def get_patient(pid): return one("SELECT * FROM patients WHERE id=?",(pid,))
def create_patient(p):
    with conn() as db:
        cur=db.execute("INSERT INTO patients(name,age,language,dementia_type,voice,interests,routine,photo,created_at) VALUES(?,?,?,?,?,?,?,?,?)",(p["name"],p["age"],p["language"],p["dementia_type"],p["voice"],p["interests"],p["routine"],"",datetime.now().isoformat()));db.commit();return cur.lastrowid

def get_patient_summary(pid): return one("SELECT COUNT(*) sessions,AVG(accuracy) accuracy,AVG(score) score,AVG(avg_response) avg_response,AVG(attempts) attempts,AVG(wrong_selections) wrong_selections,AVG(hints) hints,AVG(time_spent) time_spent FROM sessions WHERE patient_id=?",(pid,)) or {}
def get_sessions(pid,limit=120): return rows("SELECT * FROM sessions WHERE patient_id=? ORDER BY played_at DESC LIMIT ?",(pid,limit))
def get_sessions_for_game(pid,game,limit=20): return rows("SELECT * FROM sessions WHERE patient_id=? AND game=? ORDER BY played_at DESC LIMIT ?",(pid,game,limit))
def get_last_played_map(pid): return {r['game']:r['last'] for r in rows("SELECT game,MAX(played_at) last FROM sessions WHERE patient_id=? GROUP BY game",(pid,))}
def get_play_days(pid,days=30): return [r['day'] for r in rows("SELECT DISTINCT date(played_at) day FROM sessions WHERE patient_id=? AND played_at>=datetime('now',?) ORDER BY day DESC",(pid,f"-{days} days"))]
def get_game_breakdown(pid): return rows("""SELECT game,COUNT(*) sessions,AVG(accuracy) accuracy,AVG(score) score,AVG(avg_response) avg_response,AVG(attempts) attempts,AVG(hints) hints,MAX(difficulty) max_difficulty,AVG(wrong_selections) wrong_selections,AVG(sequence_errors) sequence_errors,AVG(distractor_errors) distractor_errors,AVG(position_errors) position_errors,AVG(hint_rate) hint_rate,AVG(time_spent) time_spent FROM sessions WHERE patient_id=? GROUP BY game ORDER BY game""",(pid,))
def get_trends(pid,days=90): return rows("SELECT date(played_at) day,AVG(accuracy) accuracy,AVG(score) score,AVG(avg_response) avg_response,AVG(wrong_selections) wrong_selections FROM sessions WHERE patient_id=? AND played_at>=datetime('now',?) GROUP BY date(played_at) ORDER BY day",(pid,f"-{days} days"))
def get_memories(pid): return rows("SELECT * FROM memories WHERE patient_id=? ORDER BY id DESC",(pid,))
def add_memory(pid,q,a):
    with conn() as db: db.execute("INSERT INTO memories(patient_id,question,answer,created_at) VALUES(?,?,?,?)",(pid,q,a,datetime.now().isoformat()));db.commit()
def get_reminders(pid): return rows("SELECT * FROM reminders WHERE patient_id=? ORDER BY completed,id DESC",(pid,))
def add_reminder(pid,title,due):
    with conn() as db: db.execute("INSERT INTO reminders(patient_id,title,due,created_at) VALUES(?,?,?,?)",(pid,title,due,datetime.now().isoformat()));db.commit()
def complete_reminder(rid):
    with conn() as db: db.execute("UPDATE reminders SET completed=1 WHERE id=?",(rid,));db.commit()
def delete_reminder(rid):
    with conn() as db: db.execute("DELETE FROM reminders WHERE id=?",(rid,));db.commit()
def get_caregiver_notes(pid): return rows("SELECT * FROM notes WHERE patient_id=? ORDER BY id DESC",(pid,))
def add_caregiver_note(pid,note):
    with conn() as db: db.execute("INSERT INTO notes(patient_id,note,created_at) VALUES(?,?,?)",(pid,note,datetime.now().isoformat()));db.commit()
def log_session(pid,data):
    fields=["game","accuracy","score","avg_response","attempts","hints","difficulty","completed","wrong_selections","total_items","time_spent","reaction_min","reaction_max","sequence_errors","distractor_errors","position_errors","hint_rate","game_version"]
    vals=[data.get(k,0) for k in fields]; vals[-1]=data.get("game_version","v4")
    with conn() as db:
        db.execute(f"INSERT INTO sessions(patient_id,{','.join(fields)},played_at) VALUES(?,{','.join(['?']*len(fields))},?)",[pid,*vals,datetime.now().isoformat()]);db.commit()
