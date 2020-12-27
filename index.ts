import express from 'express';
import ws from 'ws';

const app = express();
const port = process.env.PORT || 3000;

const wss = new ws.Server({ noServer: true });
wss.on('connection', socket => {
    console.log(`Client connected!`);
    socket.on('message', message => console.log(message));
});

const server = app.listen(port);
server.on('listening', () => {
    console.log("Server listening on port ${port}...");
});
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, socket => {
        wss.emit('connection', socket, req);
    });
});