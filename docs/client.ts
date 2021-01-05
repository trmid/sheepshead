
let socket: WebSocket;
let my_name: string;
let clear_table = false;

const suits: any = { 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades', 'C': 'Clubs' };
const vals: any = { '7': 'Seven', '8': 'Eight', '9': 'Nine', 'K': 'King', 'T': 'Ten', 'A': 'Ace', 'J': 'Jack', 'Q': 'Queen' };

// Log Scroll check
let scrolled = false;
let log_elem: HTMLElement;

window.addEventListener('load', () => {

    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", (e) => {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 200) scrolled = false;
        else scrolled = true;
    });

    const send_btn = <HTMLButtonElement>document.getElementById("send-btn");
    const send_text = <HTMLTextAreaElement>document.getElementById("send-text");
    const send_msg = () => {
        const msg = send_text.value;
        if (msg.length > 0) {
            socket.send(JSON.stringify({
                event: 'msg',
                msg: msg
            }));
            send_text.value = "";
        }
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
    socket = new WebSocket("ws://localhost:3000");

    socket.onclose = () => {
        const msg = "You have been disconnected from the server... Please reload the page and try again.";
        log(msg, "error");
    };

    socket.onopen = () => {
        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server!", "server");
        document.getElementById("table-form").removeAttribute("style"); // show table form

        log("Welcome to Sheepshead Online!", "announcement");
        setTimeout(() => {
            log("Play with others by creating a table and sharing the table name and password with other players.", "announcement");
            setTimeout(() => {
                log("Already have a table? Enter the table name and password in the form to join the table.", "announcement");
                setTimeout(() => {
                    log("There must be 4 players at a table to play. The table information and player balances will be stored so you can keep playing later!", "announcement");
                    setTimeout(() => {
                        log("Have fun :)", "announcement");
                    }, 100);
                }, 100);
            }, 100);
        }, 100);

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
                case 'player-connected': {
                    log(`${data.player_name} has connected to the table!`, 'server');
                    // hide the table form
                    const table_form = document.getElementById('table-form')
                    if (table_form) table_form.remove();
                    // show the player shelf
                    (document.getElementById('game-area')).removeAttribute('style');
                    break;
                }
                case 'player-joined':
                    log(`${data.player_name} has joined the table!`, 'server');
                    break;
                case 'player-dc':
                    log(`${data.player_name} has disconnected from the table...`, 'server');
                    break;
                case 'card-played': {

                    // Append to table
                    if (clear_table) {
                        clear_table_cards();
                        // Also clear last trick messages
                        const last_trick = Array.from(document.getElementsByClassName("game"));
                        last_trick.forEach(msg => {
                            msg.parentElement.remove();
                        });
                    }
                    if (data.player_name === my_name) {
                        document.getElementById("my-card-shelf").append(card_elem(data.card, false, 'animate-transform-up'));
                    } else {
                        document.getElementById(`card-holder-${data.player_name}`).append(card_elem(data.card, false, 'animate-transform-down'));
                    }

                    // Log last trick
                    if (data.last_trick) {
                        let last_trick = "Last Trick: ";
                        for (let i = 0; i < data.last_trick.length; i++) {
                            last_trick += text_card(data.last_trick[i]) + (i < data.last_trick.length - 1 ? ',' : '');
                        }
                        log(last_trick, 'game');
                    }

                    // log
                    log(`${data.player_name} played ${text_card(data.card)}.`, "game");
                    if (data.winner) {
                        log(`${data.winner} has taken the trick!`, 'strategy');
                        clear_table = true;
                        const card_holder = data.winner === my_name ? document.getElementById("my-card-shelf") : document.getElementById(`card-holder-${data.winner}`);
                        card_holder.getElementsByClassName('card')[0].classList.add('winner');
                    }
                    if (data.player_turn) {
                        set_turn(data.player_turn);
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
                }
                case 'deal':

                    // Remove last trick
                    clear_table_cards();

                    log(`Cards have been dealt! Waiting for players to ready up...`, 'game');
                    update_hand(data.cards, 'D', true);
                    start_round(data.cards);
                    break;
                case 'table-update': {
                    update_hand(data.my_hand);
                    my_name = data.me.name; // update player name

                    const me = document.getElementById("me");
                    me.innerHTML = "";
                    me.append(player_elem(data.me));

                    const card_shelf = document.getElementById("card-shelf");
                    card_shelf.innerHTML = "";

                    const player_shelf = document.getElementById("player-shelf");
                    player_shelf.innerHTML = "";
                    for (let i = 0; i < data.other_players.length; i++) {
                        const player = data.other_players[i];
                        player_shelf.append(player_elem(player));

                        const card_holder = document.createElement("div");
                        card_holder.classList.add("card-holder");
                        card_holder.id = `card-holder-${player.name}`;
                        card_shelf.append(card_holder);
                    }

                    break;
                }
                case 'error':
                    log(data.msg, 'error');
                    break;
                case 'msg':
                    log(`${data.player_name}: ${data.msg}`);
                    break;
                case 'ready': {
                    log(`${data.player_name} is ready!`, 'game');

                    const ready = document.createElement("div");
                    ready.innerHTML = "Ready";
                    ready.classList.add("player-ready");
                    const player_elem = document.getElementById(`player-${data.player_name}`)
                    player_elem.append(ready);
                    player_elem.classList.add("ready");
                    break;
                }
                case 'round-start':
                    const round_options = document.getElementById('round-options');
                    round_options.innerHTML = "";
                    round_options.setAttribute("style", "display: none");
                    if (data.strategy_call) {
                        log(data.strategy_call, 'strategy');
                        window.alert(data.strategy_call);
                    }
                    set_turn(data.player_turn);
                    log(`It is ${data.player_turn}'${data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's'} turn to play a card...`, 'game');
                    update_hand(data.my_hand, data.trump);

                    // Remove ready markers
                    const players = Array.from(document.getElementsByClassName("player"));
                    players.forEach(elem => {
                        elem.classList.remove("ready");
                        Array.from(elem.getElementsByClassName("player-ready")).forEach(elem => {
                            elem.remove();
                        });
                    })

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
    row.classList.add("fade-in");
    setTimeout(() => {
        row.classList.add("visible");
    }, 0);
    document.getElementById("log-messages").append(row);
    if (!scrolled) log_elem.scrollTop = log_elem.scrollHeight;

    // temp log if chat not visible
    if (document.getElementById('log-area').classList.contains('hide-log')) {
        const log = document.getElementById("temp-log");
        const temp = document.createElement("div");
        temp.classList.add("temp-msg");
        if (className) temp.classList.add(className);
        temp.innerHTML = msg;
        log.append(temp);
        setTimeout(() => {
            temp.setAttribute('style', 'opacity: 0.0');
        }, 200);
        setTimeout(() => {
            temp.remove();
        }, 1200);
    }
}

// Toggle chat
function toggle_chat() {
    const toggle_chat = document.getElementById('toggle-chat');
    const log = document.getElementById('log-area');
    const visible = !log.classList.contains("hide-log");
    log.classList.toggle("hide-log");
    toggle_chat.innerHTML = visible ? "Show Chat" : "Hide Chat";
}

// Set player turn
function set_turn(name: string) {
    const player = document.getElementById(`player-${name}`);
    const last_turn = Array.from(document.getElementsByClassName('player-turn'));
    last_turn.forEach(elem => {
        elem.classList.remove('player-turn');
    });
    player.classList.add("player-turn");
}

// Create Player Element
function player_elem(player: any) {
    const elem = document.createElement("div");
    const name = document.createElement("div");
    const balance = document.createElement("div");

    elem.id = `player-${player.name}`;
    elem.classList.add("player");

    name.classList.add("player-name");
    name.innerHTML = player.name;

    balance.classList.add("player-balance");
    balance.innerHTML = `$${player.balance.toFixed(2)}`;

    elem.append(name);
    elem.append(document.createElement("hr"));
    elem.append(balance);

    if (player.dealer) {
        const dealer = document.createElement("div");
        dealer.innerHTML = "Dealer";
        dealer.classList.add("dealer");
        elem.append(dealer);
    }

    return elem;
}

// Clear table cards
function clear_table_cards() {
    const play_area = document.getElementById('play-area');
    const cards = Array.from(play_area.getElementsByClassName("card"));
    for (let i = 0; i < cards.length; i++) {
        console.log(cards[i]);
        cards[i].remove();
    }
    clear_table = false;
}

// Update Hand
function update_hand(cards: string[], trump = 'D', animate = false) {

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
    const hand = document.getElementById("my-hand");
    hand.innerHTML = "";
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (animate) {
            setTimeout(() => {
                hand.innerHTML = "";
                for (let j = 0; j <= i; j++) {
                    hand.append(card_elem(cards[j], true));
                }
            }, i * 100);
        } else {
            hand.append(card_elem(card, true));
        }
    }
}

// Card Element
function card_elem(card: string, playable = false, animation?: string) {
    let val = card.charAt(0);
    const suit = card.charAt(1);
    if (val.toUpperCase() === 'T') val = '10'; // convert T to 10

    const play_card = document.createElement("div");
    play_card.classList.add("card");
    play_card.classList.add(suit);

    const value = document.createElement("div");
    value.classList.add("card-value");
    value.innerHTML = val;
    play_card.append(value);
    play_card.append(suit_img(suit));
    play_card.append(suit_img(suit, true));

    if (playable) {
        play_card.classList.add("playable");
        play_card.addEventListener("click", () => {
            socket.send(JSON.stringify({
                event: 'play-card',
                card: card
            }));
        });
    }

    if (animation) {
        play_card.classList.add(animation);
        setTimeout(() => {
            play_card.classList.add('animate-transform');
        }, 0);
    }

    return play_card;
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
    round_options.removeAttribute("style");

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
            suit: 'D',
            deux: (<HTMLInputElement>document.getElementById("solo-deux"))?.checked
        }));
    });
    round_options.append(trump_solo);

    const heart_solo = document.createElement("button");
    heart_solo.innerHTML = "Heart Solo";
    heart_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'H',
            deux: (<HTMLInputElement>document.getElementById("solo-deux"))?.checked
        }));
    });
    round_options.append(heart_solo);

    const spade_solo = document.createElement("button");
    spade_solo.innerHTML = "Spade Solo";
    spade_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'S',
            deux: (<HTMLInputElement>document.getElementById("solo-deux"))?.checked
        }));
    });
    round_options.append(spade_solo);

    const club_solo = document.createElement("button");
    club_solo.innerHTML = "Club Solo";
    club_solo.addEventListener("click", () => {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'C',
            deux: (<HTMLInputElement>document.getElementById("solo-deux"))?.checked
        }));
    });
    round_options.append(club_solo);

    if (queens) {

        const solo_deux_container = document.createElement("span");
        solo_deux_container.id = 'solo-deux-container';
        const solo_deux = document.createElement("input");
        solo_deux.type = 'checkbox';
        solo_deux.checked = false;
        solo_deux.id = "solo-deux";
        solo_deux_container.innerHTML = "Solo Deux ";
        solo_deux_container.append(solo_deux);
        round_options.append(solo_deux_container);

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

        const get_along_card = document.createElement("select");
        get_along_card.id = "get_along_card";
        get_along_card.setAttribute("placeholder", "Select a Card...");
        const val_keys = Object.keys(vals);
        const suit_keys = Object.keys(suits);
        for (let s = 0; s < suit_keys.length; s++) {
            for (let v = 0; v < val_keys.length; v++) {
                const card = val_keys[v] + suit_keys[s];
                const option = document.createElement("option");
                option.innerHTML = vals[val_keys[v]] + " of " + suits[suit_keys[s]];
                option.value = card;
                get_along_card.append(option);
            }
        }

        round_options.append(get_along_card);
        round_options.append(gets_along);
    }

}