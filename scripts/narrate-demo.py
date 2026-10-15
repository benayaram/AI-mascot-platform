"""Add an explanatory local-Piper voiceover; the recorded screen stays unchanged."""
import json,subprocess,tempfile,urllib.request
from pathlib import Path
text='''BENAI version four is running with local models. Private reference documents ground an assistant's answers. Customers choose the language, answer model and voice in their workspace settings. The offline multilingual voice supports Telugu with robotic sound. Natural voices can use customer owned provider keys. In institute mode, a teacher edits each scene, adds teaching points, and uploads supporting video. The preview shows the lesson layout. Export runs the real speech and avatar workers, then Remotion renders the visuals. This wait is the actual CPU export, not a simulated progress screen. The completed lesson combines narration, an explaining avatar, motion graphics and the uploaded clip. Captions and the MP4 can be downloaded. Students can ask questions about the lesson and generate a spoken explanation. Customer APIs connect this flow to an institute's platform. Fast portrait animation is affordable. Neural lips remain slow on CPU and are demonstrated in a separate sample. This release supports a supervised pilot, with the documented quality and provider validation limits.'''
request=urllib.request.Request('http://127.0.0.1:8082/tts',data=json.dumps({'text':text,'voice':'coral'}).encode(),headers={'Content-Type':'application/json'})
with tempfile.TemporaryDirectory(prefix='benai-narration-') as folder:
 audio=Path(folder)/'narration.wav';audio.write_bytes(urllib.request.urlopen(request,timeout=60).read())
 source=Path('docs/demo/v4-walkthrough.mp4');target=source.with_name('v4-walkthrough-narrated.mp4')
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(source),'-i',str(audio),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-af','apad','-shortest','-movflags','+faststart',str(target)],check=True,timeout=120)
 target.replace(source)
print('Explanatory voiceover added; screen recording unchanged.')
