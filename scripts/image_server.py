"""Local CPU diffusion service. Official Segmind Tiny-SD, offline model loading."""
import base64, io, json, os, threading, torch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from diffusers import DiffusionPipeline
from pathlib import Path
torch.set_num_threads(int(os.getenv('BENAI_IMAGE_THREADS','4')))
model=Path(os.environ['BENAI_IMAGE_MODEL']).resolve()
pipeline=DiffusionPipeline.from_pretrained(model,torch_dtype=torch.float32,local_files_only=True,use_safetensors=True)
pipeline.enable_attention_slicing()
lock=threading.Lock()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  data=b'{"status":"ok","model":"segmind/tiny-sd","device":"cpu"}';self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  status=200;data={};acquired=False
  try:
   if self.path!='/sdapi/v1/txt2img':raise ValueError('Unknown image endpoint')
   length=int(self.headers.get('Content-Length','0'))
   if length<1 or length>20000:raise ValueError('Invalid prompt payload')
   request=json.loads(self.rfile.read(length));prompt=request.get('prompt','')
   if len(prompt)<10 or len(prompt)>2000:raise ValueError('Prompt must be 10–2000 characters')
   acquired=lock.acquire(blocking=False)
   if not acquired:status=429;data={'error':'Image generator is busy'}
   else:
    prefix=('Professional photographic head and shoulders portrait of an entirely fictional adult, face centered, looking straight at camera, natural skin texture, neutral expression, studio lighting, plain background. ' if request.get('style')=='realistic' else 'A friendly original avatar portrait, polished character illustration, centered face, soft clean background. ');result=pipeline(prompt=prefix+prompt,negative_prompt='blurry, deformed, low quality, text, watermark',num_inference_steps=15,guidance_scale=7,width=384,height=384)
    output=io.BytesIO();result.images[0].save(output,format='PNG');data={'images':[base64.b64encode(output.getvalue()).decode()],'model':'segmind/tiny-sd'}
  except Exception as e:
   print('Image generation failed:',type(e).__name__,flush=True);status=400;data={'error':'Image generation failed. Check the prompt and local model.'}
  finally:
   if acquired:lock.release()
  encoded=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
print('BENAI local image service ready',flush=True)
ThreadingHTTPServer(('127.0.0.1',int(os.getenv('IMAGE_PORT','8083'))),Handler).serve_forever()
