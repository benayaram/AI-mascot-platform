"""Convert publisher-verified tensor checkpoints using restricted weights-only loading."""
import os
from pathlib import Path
import torch
from safetensors.torch import save_file
root=Path(os.getenv('BENAI_RUNTIME_DIR','/workspace/benai-runtime'))/'models'/'tiny-sd'
for relative,target in [('text_encoder/pytorch_model.bin','text_encoder/model.safetensors'),('unet/diffusion_pytorch_model.bin','unet/diffusion_pytorch_model.safetensors'),('vae/diffusion_pytorch_model.bin','vae/diffusion_pytorch_model.safetensors')]:
 data=torch.load(root/relative,map_location='cpu',weights_only=True)
 if not isinstance(data,dict) or not all(isinstance(value,torch.Tensor) for value in data.values()):raise ValueError('Expected a tensor-only checkpoint')
 temporary=root/(target+'.tmp')
 save_file({key:value.contiguous() for key,value in data.items()},temporary,metadata={'format':'pt'})
 temporary.replace(root/target)
 print('Converted verified checkpoint:',target)
 del data
