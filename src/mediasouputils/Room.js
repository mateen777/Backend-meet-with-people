import { config } from "../config.js";
import { MediaSoupEventEnum } from "../constants.js";

export class Room {
    constructor(room_id, worker, router, io) {
        this.id = room_id;
        this.worker = worker;
        this.io = io;
        this.audioLevelObserver = null;
        this.audioLevelObserverEnabled = true;
        this.audioLastUpdateTime = 0;
        
        this._isBroadcasting = false;
        
        this._isLocked = false;
        this._isLobbyEnabled = false;
        this._roomPassword = null;
        this._hostOnlyRecording = false;

        this._moderator = {
            audio_start_muted: false,
            video_start_hidden: false,
            audio_cant_unmute: false,
            video_cant_unhide: false,
            screen_cant_share: false,
            chat_cant_privately: false,
            chat_cant_chatgpt: false,
        };
        this.lobby_peers = new Map();
        this.peers = new Map();
        this.bannedPeers = [];
        this.router = router;
        // this.createTheRouter();
    }

    // ROUTER

    static async createTheRouter(worker) {
        const { mediaCodecs } = config.router;
        const router = await worker.createRouter({ mediaCodecs });
            // .then( function (router) {
            //         this.router = router;
            //         if (this.audioLevelObserverEnabled) {
            //             // this.startAudioLevelObservation(router);
            //         }
            //     }.bind(this),
            // );

        return router;
    }

    // Close
    closeRouter()
	{
		console.log('close()');

		this._closed = true;
        if (this.router) {
            this.router.close();
            this.router = null;
        }

	}
    // End Close method

    // PRODUCER AUDIO LEVEL OBSERVER

    async startAudioLevelObservation(router) {
        console.log('Start audioLevelObserver for signaling active speaker...');

        this.audioLevelObserver = await router.createAudioLevelObserver({
            maxEntries: 1,
            threshold: -70,
            interval: 100,
        });

        this.audioLevelObserver.on('volumes', (volumes) => {
            this.sendActiveSpeakerVolume(volumes);
        });
        this.audioLevelObserver.on('silence', () => {
            //console.log('audioLevelObserver', { volume: 'silence' });
        });
    }

    sendActiveSpeakerVolume(volumes) {
        if (Date.now() > this.audioLastUpdateTime + 100) {
            this.audioLastUpdateTime = Date.now();
            const { producer, volume } = volumes[0];
            let audioVolume = Math.round(Math.pow(10, volume / 70) * 10); // 1-10
            if (audioVolume > 1) {
                // console.log('PEERS', this.peers);
                this.peers.forEach((peer) => {
                    peer.producers.forEach((peerProducer) => {
                        if (
                            producer.id === peerProducer.id &&
                            peerProducer.kind == 'audio' &&
                            peer.peer_audio === true
                        ) {
                            let data = { peer_name: peer.peer_name, peer_id: peer.id, audioVolume: audioVolume };
                            //console.log('audioLevelObserver id [' + this.id + ']', data);
                            this.broadCast(0, 'audioVolume', data);
                        }
                    });
                });
            }
        }
    }

    addProducerToAudioLevelObserver(producer) {
        if (this.audioLevelObserverEnabled) {
            this.audioLevelObserver.addProducer(producer);
        }
    }

    getRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    // ROOM MODERATOR

    updateRoomModeratorALL(data) {
        this._moderator = data;
        console.log('Update room moderator all data', this._moderator);
    }

    updateRoomModerator(data) {
        console.log('Update room moderator', data);
        switch (data.type) {
            case 'audio_start_muted':
                this._moderator.audio_start_muted = data.status;
                break;
            case 'video_start_hidden':
                this._moderator.video_start_hidden = data.status;
            case 'audio_cant_unmute':
                this._moderator.audio_cant_unmute = data.status;
                break;
            case 'video_cant_unhide':
                this._moderator.video_cant_unhide = data.status;
            case 'screen_cant_share':
                this._moderator.screen_cant_share = data.status;
                break;
            case 'chat_cant_privately':
                this._moderator.chat_cant_privately = data.status;
                break;
            case 'chat_cant_chatgpt':
                this._moderator.chat_cant_chatgpt = data.status;
                break;
            default:
                break;
        }
    }

    // ROOM INFO

