"""Self-hosted MuseTalk 1.5 inference. No external API keys. Loopback only.
Preprocessing implements the published masked/ref VAE + Whisper/UNet method.
The CPU path is queued offline rendering; GPU throughput must be benchmarked.
"""
import base64,io,json,math,os,subprocess,tempfile,threading,time,wave
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import numpy as np
import torch
from PIL import Image,ImageDraw,ImageFilter
from diffusers import AutoencoderKL,UNet2DConditionModel
from safetensors.torch import load_file
from transformers import WhisperFeatureExtractor,WhisperModel
import mediapipe as mp
from mediapipe.tasks import python as tasks
from mediapipe.tasks.python import vision
root=Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime'))/'models'
device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
dtype=torch.float16 if device.type=='cuda' else torch.float32
torch.set_num_threads(int(os.getenv('BENAI_PORTRAIT_THREADS','4')))
vae=AutoencoderKL.from_pretrained(root/'portrait-vae',local_files_only=True,use_safetensors=True).to(device,dtype).eval()
config=json.loads((root/'musetalk'/'musetalk.json').read_text())
unet=UNet2DConditionModel.from_config(config)
unet.load_state_dict(load_file(root/'musetalk'/'model.safetensors'))
unet=unet.to(device,dtype).eval()
whisper=WhisperModel.from_pretrained(root/'whisper-encoder',local_files_only=True,use_safetensors=True).to(device,dtype).eval()
extractor=WhisperFeatureExtractor.from_pretrained(root/'whisper-encoder',local_files_only=True)
landmarker=vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=tasks.BaseOptions(model_asset_path=str(root/'face-landmarker.task')),num_faces=2))
lock=threading.Lock()
def render(data):
 start=time.perf_counter();fps=25 if device.type=='cuda' else 12
 image=Image.open(io.BytesIO(base64.b64decode(data['image'],validate=True))).convert('RGB');image.thumbnail((640,640))
 # A real face model determines the crop; reject absent/ambiguous portraits.
 result=landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=np.asarray(image)))
 if len(result.face_landmarks)!=1:raise ValueError('Use a clear front-facing portrait with one visible face')
 points=result.face_landmarks[0];xs=[p.x for p in points];ys=[p.y for p in points]
 cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2;size=max((max(xs)-min(xs))*image.width,(max(ys)-min(ys))*image.height)*1.12
 x1=max(0,round(cx*image.width-size/2));y1=max(0,round(cy*image.height-size/2));x2=min(image.width,round(cx*image.width+size/2));y2=min(image.height,round(cy*image.height+size/2));box=(x1,y1,x2,y2)
 face=image.crop(box).resize((256,256),Image.Resampling.LANCZOS)
 audio=base64.b64decode(data['audio'],validate=True)
 with tempfile.TemporaryDirectory(prefix='benai-neural-') as folder:
  original=Path(folder)/'input.wav';original.write_bytes(audio);normalized=Path(folder)/'speech.wav'
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(original),'-ac','1','-ar','16000',str(normalized)],check=True,timeout=20)
  with wave.open(str(normalized),'rb') as w:
   duration=w.getnframes()/16000;samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768
  maximum=30 if device.type=='cuda' else 6
  if not 0.2<=duration<=maximum:raise ValueError(f'This {device.type} neural renderer accepts clips up to {maximum} seconds. Shorten the script.')
  features=extractor(samples,sampling_rate=16000,return_tensors='pt').input_features.to(device,dtype)
  rgb=np.asarray(face,dtype=np.float32)/255
  ref=torch.from_numpy(rgb.transpose(2,0,1)).unsqueeze(0).to(device,dtype)
  masked=ref.clone();masked[:,:,128:,:]=0
  with torch.inference_mode():
   latent=torch.cat([vae.encode(masked*2-1).latent_dist.mode(),vae.encode(ref*2-1).latent_dist.mode()],dim=1)*vae.config.scaling_factor
   hidden=whisper.encoder(features,output_hidden_states=True).hidden_states
   hidden=torch.stack(hidden,dim=2)[:,:math.floor(duration*50)]
   padding=math.ceil(50/fps)*2
   hidden=torch.cat([torch.zeros_like(hidden[:,:padding]),hidden,torch.zeros_like(hidden[:,:padding*3])],dim=1)
   seq=torch.arange(50,device=device).unsqueeze(1);div=torch.exp(torch.arange(0,384,2,device=device)*(-math.log(10000)/384));pe=torch.zeros(50,384,device=device,dtype=dtype);pe[:,0::2]=torch.sin(seq*div);pe[:,1::2]=torch.cos(seq*div)
   output=Path(folder)/'portrait.mp4'
   encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{image.width//2*2}x{image.height//2*2}','-r',str(fps),'-i','pipe:0','-i',str(normalized),'-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',str(output)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
   mask=Image.new('L',(x2-x1,y2-y1));draw=ImageDraw.Draw(mask);draw.rounded_rectangle((.04*mask.width,.4*mask.height,.96*mask.width,.98*mask.height),radius=.15*mask.width,fill=255);mask=mask.filter(ImageFilter.GaussianBlur(max(2,mask.width*.035)))
   try:
    for frame in range(math.ceil(duration*fps)):
     offset=math.floor(frame*50/fps);chunk=hidden[:,offset:offset+10].reshape(1,50,384)+pe
     if frame%12==0:print('Neural frames:',frame,'elapsed seconds:',round(time.perf_counter()-start,1),flush=True)
     prediction=unet(latent,torch.zeros(1,device=device,dtype=torch.long),encoder_hidden_states=chunk).sample
     pixels=(vae.decode(prediction/vae.config.scaling_factor).sample/2+.5).clamp(0,1)[0].permute(1,2,0).float().cpu().numpy()
     generated=Image.fromarray(np.round(pixels*255).astype(np.uint8)).resize((x2-x1,y2-y1),Image.Resampling.LANCZOS)
     composed=image.copy();composed.paste(generated,(x1,y1),mask);composed=composed.crop((0,0,image.width//2*2,image.height//2*2));encoder.stdin.write(composed.tobytes())
    encoder.stdin.close();error=encoder.stderr.read();encoder.wait(timeout=30)
    if encoder.returncode:raise RuntimeError('Video encoding failed')
   except Exception:
    encoder.kill();encoder.wait();raise
  return {'video':base64.b64encode(output.read_bytes()).decode(),'duration':duration,'render_ms':round((time.perf_counter()-start)*1000),'fps':fps,'model':'MuseTalk-1.5','device':device.type}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,status,body):
  encoded=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
 def do_GET(self):self.send(200,{'status':'ok','model':'MuseTalk-1.5','device':device.type,'realtime_neural':False,'max_seconds':30 if device.type=='cuda' else 6,'busy':lock.locked()})
 def do_POST(self):
  if self.path!='/render':self.send(404,{'error':'Endpoint not found'});return
  length=int(self.headers.get('Content-Length','0'))
  if not 0<length<12*1024*1024:self.send(413,{'error':'Payload too large'});return
  if not lock.acquire(blocking=False):self.send(429,{'error':'Neural renderer is busy'});return
  try:self.send(200,render(json.loads(self.rfile.read(length))))
  except ValueError as e:self.send(422,{'error':str(e)})
  except Exception as e:print('Neural render failure:',type(e).__name__,str(e)[:200],flush=True);self.send(500,{'error':'Local neural renderer failed. Check the worker log.'})
  finally:lock.release()
print(f'BENAI neural portrait service ready ({device.type})',flush=True)
ThreadingHTTPServer(('127.0.0.1',int(os.getenv('PORTRAIT_PORT','8084'))),Handler).serve_forever()
