"""Conservative rendered-frame screening over the full 0.8-second window.
Any candidate blocks delivery until examined; zero candidates is not a semantic art review.
"""
import json, subprocess, sys
import numpy as np
W,H=108,192
result=subprocess.run(['ffmpeg','-v','error','-i',sys.argv[1],'-vf',f'fps=30,scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True,check=True)
F=np.frombuffer(result.stdout,np.uint8).reshape(-1,H,W).astype(np.int16)
candidates=[]
for t in range(1,len(F)-1):
 d=np.abs(F[t]-F[t-1]); changed=(d>40).mean()
 if changed<.004: continue
 for k in range(1,24):
  if t+k>=len(F):break
  back=np.abs(F[t+k]-F[t-1])
  if (back>40).mean()<changed*.15:
   candidates.append(round(t/30,3));break
print(json.dumps({'frames':len(F),'windowFrames':24,'candidates':candidates}))
