import sys,os,pickle
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np, cv2
from glyph_common import ROOT
d=pickle.load(open(os.path.join(ROOT,'build','glyphs_raw.pkl'),'rb'))
def render(inst,S=0.25,pad=40):
    ps=inst['polys']; allp=np.vstack([p for p,_ in ps])
    w=int(inst['w']*S)+2*pad; h=int(1500*S)+2*pad
    img=np.zeros((h,w),np.uint8)
    for p,hole in ps:
        q=np.stack([p[:,0]*S+pad, (1200-p[:,1])*S+pad],1).astype(np.int32)
        cv2.fillPoly(img,[q],0 if hole else 255)
    return img
def sheet(table,out,keys):
    tiles=[]
    for k in keys:
        if k not in table: continue
        best=max(table[k],key=lambda i:i['cap_px'])
        im=render(best); 
        t=np.zeros((420,330),np.uint8); t[:im.shape[0],:min(im.shape[1],330)]=im[:420,:330]
        cv2.putText(t,k,(5,415),cv2.FONT_HERSHEY_SIMPLEX,0.6,255,1)  # ascii only
        tiles.append(t)
    cols=8; rows=(len(tiles)+cols-1)//cols
    S=np.zeros((rows*420,cols*330),np.uint8)
    for i,t in enumerate(tiles): S[(i//cols)*420:(i//cols+1)*420,(i%cols)*330:(i%cols+1)*330]=t
    cv2.imwrite(out,255-S)
sc='/tmp/claude-0/-home-claude/526cf247-ef25-5533-afc4-cd4c268c5e7f/scratchpad/work/'
sheet(d['glyphs'],sc+'glyphs_letters.png',sorted(d['glyphs']))
sheet(d['digs'],sc+'glyphs_digits.png',sorted(d['digs']))
