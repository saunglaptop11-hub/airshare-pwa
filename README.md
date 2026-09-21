# AirShare PWA 🚀

> **Zero-storage, peer-to-peer local file & text transfer Progressive Web Application.**  
> Powered by WebRTC `RTCDataChannel`, a lightweight Node.js WebSocket signaling relay, and Tailwind CSS Neo-Minimalism.

---

## 🌟 Core Architecture & Guarantees

1. **Zero Cloud Storage**:  
   File binary chunks and text drop content NEVER touch or pass through the server. All transfer occurs strictly peer-to-peer over an encrypted WebRTC `RTCDataChannel`.

2. **Memory-Safe 64KB Slicing & Backpressure**:  
   Files of any size are read incrementally using `Blob.slice()` in 64KB chunks (`ArrayBuffer`). The sender monitors `RTCDataChannel.bufferedAmount` against a 64KB threshold, pausing transmission until the channel buffer drains via `onbufferedamountlow`. This prevents browser memory spikes or tab crashes even for multi-gigabyte files.

3. **Ephemeral Room Management with PIN Auth**:  
   The Node.js WebSocket signaling relay assigns 6-character clean room codes and requires a 4-digit PIN for pairing. Each room is strictly limited to 2 peers and self-destructs automatically once both peers leave.

4. **Progressive Web App (PWA)**:  
   Configured with `vite-plugin-pwa` for offline asset caching, service worker background update, app manifest, and native install prompts.

5. **Neo-Minimalism Design System**:  
   Pure Tailwind CSS using neutral/zinc palettes (`bg-zinc-50` / `bg-zinc-950`), rounded-2xl cards, soft shadows, crisp borders, dark/light theme toggle, and micro-animations.

---

## 📁 Project Structure

```
airshare-pwa/
├── client/
│   ├── public/
│   │   ├── logo.svg
│   │   ├── pwa-192x192.png
│   │   ├── pwa-512x512.png
│   │   └── favicon.ico
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Button.tsx
│   │   │   │   └── Modal.tsx
│   │   │   ├── pairing/
│   │   │   │   ├── RoomLobby.tsx
│   │   │   │   └── PinAuth.tsx
│   │   │   └── transfer/
│   │   │       ├── DropZone.tsx
│   │   │       ├── ProgressBar.tsx
│   │   │       └── TextDrop.tsx
│   │   ├── hooks/
│   │   │   ├── useSignaling.ts
│   │   │   └── useWebRTC.ts
│   │   ├── types/
│   │   │   ├── transfer.ts
│   │   │   └── webrtc.ts
│   │   ├── utils/
│   │   │   └── formatters.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
└── server/
    ├── src/
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
```

---

## ⚡ Quick Start

### 1. Start the Signaling Server
```bash
cd server
npm install
npm run dev
```
The signaling relay will listen on `ws://localhost:8080`.

### 2. Start the Frontend Client
```bash
cd client
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 🔄 Protocol Specification

### Signaling Relay (WebSocket JSON)
- `create-room`: Server creates room, returns `{ type: 'room-created', roomId, pin, peerId }`.
- `join-room`: Client sends `{ type: 'join-room', roomId, pin }`.
- `signal`: SDP Offer, SDP Answer, or ICE Candidate exchanged between paired peers.
- `peer-joined` / `peer-left`: Room membership updates.

### DataChannel Transfer (WebRTC Binary + JSON)
- **Header**: JSON packet with `{ type: 'header', fileId, name, size, mimeType, totalChunks, chunkSize }`.
- **Chunk Stream**: 64KB raw `ArrayBuffer` slices.
- **Acknowledgment**: `{ type: 'file-ack', fileId }` sent once all chunks are assembled and auto-downloaded.
- **Text Drop**: Real-time JSON `{ type: 'text-drop', id, content, timestamp }`.
