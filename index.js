"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = __importDefault(require("ws"));
const app = express_1.default();
const port = process.env.PORT || 3000;
const wss = new ws_1.default.Server({ noServer: true });
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
