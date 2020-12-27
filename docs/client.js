const socket = new WebSocket("ws://localhost:3000");
socket.onopen = () => {
    socket.send("Hello Server!");
};
