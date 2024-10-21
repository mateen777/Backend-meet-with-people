import { ChatEventEnum, MediaSoupEventEnum } from "../constants.js";
import { ApiError } from "../utils/ApiError.js";
import os from "os";
import * as mediasoup from "mediasoup";
import { config } from "../config.js";
import { Room } from "../mediasouputils/Room.js";
import { Peer } from "../mediasouputils/Peer.js";
import { AwaitQueue } from 'awaitqueue';
// import { initMediasoupEvents } from "../mediasouputils/mediasoup.js";

const queue = new AwaitQueue();
const roomList = new Map(); // All Rooms
const presenters = {}; // collect presenters grp by roomId
let announcedAddress = config.webRtcTransport.listenInfos[0].announcedAddress; // announcedAddress (server public IPv4)
// All mediasoup workers
let workers = [];
let nextMediasoupWorkerIdx = 0;

(async () => {
  try {
      await createWorkers();
  } catch (err) {
      console.log('Create Worker ERR --->', err);
      process.exit(1);
  }
})();

async function createWorkers() {
  const { numWorkers } = config;

  const { logLevel, logTags, rtcMinPort, rtcMaxPort } = config.worker;

  for (let i = 0; i < numWorkers; i++) {
      let worker = await mediasoup.createWorker({
          logLevel: logLevel,
          logTags: logTags,
          rtcMinPort: rtcMinPort,
          rtcMaxPort: rtcMaxPort,
      });
      worker.on('died', () => {
          console.log('Mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
          setTimeout(() => process.exit(1), 2000);
      });
      workers.push(worker);
  }
}

const mountJoinChatEvent = (socket) => {
  socket.on(ChatEventEnum.JOIN_CHAT_EVENT, (chatId) => {
    console.log(`User joined the chat 🤝. chatId: `, chatId);
    // joining the room with the chatId will allow specific events to be fired where we don't bother about the users like typing events
    // E.g. When user types we don't want to emit that event to specific participant.
    // We want to just emit that to the chat where the typing is happening
    socket.join(chatId);
  });
};


const mountParticipantTypingEvent = (socket) => {
  socket.on(ChatEventEnum.TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.TYPING_EVENT, chatId);
  });
};

const mountParticipantStoppedTypingEvent = (socket) => {
  socket.on(ChatEventEnum.STOP_TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);
  });
};

const initializeSocketIO = (io) => {
  return io.on("connection", async (socket) => {
    try {
      
      // socket.user = user; // mount te user object to the socket

      // We are creating a room with user id so that if user is joined but does not have any active chat going on.
      // still we want to emit some socket events to the user.
      // so that the client can catch the event and show the notifications.
      // socket.join(user._id.toString());
      // socket.on("check", (data,callback) => {
      //   console.log(data,'data');
      //   callback({
      //     status: "ok"
      //   });
      // });
      socket.emit('connected'); // emit the connected event so that client is aware
      // socket.emit(ChatEventEnum.CONNECTED_EVENT); // emit the connected event so that client is aware
      console.log("User connected 🗼. userId: ", socket.id);
      console.log("numWorkers",Object.keys(os.cpus()).length);

      // Common events that needs to be mounted on the initialization
      mountJoinChatEvent(socket);
      mountParticipantTypingEvent(socket);
      mountParticipantStoppedTypingEvent(socket);
      
      initMediasoupEvents(socket,roomList,workers,io);

      socket.on(ChatEventEnum.DISCONNECT_EVENT, () => {
        console.log("user has disconnected 🚫. userId: " + socket.id.toString());
        // if (socket.user?._id) {
        //   socket.leave(socket.user._id);
        // }

      });
    } catch (error) {
      socket.emit(
        ChatEventEnum.SOCKET_ERROR_EVENT,
        error?.message || "Something went wrong while connecting to the socket."
      );
    }
  });
};


const emitSocketEvent = (req, roomId, event, payload) => {
  req.app.get("io").in(roomId).emit(event, payload);
};

