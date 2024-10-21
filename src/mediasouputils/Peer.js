
export class Peer {
    constructor(socket_id, data) {
        this.id = socket_id;
        this.peer_info;
        this.peer_name = data.userName;
        this.joined = data.joined;
        this.bg_color = data.bg_color;
        // this.peer_name = data.peer_info.peer_name;
        // this.peer_presenter = data.peer_info.peer_presenter;
        this.peer_audio = false;
        this.peer_video = false;
        // this.peer_video_privacy = data.peer_video_privacy;
        // this.peer_recording = data.peer_info.peer_recording;
        // this.peer_hand = data.peer_info.peer_hand;
        this.transports = new Map();
        this.consumers = new Map();
        this.producers = new Map();
    }

    // UPDATE PEER INFO

    updatePeerInfo(data) {
        console.log('Update peer info', data);
        switch (data.type) {
            case 'audio':
            case 'audioType':
                // this.peer_info.peer_audio = data.status;
                this.peer_audio = data.status;
                break;
            case 'video':
            case 'videoType':
                // this.peer_info.peer_video = data.status;
                this.peer_video = data.status;
                // if (data.status == false) {
                //     this.peer_info.peer_video_privacy = data.status;
                //     this.peer_video_privacy = data.status;
                // }
                break;
            case 'screen':
            case 'screenType':
                // this.peer_info.peer_screen = data.status;
                break;
            case 'hand':
                // this.peer_info.peer_hand = data.status;
                // this.peer_hand = data.status;
                break;
            case 'joined':
                this.joined = data.status;
                break;
            case 'privacy':
                // this.peer_info.peer_video_privacy = data.status;
                // this.peer_video_privacy = data.status;
                break;
            case 'presenter':
                // this.peer_info.peer_presenter = data.status;
                // this.peer_presenter = data.status;
                break;
            case 'recording':
                // this.peer_info.peer_recording = data.status;
                // this.peer_recording = data.status;
                break;
            default:
                break;
        }
    }

    // ####################################################
    // TRANSPORT
    // ####################################################

    addTransport(transport) {
        this.transports.set(transport.id, transport);
    }

    async connectTransport(transport_id, dtlsParameters) {
        if (!this.transports.has(transport_id)) return;

        await this.transports.get(transport_id).connect({
            dtlsParameters: dtlsParameters,
        });
    }

    close() {
        if (this.joined) {
            this.transports.forEach((transport) => transport.close());
        }
    }

    // ####################################################
    // PRODUCER
    // ####################################################

    getProducer(producer_id) {
        return this.producers.get(producer_id);
    }

    async createProducer(producerTransportId, producer_rtpParameters, producer_kind, producer_type) {
        try {
            if (!producerTransportId) {
                throw new Error('Invalid producer transport ID');
            }

            const producerTransport = this.transports.get(producerTransportId);
            if (!producerTransport) {
                throw new Error(`Producer transport with ID ${producerTransportId} not found`);
            }

            const producer = await producerTransport.produce({
                kind: producer_kind,
                rtpParameters: producer_rtpParameters,
            });

            const { id, appData, type, rtpParameters } = producer;

            appData.mediaType = producer_type;

            this.producers.set(id, producer);

            if (['simulcast', 'svc'].includes(type)) {
                const { scalabilityMode } = rtpParameters.encodings[0];
                const spatialLayer = parseInt(scalabilityMode.substring(1, 2)); // 1/2/3
                const temporalLayer = parseInt(scalabilityMode.substring(3, 4)); // 1/2/3
                console.log(`Producer [${type}] created with ID ${id}`, {
                    scalabilityMode,
                    spatialLayer,
                    temporalLayer,
                });
            } else {
                console.log(`Producer of type ${type} created with ID ${id}`);
            }

            producer.on('transportclose', () => {
                console.log('Producer transport closed', {
                    peer_name: this.peer_name,
                    producer_id: id,
                });
                this.closeProducer(id);
            });

            return producer;
        } catch (error) {
            console.log('Error creating producer', error.message);
            return null;
        }
    }

    closeProducer(producer_id) {
        if (!this.producers.has(producer_id)) return;
        try {
            console.log(producer_id,'in peer class producer id')
            this.producers.get(producer_id).close();
        } catch (ex) {
            console.log('Close Producer', ex);
        }
        this.producers.delete(producer_id);
    }

    // CONSUMER

    getConsumers() {
        return JSON.parse(JSON.stringify([...this.consumers]));
    }
    
    getConsumer(consumer_id) {
        return this.consumers.get(consumer_id);
    }

    async createConsumer(consumer_transport_id, producer_id, rtpCapabilities) {
        try {
            const consumerTransport = this.transports.get(consumer_transport_id);

            if (!consumerTransport) {
                throw new Error(`Consumer transport with id ${consumer_transport_id} not found`);
            }

            const consumer = await consumerTransport.consume({
                producerId: producer_id,
                rtpCapabilities,
                enableRtx: true, // Enable NACK for OPUS.
                paused: true,
            });

            const { id, type, kind, rtpParameters, producerPaused } = consumer;

            console.log('consumerId at server side',id);
            if (['simulcast', 'svc'].includes(type)) {
                const { scalabilityMode } = rtpParameters.encodings[0];
                const spatialLayer = parseInt(scalabilityMode.substring(1, 2)); // 1/2/3
                const temporalLayer = parseInt(scalabilityMode.substring(3, 4)); // 1/2/3
                await consumer.setPreferredLayers({
                    spatialLayer: spatialLayer,
                    temporalLayer: temporalLayer,
                });
                console.log(`Consumer [${type}] ----->`, {
                    scalabilityMode,
                    spatialLayer,
                    temporalLayer,
                });
            } else {
                console.log('Consumer ----->', { type: type });
            }

            consumer.on('transportclose', () => {
                console.log('Consumer transport close', {
                    peer_name: this.peer_info?.peer_name,
                    consumer_id: id,
                });
                this.removeConsumer(id);
            });

            this.consumers.set(id, consumer);

            return {
                consumer,
                params: {
                    producerId: producer_id,
                    id: id,
                    kind: kind,
                    rtpParameters: rtpParameters,
                    type: type,
                    producerPaused: producerPaused,
                },
            };
        } catch (error) {
            log.error('Error creating consumer', error.message);
            return null;
        }
    }

    removeConsumer(consumer_id) {
        if (!this.consumers.has(consumer_id)) return;

        const consumer = this.getConsumer(consumer_id);
        const { id, kind, type } = consumer;

        try {
            consumer.close();
        } catch (error) {
            console.log('Close Consumer', error.message);
        }

        this.consumers.delete(consumer_id);

        console.log('Consumer closed and deleted', {
            peer_name: this.peer_name,
            kind: kind,
            type: type,
            consumer_id: id,
        });
    }
};