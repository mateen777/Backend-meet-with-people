function initMediasoupEvents(socket,roomList,workers){

    socket.on('inmedia', async ({ room_id }, callback) => {
        console.log('inmedia mateen',roomList,workers)
    });
    socket.on('createRoom', async ({ room_id }, callback) => {
        socket.room_id = room_id;

        if (roomList.has(socket.room_id)) {
            callback({ error: 'already exists' });
        } else {
            console.log('Created room', { room_id: socket.room_id });
            let worker = await getMediasoupWorker();
            roomList.set(socket.room_id, new Room(socket.room_id, worker, io));
            callback({ room_id: socket.room_id });
        }
    });

    async function getMediasoupWorker() {
        const worker = workers[nextMediasoupWorkerIdx];
        if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0;
        return worker;
    }
}