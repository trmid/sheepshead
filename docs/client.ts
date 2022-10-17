
let socket: WebSocket;
let my_name: string;
let clear_table = false;

const suits: any = { 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades', 'C': 'Clubs' };
const vals: any = { '7': 'Seven', '8': 'Eight', '9': 'Nine', 'K': 'King', 'T': 'Ten', 'A': 'Ace', 'J': 'Jack', 'Q': 'Queen' };

// Log Scroll check
let scrolled = false;
let log_elem: HTMLElement;

// Audio files
const place_card_audio = new Array<HTMLAudioElement>();
const play_card_audio = new Array<HTMLAudioElement>();

window.addEventListener('load', () => {

    // Get Table ID of table we are joining
    const query = new URLSearchParams(window.location.search);
    const table_id = query.get("id");
    if (table_id && table_id.length > 0) {
        const container = document.createElement("div");
        container.id = "loading-container";
        const header = document.createElement("h3");
        header.innerHTML = "Joining Table";
        const spinner = document.createElement("div");
        spinner.classList.add("spinner");
        const spinner_inner = document.createElement("div");
        spinner_inner.classList.add("spinner-inner");
        spinner.append(spinner_inner);
        container.append(header, spinner);
        popup([container]);
    }

    // Load audio files
    for (let i = 0; i < 8; i++) {
        place_card_audio.push(<HTMLAudioElement>document.getElementById(`place_card_${i}`));
    }
    play_card_audio.push(<HTMLAudioElement>document.getElementById("play_card_0"));

    // Load log
    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", (e) => {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 200) scrolled = false;
        else scrolled = true;
    });
    // Toggle chat
    const chat_visible = localStorage.getItem("chat-visible");
    toggle_chat(chat_visible === null ? true : chat_visible === 'true');

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
    });

    // Load player name
    const player_name_input = document.querySelector<HTMLInputElement>("#table-player");
    if (player_name_input) {
        const player_name = localStorage.getItem("player_name");
        player_name_input.value = player_name ?? '';
        player_name_input.addEventListener("change", () => {
            if (player_name_input.value.length > 0) {
                localStorage.setItem("player_name", player_name_input.value);
            } else {
                localStorage.removeItem("player_name");
            }
        });
    }

    /**
     * Change on compile for production
     * 
     * wss://wss.sheepshead.mypernet.com
     * 
     * ws://localhost:3000
     */
    socket = new WebSocket("ws://localhost:3000");

    socket.onclose = () => {
        const msg = "You have been disconnected from the server... Please reload the page and try again.";
        log(msg, "error");
    };

    socket.onopen = async () => {

        const announce = (msg: string, delay = 0, className = "announcement") => {
            return new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    try {
                        resolve(log(msg, className));
                    } catch (err) {
                        reject(err);
                    }
                }, delay);
            });
        };
        const delay = 200;

        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server!", "server");
        document.getElementById("table-form").removeAttribute("style"); // show table form

        // Check if we are joining a table
        if (table_id && table_id.length > 0) {
            join_table(table_id);
            await announce("Joining table...");
        } else {
            await announce("Welcome to Sheepshead Online!", delay);
            await announce("Play with others by creating a table and sharing the table link or 6-character code with other players.", delay);
            await announce("There must be 4 players at a table to play. The table information and player balances will be stored so you can keep playing later!", delay);
            await announce("However, if a table has not used within the last 2 weeks it will be removed.", delay);
            await announce("Have fun :)", delay);
            await announce("Have any feedback? Email me at <a href='mailto: sheapshead@pernetsystems.com'>sheepshead@pernetsystems.com</a>.", delay, "none");
            await announce("Found a bug? Report it <a href='https://github.com/midpoint68/sheepshead/issues/new'>here</a>.", delay, "none");
        }

        setInterval(() => {
            socket.send(JSON.stringify({ 'event': 'ping' }));
        }, 1000 * 30); // Every 30 sec



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
                    show_table_link(data.table_id);
                    break;
                case 'table-joined':
                    // Hide the loading popup
                    hide_popup();
                    // Hide the table form
                    const table_form = document.getElementById('table-form')
                    if (table_form) table_form.remove();
                    // show the player shelf
                    (document.getElementById('game-area')).removeAttribute('style');
                    break;
                case 'player-connected': {
                    log(`${data.player_name} has connected to the table!`, 'server');
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

                    // Play audio
                    play_card_audio[Math.floor(Math.random() * play_card_audio.length)].play();

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
                    hide_popup();
                    log(data.msg, 'error');
                    break;
                case 'msg':
                    log(`${data.player_name}: ${data.msg}`);
                    break;
                case 'ready': {
                    log(`${data.player_name} is ready!`, 'game');
                    const player_elem = document.getElementById(`player-${data.player_name}`);
                    if (!player_elem.classList.contains("ready")) {
                        const ready = document.createElement("div");
                        ready.innerHTML = "Ready";
                        ready.classList.add("player-ready");
                        player_elem.append(ready);
                        player_elem.classList.add("ready");
                    }
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

// Create Table
function create_table() {
    socket.send(JSON.stringify({
        event: 'create-table'
    }));
}

// Join Table
function join_table(table_id: string) {
    let player_name = localStorage.getItem("player_name");
    while (!player_name) {
        player_name = window.prompt("Enter your player name to join the table:");
        if (player_name.length < 2 || player_name.length > 20) {
            window.alert("Your player name must be between 2 and 20 characters long.");
            player_name = null;
        } else {
            // Save to localStorage
            localStorage.setItem("player_name", player_name);
        }
    }
    socket.send(JSON.stringify({
        event: 'join-table',
        table_name: table_id,
        player_name: player_name
    }));
}

// Leave table
function leave_table() {
    if (window.confirm("Are you sure you want to leave the table?")) {
        window.location.assign(window.location.origin + window.location.pathname);
    }
}

// Hide the popup message
function hide_popup() {
    document.querySelector("#popup-container")?.classList.remove("show");
}

// Show a popup message
function popup(content: HTMLElement[]) {
    const container = document.querySelector("#popup-container");
    if (!container) throw new Error("Can't find popup container in document...");
    const popup = document.querySelector("#popup");
    if (!popup) throw new Error("Can't find popup in document...");
    popup.innerHTML = "";
    popup.append(...content);
    container.classList.add("show");
}

// Show table link to copy
function show_table_link(table_id: string) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.innerHTML = "Table Created!";

    // Info
    const info = document.createElement("p");
    info.innerHTML = "Copy and share the table link or 6-character code with other players to let them join your table:";

    // Link
    const share_link = `${window.location.origin}${window.location.pathname}?id=${table_id}`;
    const link = document.createElement("input");
    link.type = "text";
    link.disabled = true;
    link.value = share_link;
    const copy_btn = document.createElement("button");
    copy_btn.innerHTML = "Copy Link";
    const copy_link = () => {
        window.navigator.clipboard.writeText(share_link);
        window.alert("Link copied to clipboard!");
    };
    copy_btn.addEventListener("click", copy_link);
    link.addEventListener("click", copy_link);

    // Code
    const code = document.createElement("input");
    code.type = "text";
    code.disabled = true;
    code.value = table_id;
    const copy_btn_2 = document.createElement("button");
    copy_btn_2.innerHTML = "Copy Code";
    const copy_code = () => {
        window.navigator.clipboard.writeText(table_id);
        window.alert("Code copied to clipboard!");
    };
    copy_btn_2.addEventListener("click", copy_code);
    code.addEventListener("click", copy_code);

    // Continue Button
    const continue_btn = document.createElement("button");
    continue_btn.innerHTML = "Join Table";
    continue_btn.addEventListener("click", () => {
        window.location.assign(share_link);
    });

    // Append all
    fieldset.append(
        legend,
        info,
        link,
        copy_btn,
        document.createElement('br'),
        code,
        copy_btn_2,
        document.createElement('br'),
        continue_btn
    );

    // Create Popup
    popup([fieldset]);
}

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
        const temp_log = document.getElementById("temp-log");
        const temp = document.createElement("div");
        const temp_text = document.createElement("span"); // put text in wrapper so that the parent is removed when the .game divs are removed to prevent cheating... I know, its a little wonk.
        temp_text.innerHTML = msg;
        temp.classList.add("temp-msg");
        if (className) temp_text.classList.add(className);
        temp.append(temp_text);
        temp_log.prepend(temp);
        setTimeout(() => {
            temp.setAttribute('style', 'opacity: 0.0');
        }, 1000);
        setTimeout(() => {
            temp.remove();
        }, 2000);
    }
}

