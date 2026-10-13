"""Local-only Piper + Whisper service. No paid APIs or credentials required."""
import io, json, os, threading, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from piper import PiperVoice, SynthesisConfig
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
voice=PiperVoice.load(os.environ['PIPER_MODEL'])
male=PiperVoice.load(os.environ['PIPER_MALE_MODEL']) if os.getenv('PIPER_MALE_MODEL') else voice
whisper=WhisperModel(os.environ['WHISPER_MODEL'],device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
lock=threading.Lock()
slots=threading.BoundedSemaphore(8)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,status,data,kind='application/json'):
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  self.send(200,b'{"status":"ok","tts":"piper","stt":"whisper-tiny.en"}')
 def do_POST(self):
  queued=False
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<1 or length>10*1024*1024:raise ValueError('Audio or text payload is too large')
   body=self.rfile.read(length)
   queued=slots.acquire(blocking=False)
   if not queued:self.send(429,b'{"error":"Speech queue is full; please try again"}');return
   if not lock.acquire(timeout=5):self.send(429,b'{"error":"Speech engine is busy; please try again"}');return
   try:
    if self.path=='/tts':
     data=json.loads(body);text=data.get('text','')
     if not text or len(text)>4000:raise ValueError('Text must contain 1–4000 characters')
     scales={'coral':1,'alloy':.92,'ash':1.08,'sage':1.15,'verse':.88}
     output=io.BytesIO()
     with wave.open(output,'wb') as wav:(male if data.get('voice')=='ash' else voice).synthesize_wav(text,wav,syn_config=SynthesisConfig(length_scale=scales.get(data.get('voice'),1)))
     self.send(200,output.getvalue(),'audio/wav')
    elif self.path=='/transcribe':
     samples=decode_audio(io.BytesIO(body),sampling_rate=16000)
     if len(samples)>16000*31:raise ValueError('Voice recordings must be 30 seconds or shorter')
     segments,_=whisper.transcribe(samples,beam_size=1,language='en')
     self.send(200,json.dumps({'text':' '.join(s.text.strip() for s in segments)}).encode())
    else:self.send(404,b'{"error":"Endpoint not found"}')
   finally:lock.release()
  except Exception:
   self.send(400,b'{"error":"Speech input could not be processed. Check the recording format, length, or text."}')
  finally:
   if queued:slots.release()
print('BENAI local speech service ready',flush=True)
ThreadingHTTPServer(('127.0.0.1',int(os.getenv('SPEECH_PORT','8082'))),Handler).serve_forever()
