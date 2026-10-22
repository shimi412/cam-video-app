"""usage: python3 timing.py <wav> <out.json> — minutage mot à mot + phrases du script (Whisper medium)."""
import json, re, subprocess, sys
wav, out = sys.argv[1], sys.argv[2]
subprocess.run(['ffmpeg','-v','error','-y','-i',wav,'-ar','16000','-ac','1','/tmp/_t.wav'],check=True)
subprocess.run(['whisper-cli','-m','/Users/shimi/.cache/hyperframes/whisper/models/ggml-medium.bin','-l','en','-f','/tmp/_t.wav','-ml','1','-sow','-oj','-of','/tmp/_t','-np'],check=True,capture_output=True)
d=json.load(open('/tmp/_t.json'))
words=[(s['offsets']['from']/1000,s['offsets']['to']/1000,s['text'].strip()) for s in d['transcription'] if s['text'].strip()]
script=json.load(open("script.json"))
norm=lambda x: re.sub(r"[^a-z0-9]","",x.lower())
stream=norm("".join(w[2] for w in words)); pos=[];acc=0
for w in words:
    n=len(norm(w[2])); pos.append((acc,acc+n,w)); acc+=n
outp=[];c=0
for i,s in enumerate(script,1):
    k=norm(s); st=-1
    for L in (12,8,5):
        st=stream.find(k[:L],c)
        if st>=0: break
    if st<0: st=c
    en=st+len(k)
    ws=[p for p in pos if p[1]>st and p[0]<en]; c=en
    outp.append({"phrase":i,"start":round(ws[0][2][0],2),"end":round(ws[-1][2][1],2),"text":s})
    print(f"{i:2d} {ws[0][2][0]:6.2f} -> {ws[-1][2][1]:6.2f}  {s}")
dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',wav]))
json.dump({"file":wav.split('/')[-1],"duration":dur,"phrases":outp,"words":[{"start":a,"end":b,"word":t} for a,b,t in words]},open(out,'w'),indent=1,ensure_ascii=False)
print("durée", dur, "mots", len(words))
