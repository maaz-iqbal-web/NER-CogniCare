from statistics import mean
from datetime import datetime, date, timedelta
from .database import get_sessions,get_game_breakdown,get_sessions_for_game,get_last_played_map,get_play_days

def f(x):
    try:return float(x or 0)
    except:return 0.0

ERROR_DOMAIN_MAP={
    "sequence_errors":"putting steps or events in order",
    "distractor_errors":"staying focused when something else is happening",
    "position_errors":"remembering where things belong",
}

# ---------- Per-game adaptive difficulty ----------
def compute_difficulty(pid,game):
    """Looks at the person's own last few rounds of THIS game (not a population norm)
    and decides whether the next round should get a little harder, a little easier,
    or stay the same. This is what actually makes the games adapt, instead of the
    difficulty number just being stored and ignored."""
    hist=get_sessions_for_game(pid,game,6)
    current=int(hist[0]["difficulty"] or 2) if hist else 2
    if len(hist)<3:
        return {"level":max(1,min(5,current or 2)),"reason":"Starting at a comfortable level while we learn your pace on this activity.","confidence":"low","sessions_seen":len(hist)}
    recent=hist[:3]; older=hist[3:6] or recent
    acc=mean(f(x["accuracy"]) for x in recent)
    wrong=mean(f(x.get("wrong_selections")) for x in recent)
    wrong_old=mean(f(x.get("wrong_selections")) for x in older)
    level=current or 2
    if acc>=0.85 and wrong<=wrong_old+0.3:
        level=min(5,level+1)
        reason=f"Recent accuracy on this activity is strong ({acc:.0%}), so the next round adds a little more challenge."
    elif acc<0.6 or wrong>wrong_old+1.5:
        level=max(1,level-1)
        reason=f"Recent accuracy is {acc:.0%} with more wrong selections than usual, so the next round eases up a little."
    else:
        reason=f"Recent accuracy is steady at {acc:.0%}, so the level stays the same for now."
    return {"level":level,"reason":reason,"confidence":"normal","sessions_seen":len(hist)}

# ---------- Engagement streak ----------
def get_streak(pid):
    days=set(get_play_days(pid,30))
    if not days:return 0
    streak=0; cursor=date.today()
    while cursor.isoformat() in days:
        streak+=1; cursor=cursor-timedelta(days=1)
    return streak

# ---------- Analysis / observations ----------
def analyze_patient(pid):
    s=get_sessions(pid,40)
    if not s:return {"status":"Not enough data yet","observations":[],"changes":[]}
    recent=s[:10]; older=s[10:20] or recent
    ra=mean(f(x["accuracy"]) for x in recent); oa=mean(f(x["accuracy"]) for x in older)
    rr=mean(f(x["avg_response"]) for x in recent); orr=mean(f(x["avg_response"]) for x in older)
    rw=mean(f(x.get("wrong_selections")) for x in recent); ow=mean(f(x.get("wrong_selections")) for x in older)
    obs=[]
    if ra<=oa-.08: obs.append(("Pattern Worth Observing","Recent accuracy is below the earlier baseline",f"Recent average accuracy is {ra:.0%}, compared with {oa:.0%} in the earlier window."))
    elif ra>=oa+.08: obs.append(("Improving","Recent accuracy is improving",f"Recent average accuracy is {ra:.0%}, up from {oa:.0%}."))
    else: obs.append(("Stable","Overall recent accuracy is relatively stable",f"Recent average accuracy is {ra:.0%}; comparison window is {oa:.0%}."))
    if orr and rr>orr*1.2: obs.append(("Small Change Noticed","Responses are taking longer",f"Average response time increased from {orr:.1f}s to {rr:.1f}s."))
    if rw>ow+1.5: obs.append(("Small Change Noticed","More incorrect selections recently",f"Recent sessions average {rw:.1f} wrong selections versus {ow:.1f} earlier."))

    games=get_game_breakdown(pid)
    if games:
        best=max(games,key=lambda x:f(x["accuracy"])); weak=min(games,key=lambda x:f(x["accuracy"]))
        obs.append(("AI Comparison",f"Strongest area: {best['game']}",f"Average accuracy is {f(best['accuracy']):.0%}. Lowest game average is {f(weak['accuracy']):.0%} in {weak['game']}."))

        # Per-game, error-type-aware trend: only speak up where there's enough of THIS
        # game's own history, and only name the specific skill involved (never a diagnosis).
        for g in games:
            hist=get_sessions_for_game(pid,g["game"],8)
            if len(hist)<4: continue
            half=len(hist)//2
            recent_g=hist[:half]; older_g=hist[half:]
            for err_field,domain in ERROR_DOMAIN_MAP.items():
                rv=mean(f(x.get(err_field)) for x in recent_g); ov=mean(f(x.get(err_field)) for x in older_g)
                if rv>ov+1.0 and rv>1.0:
                    obs.append(("Small Change Noticed",f"{g['game']}: worth a gentle look",f"In {g['game']}, recent sessions show more moments related to {domain} than earlier sessions ({rv:.1f} vs {ov:.1f} average). This is a pattern to watch, not a diagnosis."))
                    break  # one note per game keeps this readable

    streak=get_streak(pid)
    if streak>=3: obs.insert(0,("Engagement",f"{streak}-day activity streak",f"Activities have been played on {streak} days in a row, which is a good sign of steady engagement."))

    status="Pattern Worth Observing" if any(o[0]=="Pattern Worth Observing" for o in obs) else ("Small Change Noticed" if any(o[0]=="Small Change Noticed" for o in obs) else "Stable")
    return {"status":status,"observations":[{"level":a,"title":b,"detail":c} for a,b,c in obs],"baseline":{"recent_accuracy":ra,"usual_accuracy":oa,"recent_response":rr,"usual_response":orr},"streak":streak}

