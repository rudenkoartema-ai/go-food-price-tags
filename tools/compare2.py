import sys, os, subprocess, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from glyph_common import *
SC='/tmp/claude-0/-home-claude/526cf247-ef25-5533-afc4-cd4c268c5e7f/scratchpad/work/'
CASES=[('L1',0,'ЧІАБАТА','69','L'),('L2',0,'КРУАСАН КУРКА СИР','69','L'),('SA',0,'ШОКОСЕНДВІЧ','29','S'),('SA',1,'КРУАСАН З НАЧИНКОЮ','35','S'),
 ('SA',4,'МАКАРОНС','65','S'),('SB',0,'ЕКЛЕР','45','S'),('SB',1,'ПЕЧИВО З ПЕРЕДБАЧЕННЯМ','17','S'),('SB',5,'ЖЕЛЕЙНІ ЦУКЕРКИ','99','S')]
if len(sys.argv)>1: CASES=[c for c in CASES if c[0]+str(c[1]) in sys.argv[1:]]
rows=[]
for k,i,n,p,f in CASES:
    rows.append(dict(name=n,price=p,format=f,qty='1'))
tiles=[]
for k,i,n,p,f in CASES:
    out=SC+'one.pdf'
    subprocess.run(['node','tools/make_pdf.js',out,json.dumps([dict(name=n,price=p,format=f,qty='1')],ensure_ascii=False)],check=True,capture_output=True)
    subprocess.run(['pdftoppm','-r','200','-png','-singlefile',out,SC+'one'],check=True)
    im=Image.open(SC+'one.png').convert('RGB'); a=np.asarray(im).astype(int)
    m=a.max(axis=2)<30
    lab,nn=ndi.label(m); sl=max(ndi.find_objects(lab),key=lambda s:(s[0].stop-s[0].start)*(s[1].stop-s[1].start))
    ours=im.crop((sl[1].start,sl[0].start,sl[1].stop,sl[0].stop))
    arr,pxmm=tag_array(k,i); ref=Image.fromarray(arr.astype(np.uint8))
    W=560; H=int(W*ref.height/ref.width)
    t=Image.new('RGB',(W*2+10,H),(90,90,90)); t.paste(ref.resize((W,H),Image.LANCZOS),(0,0)); t.paste(ours.resize((W,H),Image.LANCZOS),(W+10,0))
    tiles.append(t)
for j in range(0,len(tiles),2):
    g=tiles[j:j+2]; S=Image.new('RGB',(tiles[0].width,sum(t.height for t in g)+10*(len(g)-1)),(40,40,40)); y=0
    for t in g: S.paste(t,(0,y)); y+=t.height+10
    S.save(SC+'cmp%d.png'%(j//2))
print(len(tiles))
