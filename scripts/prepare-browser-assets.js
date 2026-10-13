import {cpSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const runtime=process.env.BENAI_RUNTIME_DIR||'/workspace/benai-runtime';mkdirSync('public/runtime/vision',{recursive:true});cpSync('node_modules/@mediapipe/tasks-vision/wasm','public/runtime/vision',{recursive:true});const model=join(runtime,'models/face-landmarker.task');if(!existsSync(model))throw Error('Run the browser model download before preparing assets');copyFileSync(model,'public/runtime/face-landmarker.task');console.log('Self-hosted MediaPipe WASM and model assets prepared');

copyFileSync('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs','public/runtime/vision/vision_bundle.mjs');