// Toggle chat
function toggle_chat(visible?: boolean) {
    const toggle_chat = document.getElementById('toggle-chat');
    const log = document.getElementById('log-area');
    visible = visible !== undefined ? visible : log.classList.contains("hide-log");
    log.classList.toggle("hide-log", !visible);
    toggle_chat.innerHTML = visible ? "Hide Chat" : "Show Chat";
    localStorage.setItem("chat-visible", "" + visible);
    if (visible) {
        // Scroll to bottom if un-hidden
        log_elem.scrollTop = log_elem.scrollHeight;
        scrolled = false;
    }
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
                place_card_audio[i % 8].play();
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

    const ready_choice = (elem: Element) => {
        document.querySelectorAll(".ready-choice").forEach(elem => elem.classList.remove("ready-choice"));
        elem.classList.add("ready-choice");
    }

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
        ready_choice(ready);
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
            ready_choice(first_trick);
        });
        round_options.append(first_trick);
    }

    const solo = document.createElement("button");
    solo.innerHTML = "Solo";
    solo.addEventListener("click", () => {
        const selector = suit_selector(
            suit => {
                socket.send(JSON.stringify({
                    event: "ready",
                    call: "solo",
                    suit: suit,
                    du: false
                }));
                ready_choice(solo);
            },
            {
                title: "Solo: "
            }
        );
        const bb = solo.getBoundingClientRect();
        document.body.append(selector);
        selector.style.position = "fixed";
        selector.style.top = `${bb.top - (15 + selector.getBoundingClientRect().height)}px`;
        selector.style.left = `${bb.left}px`;
    });
    round_options.append(solo);

    const solo_du = document.createElement("button");
    solo_du.innerHTML = "Solo Du";
    solo_du.addEventListener("click", () => {
        const selector = suit_selector(
            suit => {
                socket.send(JSON.stringify({
                    event: "ready",
                    call: "solo",
                    suit: suit,
                    du: true
                }));
                ready_choice(solo_du);
            },
            {
                title: "Solo Du: "
            }
        );
        const bb = solo_du.getBoundingClientRect();
        document.body.append(selector);
        selector.style.position = "fixed";
        selector.style.top = `${bb.top - (15 + selector.getBoundingClientRect().height)}px`;
        selector.style.left = `${bb.left}px`;
    });
    round_options.append(solo_du);

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
            }));
            ready_choice(gets_along);
        });
        gets_along.style.marginLeft = "0";

        const get_along_card = document.createElement("select");
        get_along_card.style.marginRight = "0";
        get_along_card.id = "get_along_card";
        get_along_card.setAttribute("placeholder", "Select a Card...");
        const val_keys = Object.keys(vals);
        const suit_keys = Object.keys(suits);
        for (let s = 0; s < suit_keys.length; s++) {
            if (suit_keys[s] !== 'D') {
                for (let v = 0; v < val_keys.length; v++) {
                    if (!(['J', 'Q']).includes(val_keys[v])) {
                        const card = val_keys[v] + suit_keys[s];
                        const option = document.createElement("option");
                        option.innerHTML = vals[val_keys[v]] + " of " + suits[suit_keys[s]];
                        option.value = card;
                        get_along_card.append(option);
                    }
                }
            }
        }

        round_options.append(get_along_card);
        round_options.append(gets_along);
    }

}

function suit_selector(on_select: (suit: 'D' | 'H' | 'S' | 'C') => void, options: {
    on_cancel?: () => void,
    title?: string
} = {}) {
    const vals: ('D' | 'H' | 'S' | 'C')[] = [undefined, 'D', 'H', 'S', 'C'];

    // Create Container
    const container = document.createElement("div");
    container.classList.add("suit-selector");
    container.addEventListener("click", e => {
        e.stopPropagation();
    });

    // Create Remove function
    const remove = () => { container.remove() };

    // Append title
    if (options.title) {
        const title = document.createElement("span");
        title.style.marginLeft = "0.5em";
        title.innerHTML = options.title;
        container.append(title);
    }

    // Add Suits
    for (const suit of vals) {
        const btn = document.createElement("button");
        btn.innerHTML = suit ? suit_img(suit, true).outerHTML : "Cancel";
        btn.addEventListener("click", () => {
            if (suit) {
                on_select(suit);
            } else if (options.on_cancel) {
                options.on_cancel();
            }
            remove();
        });
        container.append(btn);
    }

    // Create auto-close listener
    setTimeout(() => {
        document.addEventListener("click", () => {
            remove();
        }, {
            once: true
        });
    }, 0);

    // Return container
    return container;
}