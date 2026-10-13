# BENAI Avatar SDK

The standalone module is served at `/sdk.js`. It renders the original SVG rigs, supports glasses and colors, receives audio or a MediaStream, animates the mouth from audio amplitude, and emits state events. It does not implement a phoneme/viseme engine. Rendering cadence follows the browser and device; no fixed 120 fps guarantee is made.

```html
<div id="avatar" style="width:280px;height:280px"></div>
<script type="module">
  import { BENAIAvatar } from "/sdk.js";
  const avatar = new BENAIAvatar(document.querySelector("#avatar"), {
    name: "Nova",
    image: "/avatars/nova.svg",
    gesture: true,
    glasses: true,
    suitColor: "#7255e9",
    hairColor: "#534064",
  });
  avatar.on("ready", () => console.log("Character loaded"));
  avatar.on("state", (state) => console.log(state));
  avatar.on("error", (error) => console.error(error));
  // After a user gesture, pass audio obtained by YOUR SERVER using a BENAI key:
  // await avatar.speak('/your-server/generated-voice.wav');
  // Or use an incoming realtime voice-agent MediaStream:
  // await avatar.connectStream(remoteMediaStream);
  // avatar.setAppearance({ glasses: false, suitColor: '#333344' });
  // avatar.stop();
  // avatar.destroy(); // releases audio context, RAF callbacks, DOM, and events
</script>
```

Host the module and avatar assets with your frontend, or serve the avatar assets from a CORS-enabled origin. Our original `/avatars` assets have public CORS headers. The public REST API deliberately does not allow arbitrary browser-origin access with secret account keys. Use your server or the scoped iframe widget for that integration.

`connectStream()` connects the stream to audio playback; do not route it to speakers a second time elsewhere. A user gesture may be required to unlock AudioContext playback. Raster avatars display an image and cannot have the SVG mouth modified. The SDK rejects scripted/externally referenced SVG elements rather than executing arbitrary uploaded markup.
