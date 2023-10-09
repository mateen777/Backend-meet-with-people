import express from "express"; //ES6 style Importing.
import wrtc from "wrtc"; //ES6 style Importing.
// import { Server } from "socket.io";
import cors from "cors";


const app = express();
app.use(cors({
    origin: '*',
    credentials: true,
  }));
app.use(express.json());
let senderStream;

app.post('/broadcast', async ({ body }, res) => {
  const peer = new wrtc.RTCPeerConnection();
  peer.ontrack = (e) => handleTrackEvent(e, peer);
  const desc = new wrtc.RTCSessionDescription(body.sdp);
  await peer.setRemoteDescription(desc);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  const payload = {
      sdp: peer.localDescription
  }

  res.json(payload);
});

app.post("/consumer", async ({ body }, res) => {
    const peer = new wrtc.RTCPeerConnection();
    const desc = new wrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    senderStream.getTracks().forEach(track => peer.addTrack(track, senderStream));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {
        sdp: peer.localDescription
    }

    res.json(payload);
});


function handleTrackEvent(e, peer) {
    senderStream = e.streams[0];
};


app.listen(5000, () => console.log('server started at port - 5000'));

// const io = new Server(8000, {
//     // Socket.IO options
//     cors:true,
//   });
  
//   const emailToSocketIdMap = new Map();
//   const socketidToEmailmap = new Map();
//   io.on("connection", (socket) => {
//     console.log(`connect ${socket.id}`);

//     socket.on('room:join',(data)=>{
//       const { email, roomid } = data;
//       emailToSocketIdMap.set(email,socket.id);
//       socketidToEmailmap.set(socket.id,email);

//       io.to(roomid).emit('user:joined',{ email, id:socket.id });
//       // joining the room
//       socket.join(roomid);
//       io.to(socket.id).emit('room:join',data);
//       console.log(data);
//     })
  
//     socket.on("disconnect", (reason) => {
//       console.log(`disconnect ${socket.id} due to ${reason}`);
//     });
//   });
  
//   httpServer.listen(3000);
