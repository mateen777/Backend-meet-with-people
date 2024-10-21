export const DB_NAME = "meetwithpeople";

export const UserRolesEnum = {
    ADMIN: "ADMIN",
    USER: "USER",
  };
  
export const AvailableUserRoles = Object.values(UserRolesEnum);

export const ChatEventEnum = Object.freeze({
    // ? once user is ready to go
    CONNECTED_EVENT: "connected",
    // ? when user gets disconnected
    DISCONNECT_EVENT: "disconnect",
    // ? when user joins a socket room
    JOIN_CHAT_EVENT: "joinChat",
    // ? when participant gets removed from group, chat gets deleted or leaves a group
    LEAVE_CHAT_EVENT: "leaveChat",
    // ? when admin updates a group name
    UPDATE_GROUP_NAME_EVENT: "updateGroupName",
    // ? when new message is received
    MESSAGE_RECEIVED_EVENT: "messageReceived",
    // ? when there is new one on one chat, new group chat or user gets added in the group
    NEW_CHAT_EVENT: "newChat",
    // ? when there is an error in socket
    SOCKET_ERROR_EVENT: "socketError",
    // ? when participant stops typing
    STOP_TYPING_EVENT: "stopTyping",
    // ? when participant starts typing
    TYPING_EVENT: "typing",
  });
  
  export const AvailableChatEvents = Object.values(ChatEventEnum);
  
  export const MediaSoupEventEnum = Object.freeze({
    //  create a room
    CREATE_ROOM: "createRoom",
    //  get All Peers
    GET_PEERS: "getAllPeers",
    // new Peer
    NEW_PEER: "newPeer",
    //join in the room
    JOIN_ROOM: "joinRoom",
    //get RouterRtpCapabilities of the room
    GET_ROUTER_RTPCAPABILITIES: "getRouterRtpCapabilities",
    //create createWebRtcTransport transport
    CREATE_WEBRTC_TRANSPORT: "createWebRtcTransport",
    //connect transport
    CONNECT_TRANSPORT: "connectTransport",
    //produce
    PRODUCE: "produce",
    //consume
    CONSUME: "consume",
    //close the producer of the room
    PRODUCER_CLOSED: "producerClosed",
    //pause the producer of the room
    PAUSE_PRODUCER: "pauseProducer",
    //resume the producer of the room
    RESUME_PRODUCER: "resumeProducer",
    //resume the consumer of the room
    RESUME_CONSUMER: "resumeConsumer",
    //get producers of the room
    GET_PRODUCERS: "getProducers",
    //remove the peer of the room
    EXIT_ROOM: "exitRoom",
    //remove peer of the room from client side event
    PEER_CLOSED: "peerClosed",
    //new producers for client side event
    NEW_PRODUCERS: "newProducers",
    
  });

  export const AvailableMediaSoupEvents = Object.values(MediaSoupEventEnum);