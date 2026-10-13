"""Generate original, fictional portraits with the running local diffusion model."""
import json,base64,urllib.request
from pathlib import Path
portraits=[('amara','A fictional adult woman with dark skin and soft natural curly hair, warm brown eyes, navy professional shirt, natural relaxed expression, photorealistic'),('milo','A fictional adult man with straight dark hair and light brown skin, dark eyes, grey casual shirt, friendly neutral expression, photorealistic'),('elena','A fictional adult woman with shoulder-length brown hair, light skin, green eyes, cream shirt, relaxed neutral expression, photorealistic')]
root=Path(__file__).resolve().parent.parent/'public'/'realistic';root.mkdir(exist_ok=True)
for name,prompt in portraits:
 file=root/(name+'.png')
 if file.exists():print('Preserving existing portrait:',name,flush=True);continue
 request=urllib.request.Request('http://127.0.0.1:8083/sdapi/v1/txt2img',headers={'Content-Type':'application/json'},data=json.dumps({'prompt':prompt,'style':'realistic'}).encode())
 with urllib.request.urlopen(request,timeout=180) as response:data=json.load(response)
 file.write_bytes(base64.b64decode(data['images'][0]));print('Original synthetic portrait generated:',name,flush=True)
