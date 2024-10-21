import os from "os";

const ifaces = os.networkInterfaces();

const getLocalIp = () => {
    let localIp = '127.0.0.1';
    let checkIp = true;
    Object.keys(ifaces).forEach((ifname) => {
        for (const iface of ifaces[ifname]) {
            // Ignore IPv6 and 127.0.0.1
            if (iface.family !== 'IPv4' || iface.internal !== false || checkIp === false) {
                continue;
            }
            // Set the local ip to the first IPv4 address found and exit the loop
            localIp = iface.address;
            checkIp = false;
            return;
        }
    });
    return localIp;
};

export const config =  {
    // Worker settings
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
        rtcMinPort: 40000,
        rtcMaxPort: 40100,
        logLevel: 'error',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp', 'rtx', 'bwe', 'score', 'simulcast', 'svc', 'sctp'],
    },
    // Router settings
    router: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000,
                },
            },
            {
                kind: 'video',
                mimeType: 'video/VP9',
                clockRate: 90000,
                parameters: {
                    'profile-id': 2,
                    'x-google-start-bitrate': 1000,
                },
            },
            {
                kind: 'video',
                mimeType: 'video/h264',
                clockRate: 90000,
                parameters: {
                    'packetization-mode': 1,
                    'profile-level-id': '4d0032',
                    'level-asymmetry-allowed': 1,
                    'x-google-start-bitrate': 1000,
                },
            },
            {
                kind: 'video',
                mimeType: 'video/h264',
                clockRate: 90000,
                parameters: {
                    'packetization-mode': 1,
                    'profile-level-id': '42e01f',
                    'level-asymmetry-allowed': 1,
                    'x-google-start-bitrate': 1000,
                },
            },
        ],
    },
    // WebRtcTransport settings
    webRtcTransport: {
        listenInfos: [
            { protocol: 'udp', ip: '0.0.0.0', announcedAddress: getLocalIp() },
            { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: getLocalIp() },
            //announcedAddress: replace by 'public static IPV4 address' https://api.ipify.org (type string --> 'xx.xxx.xxx.xx' not xx.xxx.xxx.xx)
            //announcedAddress: '' will be auto-detected on server start, for docker localPC set '127.0.0.1' otherwise the 'public static IPV4 address'
        ],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        maxIncomingBitrate: 1500000,
    },
}