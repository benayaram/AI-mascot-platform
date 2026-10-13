"""Fast CPU audio-driven image warp. No neural-frame synthesis or phoneme visemes."""
import base64,io,math,subprocess,tempfile,time,wave
from pathlib import Path
import cv2,numpy as np
cv2.setNumThreads(1)
from PIL import Image
import mediapipe as mp

def render_fast(data,landmarker,face_lock):
 start=time.perf_counter();fps=24
 image=Image.open(io.BytesIO(base64.b64decode(data['image'],validate=True))).convert('RGB');image.thumbnail((640,640));image=image.crop((0,0,image.width//2*2,image.height//2*2));pixels=np.asarray(image)
 with face_lock: result=landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=pixels))
 if len(result.face_landmarks)!=1:raise ValueError('Use a clear front-facing portrait with one visible face')
 points=result.face_landmarks[0];cx=(points[13].x+points[14].x)*image.width/2;cy=(points[13].y+points[14].y)*image.height/2
 yy,xx=np.mgrid[:image.height,:image.width].astype(np.float32);dx=xx-cx;dy=yy-cy
 influence=np.exp(-((dx/(image.width*.13))**2+(dy/(image.height*.09))**2));displacement=np.where(dy>=0,image.height*.022,-image.height*.007)*influence
 with tempfile.TemporaryDirectory(prefix='benai-fast-') as folder:
  audio=Path(folder)/'speech.wav';audio.write_bytes(base64.b64decode(data['audio'],validate=True));normalized=Path(folder)/'normalized.wav'
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(audio),'-ac','1','-ar','12000',str(normalized)],check=True,timeout=20)
  with wave.open(str(normalized),'rb') as w:duration=w.getnframes()/12000;samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768
  if not .2<=duration<=60:raise ValueError('This fast renderer accepts scripts up to 60 seconds')
  output=Path(folder)/'portrait.mp4';level=0
  for frame in range(math.ceil(duration*fps)):
   part=samples[int(frame*12000/fps):int((frame+1)*12000/fps)];amplitude=min(1,float(np.sqrt(np.mean(part**2))) * 12) if len(part) else 0;level=level*.45+amplitude*.55
   warped=cv2.remap(pixels,(xx-dx*.035*level*influence).astype(np.float32),(yy-displacement*level).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
   cv2.imwrite(str(Path(folder)/f'frame-{frame:05d}.png'),cv2.cvtColor(warped,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_PNG_COMPRESSION,1])
  subprocess.run(['ffmpeg','-y','-v','error','-filter_threads','1','-framerate',str(fps),'-i',str(Path(folder)/'frame-%05d.png'),'-i',str(normalized),'-c:v','libx264','-preset','ultrafast','-crf','23','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',str(output)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,timeout=120)
  return {'video':base64.b64encode(output.read_bytes()).decode(),'duration':duration,'render_ms':round((time.perf_counter()-start)*1000),'fps':fps,'model':'BENAI-audio-driven-warp','device':'cpu','quality':'fast'}
