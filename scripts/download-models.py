"""Download pinned official artifacts with TLS and SHA-256 verification."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
root=Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime')).resolve()
root.mkdir(parents=True,exist_ok=True)
manifest=json.loads(Path(__file__).with_name(sys.argv[1] if len(sys.argv)>1 else 'models-manifest.json').read_text())
for artifact in manifest['artifacts']:
 target=root/artifact['path'];target.parent.mkdir(parents=True,exist_ok=True)
 def digest(path):
  h=hashlib.sha256()
  with open(path,'rb') as f:
   for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
  return h.hexdigest()
 def verify(path):
  if artifact.get('sha256'):return digest(path)==artifact['sha256']
  data=Path(path).read_bytes();return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==artifact['blobId']
 if target.exists() and verify(target):
  print('Verified cached artifact:',target.name);continue
 fd,tmp=tempfile.mkstemp(dir=target.parent);os.close(fd)
 try:
  subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','300',artifact['url'],'--output',tmp],check=True)
  if not verify(tmp):raise RuntimeError('Checksum mismatch: '+target.name)
  os.replace(tmp,target);print('Downloaded and verified:',target.name)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
