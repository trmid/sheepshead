
let socket: WebSocket;

// Log Scroll check
let scrolled = false;
let log_elem: HTMLElement;

window.addEventListener('load', () => {

    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", () => {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 5) scrolled = false;
        else scrolled = true;
    });

    /**
     * Change on compile for production
     */
    socket = new WebSocket("ws://localhost:3000");

    socket.onopen = () => {
        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server...");
    };

    socket.onmessage = (me) => {
        try {
            const data = JSON.parse(me.data);
            switch (data.event) {
                case 'table-created':
                    log("Table Created!");
                    break;
                case 'table-joined':
                    set_table(data);
                    break;
                case 'error':
                    log(data.msg, 'error');
                    break;
            }
        } catch (err) {
            console.error(err);
        }
    };

});

// Create or Join Table
function join_table() {
    const name = (<HTMLInputElement>document.getElementById('table-name')).value;
    const pass = (<HTMLInputElement>document.getElementById('table-password')).value;
    const event = (<HTMLInputElement>document.getElementById('table-options')).value;
    const player_name = (<HTMLInputElement>document.getElementById('table-player')).value;
    if (name && pass && event && player_name) {
        if (name.length < 4 || pass.length < 4) {
            log("Table name and password must be at least 4 characters long.", "error");
        } else if (player_name.length < 3) {
            log("Your player name must be at least 3 characters long.", "error");
        } else {
            socket.send(JSON.stringify({
                event: event,
                table_name: name,
                table_password: pass,
                player_name: player_name
            }));
        }
    }
};

// Log
function log(msg: string, className = "none") {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.innerHTML = (new Date()).toLocaleString();
    const data = document.createElement('td');
    data.innerHTML = msg;
    data.classList.add(className);
    row.append(head);
    row.append(data);
    log_elem.append(row);
    if (!scrolled) log_elem.scrollTop = log_elem.scrollHeight;
}

// Set table
function set_table(data: any) {
    log(`Joined Table: ${data.table_name}`, "server");
}