    toJson() {
        return {
            id: this.id,
            broadcasting: this._isBroadcasting,
            // recSyncServerRecording: this._recSyncServerRecording,
            config: {
                isLocked: this._isLocked,
                isLobbyEnabled: this._isLobbyEnabled,
                hostOnlyRecording: this._hostOnlyRecording,
            },
            moderator: this._moderator,
            survey: this.survey,
            redirect: this.redirect,
            peers: JSON.stringify(this.getJoinedPeers()),
        };
    }

    // add lobbypeers
    addPeerToLobby(peer) {
        this.lobby_peers.set(peer.id, peer);
    }
    // PEERS

    addPeer(peer) {
        this.peers.set(peer.id, peer);
    }

    getPeers() {
        return this.peers;
    }

    getPeer(peer_id) {
        return this.peers?.get(peer_id);
    }

    getPeersCount() {
        return this.peers.size;
    }

    getJoinedPeers(){
        let joinedPeers = [];
        this.peers.forEach((peer) => {
            if (peer.joined) {
                joinedPeers.push(peer)
            }
        })

        return joinedPeers;
    }

    getProducerListForPeer() {
        let producerList = [];
        this.peers.forEach((peer) => {
            if (peer.joined) {
                peer.producers.forEach((producer) => {
                    producerList.push({
                        producer_id: producer.id,
                        peer_name: peer.peer_name,
                        peer_id: peer.id,
                        peer_video: peer.peer_video,
                        peer_audio: peer.peer_audio,
                        type: producer.appData.mediaType,
                    });
                });
            }
        });
        return producerList;
    }

    async connectPeerTransport(socket_id, transport_id, dtlsParameters) {
        if (!this.peers.has(socket_id)) return;
        await this.peers.get(socket_id).connectTransport(transport_id, dtlsParameters);
    }

    async removePeer(socket_id) {
        if (!this.peers.has(socket_id)) return;
        this.peers.get(socket_id).close();
        this.peers.delete(socket_id);
    }

    // WEBRTC TRANSPORT

    async createWebRtcTransport(socket_id) {
        const { maxIncomingBitrate, initialAvailableOutgoingBitrate, listenInfos } = config.webRtcTransport;

        const transport = await this.router.createWebRtcTransport({
            listenInfos: listenInfos,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate,
        });

        if (maxIncomingBitrate) {
            try {
                await transport.setMaxIncomingBitrate(maxIncomingBitrate);
            } catch (error) {}
        }

        transport.on('icestatechange', (iceState) => {
            if (iceState === 'disconnected' || iceState === 'closed') {
                console.log('Transport closed "icestatechange" event', {
                    peer_name: peer_name,
                    transport_id: id,
                    iceState: iceState,
                });
                transport.close();
            }
        });

        transport.on('sctpstatechange', (sctpState) => {
            console.log('Transport "sctpstatechange" event', {
                peer_name: peer_name,
                transport_id: id,
                sctpState: sctpState,
            });
        });

        transport.on('dtlsstatechange',
            async function (dtlsState) {
                if (dtlsState === 'failed' || dtlsState === 'closed') {
                    console.log('Transport close', { peer_name: this.peers.get(socket_id).peer_name });
                    transport.close();
                    // await this.removePeer(socket_id);
                    // const eventName = this.id + 'peerremoved';
                    // this.broadCast(socket_id, eventName,
                    //     {
                    //         id: socket_id,
                    //         peer_name: this.peers.get(socket_id)?.peer_name,
                    //     });
                }
            }.bind(this),
        );

        transport.on('close', () => {
            console.log('Transport close mateen', { peer_name: this.peers.get(socket_id).peer_name });
        });

        this.peers.get(socket_id).addTransport(transport);
        return {
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        };
    }

    // PRODUCE

    async produce(socket_id, producerTransportId, rtpParameters, kind, type) {
        return new Promise(
            async function (resolve, reject) {
                let producer = await this.peers
                    .get(socket_id)
                    .createProducer(producerTransportId, rtpParameters, kind, type);
                resolve(producer.id);

                this.broadCast(socket_id, MediaSoupEventEnum.NEW_PRODUCERS, [
                    {
                        producer_id: producer.id,
                        peer_id: socket_id,
                        peer_name: this.peers.get(socket_id)?.peer_name,
                        peer_video: this.peers.get(socket_id)?.peer_video,
                        peer_audio: this.peers.get(socket_id)?.peer_audio,
                        type: type,
                    },
                ]);
            }.bind(this),
        );
    }

