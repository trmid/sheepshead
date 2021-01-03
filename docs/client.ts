
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

    const send_btn = <HTMLButtonElement>document.getElementById("send-btn");
    const send_text = <HTMLTextAreaElement>document.getElementById("send-text");
    const send_msg = () => {
        const msg = send_text.value;
        socket.send(JSON.stringify({
            event: 'msg',
            msg: msg
        }));
        send_text.value = "";
    };
    send_btn.addEventListener("click", send_msg);
    send_text.addEventListener("keypress", (e) => {
        if (e.code.toUpperCase() === 'ENTER') {
            e.preventDefault();
            send_msg();
        }
    })

    /**
     * Change on compile for production
     * 
     * wss://sheeps-head.herokuapp.com
     * 
     * ws://localhost:3000
     */
    socket = new WebSocket("wss://sheeps-head.herokuapp.com");

    socket.onclose = () => {
        log("You have been disconnected from the server...", "error");
    };

    socket.onopen = () => {
        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server...");
        setInterval(() => {
            socket.send(JSON.stringify({ 'event': 'ping' }));
        }, 5000);
    };

    socket.onmessage = (me) => {
        try {
            const data = JSON.parse(me.data);
            console.log(data);
            switch (data.event) {
                case 'ping':
                    console.log("ping");
                    break;
                case 'table-created':
                    log("Table Created!", 'server');
                    break;
                case 'player-connected':
                    log(`${data.player_name} has connected to the table!`, 'server');
                    // hide the table form
                    (document.getElementById('table-form')).setAttribute('style', "display: none;");
                    break;
                case 'player-joined':
                    log(`${data.player_name} has joined the table!`, 'server');
                    break;
                case 'player-dc':
                    log(`${data.player_name} has disconnected from the table...`, 'server');
                    break;
                case 'card-played':
                    let trick_str = "";
                    data.trick.forEach((trick: any) => {
                        trick_str += `[${trick.player}: ${text_card(trick.card)}] `;
                    });
                    log(`${data.player_name} played ${text_card(data.card)}. Current trick: ${trick_str}`, "game");
                    if (data.winner) {
                        log(`${data.winner} has taken the trick!`, 'strategy');
                    }
                    if (data.player_turn) {
                        log(`It is ${data.player_turn}'${data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's'} turn to play a card...`, 'game');
                    }
                    update_hand(data.my_hand, data.trump);

                    // Check round over
                    if (data.winners) {
                        let winners = '';
                        for (let i = 0; i < data.winners.players.length; i++) {
                            winners += data.winners.players[i].name + (i < data.winners.players.length - 1 ? ', ' : '');
                        }
                        log(`${winners} ${data.winners.players.length > 1 ? 'have' : 'has'} won the round with ${data.winners.points} points! Winnings: $${data.payment.toFixed(2)}`, `strategy`);

                        let balances = '';
                        const players = data.winners.players.concat(data.losers.players);
                        for (let i = 0; i < players.length; i++) {
                            balances += `[${players[i].name}: $${players[i].balance.toFixed(2)}] `;
                        }
                        log(`Player Balances: ${balances}`, 'strategy');
                    }

                    break;
                case 'deal':
                    log(`Cards have been dealt!`, 'game');
                    update_hand(data.cards);
                    start_round(data.cards);
                    break;
                case 'table-update':
                    update_hand(data.my_hand);
                    break;
                case 'error':
                    log(data.msg, 'error');
                    break;
                case 'msg':
                    log(`${data.player_name}: ${data.msg}`);
                    break;
                case 'ready':
                    log(`${data.player_name} is ready!`, 'game');
                    break;
                case 'round-start':
                    document.getElementById('round-options').innerHTML = "";
                    if (data.strategy_call) {
                        log(data.strategy_call, 'strategy');
                    }
                    log(`It is ${data.player_turn}'${data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's'} turn to play a card...`, 'game');
                    update_hand(data.my_hand, data.trump);
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
    head.innerHTML = (new Date()).toLocaleTimeString();
    const data = document.createElement('td');
    data.innerHTML = msg;
    data.classList.add(className);
    row.append(head);
    row.append(data);
    document.getElementById("log-messages").append(row);
    if (!scrolled) log_elem.scrollTop = log_elem.scrollHeight;
}

// Update Hand
function update_hand(cards: string[], trump = 'D') {

    // Sorting
    const unsorted = cards.filter(c => true);
    const sort_hand = <HTMLInputElement>document.getElementById("sort-hand");
    const sort = sort_hand.checked;
    sort_hand.onclick = (e) => {
        e.stopPropagation();
        update_hand(unsorted, trump);
    };

    // Sort cards
    if (sort) {
        cards = cards.sort((a, b) => {

            // suits and vals
            const suits: any = { 'D': 0, 'H': 1, 'S': 2, 'C': 3 };
            const vals: any = { '7': 0, '8': 1, '9': 2, 'K': 3, 'T': 4, 'A': 5, 'J': 6, 'Q': 7 };

            // check suit
            const suit_a = suits[a.charAt(1)];
            const suit_b = suits[b.charAt(1)];

            // check val
            const val_a = vals[a.charAt(0)];
            const val_b = vals[b.charAt(0)];

            // check trump
            const trump_a = (val_a > 5 || a.charAt(1) === trump);
            const trump_b = (val_b > 5 || b.charAt(1) === trump);

            if (!trump_a && !trump_b) {
                let diff = suit_a - suit_b;
                if (diff === 0) {
                    return val_a - val_b;
                } else {
                    return diff;
                }
            } else if (trump_a && trump_b) {
                let diff = val_a - val_b;
                if (diff === 0) {
                    return suit_a - suit_b;
                } else {
                    return diff;
                }
            } else {
                return (trump_a ? 1 : -1) - (trump_b ? 1 : -1);
            }

        });
    }

    // Display cards
    const hand = document.getElementById("hand");
    hand.innerHTML = "";
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        let val = card.charAt(0);
        const suit = card.charAt(1);
        if (val.toUpperCase() === 'T') val = '10'; // convert T to 10

        const play_card = document.createElement("div");
        play_card.classList.add("card");
        play_card.classList.add("playable");
        play_card.classList.add(suit);

        const value = document.createElement("div");
        value.classList.add("card-value");
        value.innerHTML = val;
        play_card.append(value);
        play_card.append(suit_img(suit));
        play_card.append(suit_img(suit, true));

        play_card.addEventListener("click", () => {
            socket.send(JSON.stringify({
                event: 'play-card',
                card: card
            }));
        });
        hand.append(play_card);
    }
}

// Format card for text
function text_card(card: string) {
    let str = '';

    let val = card.charAt(0);
    const suit = card.charAt(1);
    if (val.toUpperCase() === 'T') val = '10'; // convert T to 10

    str += val;

    str += suit_img(suit, true).outerHTML;

    return str;
}

// get suit image element
function suit_img(suit: string, small = false) {
    const img = document.createElement("img");
    let src = '';
    switch (suit) {
        case 'D': src = `img/diamond${small ? '_sm' : ''}.png`; break;
        case 'H': src = `img/heart${small ? '_sm' : ''}.png`; break;
        case 'S': src = `img/spade${small ? '_sm' : ''}.png`; break;
        case 'C': src = `img/club${small ? '_sm' : ''}.png`; break;
    }
    img.src = src;
    img.classList.add('suit-img');
    if (small) {
        img.classList.add('suit-sm');
    }
    return img;
}

// Ready up
function start_round(cards: string[]) {

    const queens = cards.includes('QC') && cards.includes('QS');

    const round_options = document.getElementById("round-options");
    round_options.innerHTML = "";

    const ready = document.createElement("button");
    ready.innerHTML = "Ready";
    ready.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'ready'
        }));
    });
    round_options.append(ready);

    if (queens) {
        const first_trick = document.createElement("button");
        first_trick.innerHTML = "First Trick";
        first_trick.addEventListener("click", () => {
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'first-trick'
            }));
        });
        round_options.append(first_trick);
    }

    const trump_solo = document.createElement("button");
    trump_solo.innerHTML = "Trump Solo";
    trump_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'D'
        }));
    });
    round_options.append(trump_solo);

    const heart_solo = document.createElement("button");
    heart_solo.innerHTML = "Heart Solo";
    heart_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'H'
        }));
    });
    round_options.append(heart_solo);

    const spade_solo = document.createElement("button");
    spade_solo.innerHTML = "Spade Solo";
    spade_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'S'
        }));
    });
    round_options.append(spade_solo);

    const club_solo = document.createElement("button");
    club_solo.innerHTML = "Club Solo";
    club_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'C'
        }));
    });
    round_options.append(club_solo);

    if (queens) {
        const gets_along = document.createElement("button");
        gets_along.innerHTML = "... Gets Along";
        gets_along.addEventListener("click", () => {
            const card = (<HTMLInputElement>document.getElementById('get_along_card')).value;
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'card',
                suit: card.charAt(1),
                val: card.charAt(0)
            }))
        });

        const get_along_card = document.createElement("input");
        get_along_card.id = "get_along_card";
        get_along_card.value = 'AS';
        get_along_card.type = 'text';
        round_options.append(get_along_card);
        round_options.append(gets_along);
    }

}