# ---------- Multi-factor recommendation ----------
def recommend_next_activity(pid):
    g=get_game_breakdown(pid)
    if not g:
        return {"game":"Memory Match","reason":"A simple first activity can help establish a personal baseline.","difficulty":2,"shortlist":[]}

    last_played=get_last_played_map(pid)
    now=datetime.now()
    last_game=None
    if last_played:
        last_game=max(last_played,key=lambda k:last_played[k])

    scored=[]
    for row in g:
        acc=f(row["accuracy"])
        weakness=1-acc  # 0 (mastered) .. 1 (struggling)
        last=last_played.get(row["game"])
        try: days_since=(now-datetime.fromisoformat(last)).days if last else 99
        except Exception: days_since=99
        staleness=min(1.0,days_since/7)  # spaced repetition: fully "due" after a week
        error_signal=0.0; error_note=None
        for err_field,domain in ERROR_DOMAIN_MAP.items():
            v=f(row.get(err_field))
            if v>1.2:
                error_signal=max(error_signal,min(1.0,v/4))
                error_note=domain
        variety_penalty=0.25 if row["game"]==last_game else 0.0
        score=(weakness*0.45)+(staleness*0.25)+(error_signal*0.30)-variety_penalty
        scored.append((score,row,days_since,error_note))

    scored.sort(key=lambda x:-x[0])
    top_score,top,days_since,error_note=scored[0]
    diff=compute_difficulty(pid,top["game"])

    acc=f(top["accuracy"])
    if error_note:
        reason=f"Recent sessions of {top['game']} show a few more moments involving {error_note}, so practicing it again can help — {diff['reason'].lower()}"
    elif acc<0.65:
        reason=f"{top['game']} is currently more challenging than the person's other activities ({acc:.0%} average), so the AI suggests another gentle opportunity to practice it. {diff['reason']}"
    elif days_since>=5:
        reason=f"It has been a while since {top['game']} was played, so revisiting it now helps keep the skill fresh. {diff['reason']}"
    else:
        reason=f"{top['game']} is currently a comfortable strength ({acc:.0%} average) and can be used as an engaging next activity. {diff['reason']}"

    shortlist=[{"game":row["game"],"accuracy":f(row["accuracy"])} for _,row,_,_ in scored[1:3]]
    return {"game":top["game"],"reason":reason,"difficulty":diff["level"],"shortlist":shortlist}