    // CONSUME

    async consume(socket_id, consumer_transport_id, producer_id, rtpCapabilities) {
        if (
            !this.router.canConsume({
                producerId: producer_id,
                rtpCapabilities,
            })
        ) {
            console.log('Can not consume', {
                socket_id: socket_id,
                consumer_transport_id: consumer_transport_id,
                producer_id: producer_id,
            });
            return this.callback(`[Room|consume] Room router cannot consume producer_id: '${producer_id}'`);
        }

        let { consumer, params } = await this.peers
            .get(socket_id)
            .createConsumer(consumer_transport_id, producer_id, rtpCapabilities);

        consumer.on('producerclose',
            function () {
                console.log('Consumer closed due to producerclose event', {
                    peer_name: this.peers.get(socket_id)?.peer_name,
                    peer_id:socket_id,
                    consumer_id: consumer.id,
                });
                
                this.peers.get(socket_id).removeConsumer(consumer.id);

                // tell client consumer is dead
                this.io.to(socket_id).emit('consumerClosed', {
                    consumer_id: consumer.id,
                    consumer_kind: consumer.kind,
                });
            }.bind(this),
        );

        consumer.on('producerpause', () =>
        {
            // tell client consumer is paused
            this.io.to(socket_id).emit('consumerPaused', {
                consumer_id: consumer.id,
                consumer_kind: consumer.kind,
            });
            // this.broadCast(socket_id,'consumerPaused', { consumer_id: consumer.id,consumer_kind: consumer.kind });
                
        });

        consumer.on('producerresume', () =>
        {
            // tell client consumer is paused
            this.io.to(socket_id).emit('consumerResumed', {
                consumer_id: consumer.id,
                consumer_kind: consumer.kind,
            });
            // this.broadCast(socket_id,'consumerResumed', { consumer_id: consumer.id,consumer_kind: consumer.kind });
        });			


        return params;
    }

    closeProducer(socket_id, producer_id) {
        console.log(this.peers.get(socket_id).producers,'room in producers',this.peers.get(socket_id).peer_name)
        this.peers.get(socket_id).closeProducer(producer_id);
    }

    // ####################################################
    // HANDLE BANNED PEERS
    // ####################################################

    addBannedPeer(uuid) {
        if (!this.bannedPeers.includes(uuid)) {
            this.bannedPeers.push(uuid);
            console.log('Added to the banned list', {
                uuid: uuid,
                banned: this.bannedPeers,
            });
        }
    }

    isBanned(uuid) {
        return this.bannedPeers.includes(uuid);
    }

    // ####################################################
    // ROOM STATUS
    // ####################################################

    // GET
    isBroadcasting() {
        return this._isBroadcasting;
    }
    getPassword() {
        return this._roomPassword;
    }
    isLocked() {
        return this._isLocked;
    }
    isLobbyEnabled() {
        return this._isLobbyEnabled;
    }
    isHostOnlyRecording() {
        return this._hostOnlyRecording;
    }

    // SET
    setIsBroadcasting(status) {
        this._isBroadcasting = status;
    }
    setLocked(status, password) {
        this._isLocked = status;
        this._roomPassword = password;
    }
    setLobbyEnabled(status) {
        this._isLobbyEnabled = status;
    }
    setHostOnlyRecording(status) {
        this._hostOnlyRecording = status;
    }

    // SENDER

    broadCast(socket_id, action, data) {
        for (let otherID of Array.from(this.peers.keys()).filter((id) => id !== socket_id)) {
            this.send(otherID, action, data);
        }
    }

    broadCastToAll(action, data) {
        for (let otherID of Array.from(this.peers.keys())) {
            this.send(otherID, action, data);
        }
    }

    broadCastToLobby(socket_id, action, data) {
        for (let otherID of Array.from(this.lobby_peers.keys()).filter((id) => id !== socket_id)) {
            this.send(otherID, action, data);
        }
    }

    sendTo(socket_id, action, data) {
        for (let peer_id of Array.from(this.peers.keys()).filter((id) => id === socket_id)) {
            this.send(peer_id, action, data);
        }
    }

    send(socket_id, action, data) {
        this.io.to(socket_id).emit(action, data);
    }
};