"""Loopback speech worker: Piper English, multilingual Whisper, opt-in Edge TTS."""
import asyncio,io,json,os,ssl,subprocess,tempfile,threading,wave
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from piper import PiperVoice,SynthesisConfig
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
voice=PiperVoice.load(os.environ['PIPER_MODEL'])
male=PiperVoice.load(os.environ['PIPER_MALE_MODEL']) if os.getenv('PIPER_MALE_MODEL') else voice
whisper=WhisperModel(os.environ['WHISPER_MODEL'],device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
multilingual=None
multi_path=os.getenv('MULTILINGUAL_WHISPER_MODEL',str(Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime'))/'models/whisper-multilingual'))
lock=threading.Lock();slots=threading.BoundedSemaphore(8)
async def edge_audio(text,selected):
 import edge_tts,certifi
 # edge-tts creates its own certifi SSL context. Honor the operator's trusted CA bundle.
 if os.getenv('SSL_CERT_FILE'):certifi.where=lambda:os.environ['SSL_CERT_FILE']
 with tempfile.TemporaryDirectory(prefix='benai-edge-') as folder:
  mp3=Path(folder)/'speech.mp3';wav=Path(folder)/'speech.wav'
  await edge_tts.Communicate(text,selected,proxy=os.getenv('HTTPS_PROXY'),connect_timeout=10,receive_timeout=30).save(str(mp3))
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(mp3),'-ac','1','-ar','24000',str(wav)],check=True,timeout=30)
  return wav.read_bytes()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,status,data,kind='application/json'):
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  self.send(200,json.dumps({'status':'ok','tts':'piper','stt':'whisper-tiny.en','multilingual_available':Path(multi_path,'model.bin').exists(),'edge_enabled':os.getenv('ENABLE_EDGE_TTS')=='true'}).encode())
 def do_POST(self):
  global multilingual
  queued=False
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<=10*1024*1024:raise ValueError('Payload must contain 1–10 MB')
   body=self.rfile.read(length);queued=slots.acquire(blocking=False)
   if not queued:self.send(429,b'{"error":"Speech queue is full; try again"}');return
   if not lock.acquire(timeout=5):self.send(429,b'{"error":"Speech engine is busy; try again"}');return
   try:
    if self.path in ('/tts','/tts-edge','/tts-espeak'):
     data=json.loads(body);text=data.get('text','')
     if not text or len(text)>4000:raise ValueError('Text must contain 1–4000 characters')
     if self.path=='/tts-espeak':
      import shutil
      base=Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime'))/'espeak'
      binary=os.getenv('ESPEAK_NG_BIN') or shutil.which('espeak-ng') or str(base/'usr/bin/espeak-ng')
      language=data.get('language','te')
      if language not in ('en','te','hi','ta','kn','es'):raise ValueError('Select a supported language')
      env=dict(os.environ);lib=base/'usr/lib/x86_64-linux-gnu';args=[binary]
      if lib.exists():env['LD_LIBRARY_PATH']=str(lib)+((':'+env['LD_LIBRARY_PATH']) if env.get('LD_LIBRARY_PATH') else '');args+=['--path='+str(lib)]
      with tempfile.TemporaryDirectory(prefix='benai-espeak-') as folder:
       wav=Path(folder)/'speech.wav'
       subprocess.run(args+['-v',language,'-s','145','-w',str(wav),'--stdin'],input=text.encode(),env=env,check=True,timeout=25,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
       self.send(200,wav.read_bytes(),'audio/wav')
     elif self.path=='/tts-edge':
      if os.getenv('ENABLE_EDGE_TTS')!='true':raise ValueError('Edge TTS is disabled')
      allowed=['te-IN-ShrutiNeural','te-IN-MohanNeural','hi-IN-SwaraNeural','en-US-AriaNeural','ta-IN-PallaviNeural','kn-IN-SapnaNeural']
      if data.get('voice') not in allowed:raise ValueError('Select a supported Edge voice')
      try:self.send(200,asyncio.run(edge_audio(text,data['voice'])),'audio/wav')
      except Exception as e:print('Edge unavailable:',type(e).__name__,flush=True);self.send(502,b'{"error":"Experimental Edge service unavailable; use an official provider"}')
     else:
      output=io.BytesIO();scales={'coral':1,'alloy':.92,'ash':1.08,'sage':1.15,'verse':.88}
      with wave.open(output,'wb') as wav:(male if data.get('voice')=='ash' else voice).synthesize_wav(text,wav,syn_config=SynthesisConfig(length_scale=scales.get(data.get('voice'),1)))
      self.send(200,output.getvalue(),'audio/wav')
    elif self.path=='/transcribe':
     samples=decode_audio(io.BytesIO(body),sampling_rate=16000)
     if len(samples)>16000*31:raise ValueError('Voice recordings must be 30 seconds or shorter')
     language=self.headers.get('X-Language','en')
     if language not in ('en','te','hi','ta','kn','es','auto'):raise ValueError('Unsupported recognition language')
     engine=whisper
     if language!='en':
      if not Path(multi_path,'model.bin').exists():raise ValueError('Install multilingual speech models with scripts/setup-local.sh')
      if multilingual is None:multilingual=WhisperModel(multi_path,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
      engine=multilingual
     segments,info=engine.transcribe(samples,beam_size=1,language=None if language=='auto' else language)
     self.send(200,json.dumps({'text':' '.join(s.text.strip() for s in segments),'language':info.language,'model':'whisper-small' if engine is multilingual else 'whisper-tiny.en'}).encode())
    else:self.send(404,b'{"error":"Endpoint not found"}')
   finally:lock.release()
  except ValueError as e:self.send(422,json.dumps({'error':str(e)[:200]}).encode())
  except Exception:self.send(400,b'{"error":"Speech input could not be processed. Check recording format, length or text."}')
  finally:
   if queued:slots.release()
print('BENAI speech worker ready',flush=True)
ThreadingHTTPServer(('127.0.0.1',int(os.getenv('SPEECH_PORT','8082'))),Handler).serve_forever()
