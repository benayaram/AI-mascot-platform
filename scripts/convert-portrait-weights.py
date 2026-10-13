"""Use restricted tensor loading to convert a checksum-verified MuseTalk checkpoint."""
import os
from pathlib import Path
import torch
from safetensors.torch import save_file
root=Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime'))/'models'/'musetalk'
weights=torch.load(root/'unet.pth',map_location='cpu',weights_only=True)
if not isinstance(weights,dict) or not all(isinstance(x,torch.Tensor) for x in weights.values()):raise ValueError('Tensor-only model checkpoint required')
save_file({k:v.contiguous() for k,v in weights.items()},root/'model.safetensors.tmp',metadata={'format':'pt'})
(root/'model.safetensors.tmp').replace(root/'model.safetensors')
print('Verified MuseTalk weights converted to safetensors')
