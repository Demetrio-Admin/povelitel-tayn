import numpy as np
from PIL import Image
D='out2/'
def load(k): return np.array(Image.open(D+k+'.png').convert('RGBA')).astype(np.float32)
def save(k,a): Image.fromarray(np.clip(a,0,255).astype(np.uint8)).save(D+k+'.png')
# dry_bush: белые остатки фона
a=load('dry_bush_01'); r,g,b,al=a[...,0],a[...,1],a[...,2],a[...,3]
mn=np.minimum(np.minimum(r,g),b); mx=np.maximum(np.maximum(r,g),b)
w=(mn>185)&(mx-mn<40)
print('dry white px',int(w.sum())); a[w,3]=0; save('dry_bush_01',a)
# mushroom_red: белые дыры между ножками (ножки кремовые — режем только очень белое)
a=load('mushroom_red_01'); r,g,b=a[...,0],a[...,1],a[...,2]
mn=np.minimum(np.minimum(r,g),b); mx=np.maximum(np.maximum(r,g),b)
w=(mn>235)&(mx-mn<14); print('mush white px',int(w.sum()))
# тёплое свечение вместо розового у огней
for k in ['candle_group_01','lantern_01','lantern_02','torch_01','fire_circle_01']:
    a=load(k); r,g,b,al=a[...,0],a[...,1],a[...,2],a[...,3]
    m=(r>g+25)&(b>g+15)&(al<250)
    a[m,0]=255; a[m,1]=176; a[m,2]=96
    print(k,'pink px',int(m.sum())); save(k,a)
