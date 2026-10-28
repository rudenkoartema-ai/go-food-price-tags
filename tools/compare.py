import sys, subprocess
from PIL import Image
U='/mnt/user-data/uploads/'
B='/home/claude/go-food-price-tags/build/'
# render ours at the same scale as the references (1055 px wide)
subprocess.run(['pdftoppm','-scale-to-x','1055','-scale-to-y','1491','-png',B+'../samples/test_ref.pdf',B+'cmp'],check=True)
ours_L=Image.open(B+'cmp-1.png').convert('RGB')
ours_S=Image.open(B+'cmp-2.png').convert('RGB')
refL=Image.open(U+'Ценник_Чиабатта_69_грн.png').convert('RGB')
refS=Image.open(U+'Ценник_75___70лист_2.png').convert('RGB')
def pair(ref, ours, rbox, obox, out):
    a=ref.crop(rbox); b=ours.crop(obox)
    w=max(a.width,b.width); h=a.height+b.height+10
    im=Image.new('RGB',(w*1+0, h),(90,90,90))
    im.paste(a,(0,0)); im.paste(b,(0,a.height+10)); im.save(out)
# L: reference tag1 (54,97,516,539); ours tag1 at 10.7? compute from layout: find black bbox
import numpy as np
def bbox_first(img):
    arr=np.asarray(img).astype(int); m=(arr.max(axis=2)<40)
    from scipy import ndimage as ndi
    lab,n=ndi.label(m); objs=ndi.find_objects(lab)
    best=sorted([(s[0].start,s[1].start,s[0].stop,s[1].stop) for s,i in zip(objs,range(n)) if (s[0].stop-s[0].start)>200 and (s[1].stop-s[1].start)>300])
    return best[0]
y0,x0,y1,x1=bbox_first(ours_L); print('ours L tag1',(x0,y0,x1,y1),(x1-x0)/5.024,(y1-y0)/5.02)
pair(refL,ours_L,(54,97,516,539),(x0,y0,x1,y1),B+'cmpL.png')
y0,x0,y1,x1=bbox_first(ours_S); print('ours S tag1',(x0,y0,x1,y1),(x1-x0)/5.024,(y1-y0)/5.02)
pair(refS,ours_S,(93,137,507,465),(x0,y0,x1,y1),B+'cmpS.png')