async function initMediasoupEvents(socket,roomList,workers,io){

  socket.on(MediaSoupEventEnum.CREATE_ROOM, async ({ room_id ,userName}, callback) => {
    socket.room_id = room_id;

    queue.push(async () =>
		{
			// const room = await getOrCreateRoom(room_id);

      if (roomList.has(socket.room_id)) {
    
        const room = roomList.get(socket.room_id);
        
        room.addPeer(new Peer(socket.id,{ userName,joined:false, bg_color: getRandomLightColor() }));
        callback({ isExist:true, status: "OK", message: 'already exists' ,room_info:room.toJson()});
    
      } else {
          console.log('Created room', { room_id: socket.room_id },room_id);
          // get mediasoup worker
          let worker = await getMediasoupWorker();
    
          // create mediasoup router
          const router = await Room.createTheRouter(worker);
          
          //create room instance
          const room = new Room(socket.room_id, worker, router, io);
          room.addPeer(new Peer(socket.id,{ userName,joined:false, bg_color: getRandomLightColor() }));
          roomList.set(socket.room_id, room);
    
          callback({isExist:false, status: "OK", message: 'room created' , room_id: socket.room_id, room_info:room.toJson() });
      }

		}).catch((error) =>
			{
				console.error('room creation or room joining failed:%o', error);
        callback({status: "NOK",message:'room creation or room joining failed'})
			});
  });

  socket.on(MediaSoupEventEnum.JOIN_ROOM, async ({ room_id , userName }, callback) => {
    
    if (!roomList.has(room_id)) { 
        return callback({ isExist:false, error: 'Room does not exist'});
    } else {
      const room = roomList.get(room_id);
      const peer = room.getPeer(socket.id);
      peer.updatePeerInfo({type:'joined',status:true});
      // room.addPeer(new Peer(socket.id,{ userName }));
      console.log('user joined into room',socket.id);
      
      callback({ joined:true, isExist:true, peer:peer })
      room.broadCast(socket.id, MediaSoupEventEnum.NEW_PEER, { peer });
      // room.broadCast(socket.id, MediaSoupEventEnum.NEW_PEER, { consumers:{}, id:peer.id, joined:peer.joined, peer_name: peer.peer_name,  });
    }
  });

  socket.on(MediaSoupEventEnum.GET_PEERS, async (res, callback) => {
    
    if (!roomList.has(socket.room_id)) { 
        return callback({ status:"NOK", error: 'Room does not exist'});
    } else {
      const room = roomList.get(socket.room_id);
      console.log(room.getJoinedPeers())
      callback({status:"OK", peers:JSON.stringify(room.getJoinedPeers())})
    }
  });

  socket.on(MediaSoupEventEnum.GET_ROUTER_RTPCAPABILITIES,(_, callback) => {
    if (!roomList.has(socket.room_id)) {
      return callback({ error: 'Room not found' });
    }
    
    const room = roomList.get(socket.room_id);

    try {
        callback(room.getRtpCapabilities());
    } catch (err) {
        callback({
            error: err.message,
        });
    }
  });


  socket.on(MediaSoupEventEnum.CREATE_WEBRTC_TRANSPORT, async (_, callback) => {
    if (!roomList.has(socket.room_id)) {
        return callback({ error: 'Room not found' });
    }

    const room = roomList.get(socket.room_id);

    console.log('Create WebRtc transport for room id', socket.room_id);
    try {
        const createWebRtcTransport = await room.createWebRtcTransport(socket.id);

        callback(createWebRtcTransport);
    } catch (err) {
        console.log('Create WebRtc Transport error', err.message);
        callback({
            error: err.message,
        });
    }
  });

  socket.on(MediaSoupEventEnum.CONNECT_TRANSPORT, async ({ transport_id, dtlsParameters }, callback) => {
    if (!roomList.has(socket.room_id)) {
        return callback({ error: 'Room not found' });
    }

    const room = roomList.get(socket.room_id);

    console.log('Connect transport', { transport_id: transport_id });

    try {
        const connectTransport = await room.connectPeerTransport(socket.id, transport_id, dtlsParameters);

        //log.debug('Connect transport', { callback: connectTransport });

        callback(connectTransport);
    } catch (err) {
        console.error('Connect transport error', err.message);
        callback({
            error: err.message,
        });
    }
  });

  socket.on(MediaSoupEventEnum.PRODUCE, async ({ producerTransportId, kind, appData, rtpParameters }, callback, errback) => {
    if (!roomList.has(socket.room_id)) {
        return callback({ error: 'Room not found' });
    }

    const room = roomList.get(socket.room_id);

    const peer = room.getPeers().get(socket.id);

    // peer_info.audio OR video ON
    const data = {
        room_id: room.id,
        peer_name: peer.peer_name,
        peer_id: socket.id,
        kind: kind,
        type: appData.mediaType,
        status: true,
    };

    peer.updatePeerInfo(data);

    try {
        const producer_id = await room.produce(
            socket.id,
            producerTransportId,
            rtpParameters,
            kind,
            appData.mediaType,
        );

        console.log('Produce', {
            kind: kind,
            type: appData.mediaType,
            peer_name: peer.peer_name,
            peer_id: socket.id,
            producer_id: producer_id,
        });

        // add & monitor producer audio level
        // if (kind === 'audio') {
        //     room.addProducerToAudioLevelObserver({ producerId: producer_id });
        // }

        //console.log('Producer transport callback', { callback: producer_id });

        callback({
            producer_id,
        });
    } catch (err) {
        console.error('Producer transport error', err.message);
        callback({
            error: err.message,
        });
    }
  });

  socket.on(MediaSoupEventEnum.CONSUME, async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
    if (!roomList.has(socket.room_id)) {
        return callback({ error: 'Room not found' });
    }

    const room = roomList.get(socket.room_id);

    const peer = room.getPeers().get(socket.id);

    try {
        const params = await room.consume(socket.id, consumerTransportId, producerId, rtpCapabilities);

        console.log('Consuming', {
            peer_name: peer.peer_name,
            producer_id: producerId,
            consumer_id: params ? params.id : undefined,
        });

        callback(params);
    } catch (err) {
        console.error('Consumer transport error', err.message);
        callback({
            error: err.message,
        });
    }
  });

  socket.on(MediaSoupEventEnum.PRODUCER_CLOSED, async(data) => {
    if (!roomList.has(socket.room_id)) return;

    const room = roomList.get(socket.room_id);

    // const peer = room.getPeer(socket.id);

    // peer.updatePeerInfo(data); // peer_info.audio OR video OFF
    console.log(socket.id,'peer_id');
    console.log(data,'data')
    room.closeProducer(socket.id, data.producer_id);
  });

  socket.on(MediaSoupEventEnum.PAUSE_PRODUCER, async ({ producer_id }, callback) => {
    if (!roomList.has(socket.room_id)) return;

    const room = roomList.get(socket.room_id);

    // const peer_name = getPeerName(room, false);

    const peer = room.getPeers().get(socket.id);

    if (!peer) {
        return callback({
            error: `peer with ID: ${socket.id} for producer with id "${producer_id}" not found`,
        });
    }

    const producer = peer.getProducer(producer_id);

    if (!producer) {
        return callback({ error: `producer with id "${producer_id}" not found` });
    }

    console.log('Producer paused', { peer_name: peer.peer_name, producer_id: producer_id });

    try {
        await producer.pause();
        peer.updatePeerInfo({ type:producer.appData.mediaType, status:false });
    } catch (error) {
        return callback({ error: error.message });
    }

    callback('successfully paused producer');
  });

  socket.on(MediaSoupEventEnum.RESUME_PRODUCER, async ({ producer_id }, callback) => {
    if (!roomList.has(socket.room_id)) return;

    const room = roomList.get(socket.room_id);

    const peer = room.getPeers().get(socket.id);

    if (!peer) {
        return callback({
            error: `peer with ID: "${socket.id}" for producer with id "${producer_id}" not found`,
        });
    }

    const producer = peer.getProducer(producer_id);

    if (!producer) {
        return callback({ error: `producer with id "${producer_id}" not found` });
    }

    console.log('Producer resumed', { peer_name: peer.peer_name, producer_id: producer_id });

    try {
        await producer.resume();
        peer.updatePeerInfo({ type:producer.appData.mediaType, status:true });
    } catch (error) {
        return callback({ error: error.message });
    }

    callback('successfully resumed producer');
  });

  socket.on(MediaSoupEventEnum.RESUME_CONSUMER, async ({ consumer_id }, callback) => {
    if (!roomList.has(socket.room_id)) return;

    const room = roomList.get(socket.room_id);

    const peer = room.getPeers().get(socket.id);

    if (!peer) {
        return callback({
            error: `peer with ID: "${socket.id}" for consumer with id "${consumer_id}" not found`,
        });
    }

    const consumer = peer.getConsumer(consumer_id);

    if (!consumer) {
        return callback({ error: `producer with id "${consumer_id}" not found` });
    }

    console.log('Consumer resumed', { peer_name: peer.peer_name, consumer_id: consumer_id });

    try {
        await consumer.resume();
    } catch (error) {
        return callback({ error: error.message });
    }

    callback('successfully');
  });

  socket.on(MediaSoupEventEnum.GET_PRODUCERS, (res) => {
    if (!roomList.has(socket.room_id)) return;
 
    const room = roomList.get(socket.room_id);

    console.log('Get producers');

    // send all the current producer to newly joined member
    // const producerList = room.getProducerListForPeer().filter((peer)=> peer.peer_id != socket.id);
    const producerList = room.getProducerListForPeer();

    socket.emit(MediaSoupEventEnum.NEW_PRODUCERS, producerList);
  });

  socket.on(MediaSoupEventEnum.EXIT_ROOM, async (_, callback) => {
    if (!roomList.has(socket.room_id)) {
      return callback({
          error: 'Not currently in a room',
      });
    }

    const room = roomList.get(socket.room_id);
    const peer = room.getPeers()?.get(socket.id);
    const peerInfo = peer?.peer_info || {};

    const peerName = peer?.peer_name || '';

    const peerUuid = peerInfo?.peer_uuid || '';

    // const isPresenter = await isPeerPresenter(socket.room_id, socket.id, peerName, peerUuid);

    console.log('Exit room', peerName);
    
    room.removePeer(socket.id);
    
    console.log('joined array lenght', room.getJoinedPeers().length);
    room.broadCast(socket.id, MediaSoupEventEnum.PEER_CLOSED, {peer_id:socket.id});
    io.sockets.emit(MediaSoupEventEnum.PEER_CLOSED + socket.room_id,{peer_id:socket.id});
    if (room.getJoinedPeers().length === 0) {
        
        room.closeRouter();
        roomList.delete(socket.room_id);

        // delete presenters[socket.room_id];

        console.log('[REMOVE ME] - Last peer - current presenters grouped by roomId', presenters);
    }

    socket.room_id = null;

    callback('Successfully exited room');

  });
}

async function getOrCreateRoom(room_id) {

  let room;
  if (roomList.has(socket.room_id)) {
    
    const room = roomList.get(socket.room_id);

    callback({ isExist:true, error: 'already exists' ,room_info:room.toJson()});

  } else {
      console.log('Created room', { room_id: socket.room_id },room_id);
      // get mediasoup worker
      let worker = await getMediasoupWorker();

      // create mediasoup router
      const router = await Room.createTheRouter(worker);
      
      //create room instance
      room = new Room(socket.room_id, worker, router, io);

      roomList.set(socket.room_id, room);

      callback({isExist:false, error: 'room created' , room_id: socket.room_id });

  }

	return room;
  }

async function getMediasoupWorker() {
    const worker = workers[nextMediasoupWorkerIdx];
    if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0;
    return worker;
}

function getRandomLightColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

export { initializeSocketIO, emitSocketEvent };
