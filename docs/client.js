var socket;
var my_name;
var clear_table = false;
var suits = { 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades', 'C': 'Clubs' };
var vals = { '7': 'Seven', '8': 'Eight', '9': 'Nine', 'K': 'King', 'T': 'Ten', 'A': 'Ace', 'J': 'Jack', 'Q': 'Queen' };
var scrolled = false;
var log_elem;
window.addEventListener('load', function () {
    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", function (e) {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 200)
            scrolled = false;
        else
            scrolled = true;
    });
    var send_btn = document.getElementById("send-btn");
    var send_text = document.getElementById("send-text");
    var send_msg = function () {
        var msg = send_text.value;
        if (msg.length > 0) {
            socket.send(JSON.stringify({
                event: 'msg',
                msg: msg
            }));
            send_text.value = "";
        }
    };
    send_btn.addEventListener("click", send_msg);
    send_text.addEventListener("keypress", function (e) {
        if (e.code.toUpperCase() === 'ENTER') {
            e.preventDefault();
            send_msg();
        }
    });
    socket = new WebSocket("ws://localhost:3000");
    socket.onclose = function () {
        var msg = "You have been disconnected from the server... Please reload the page and try again.";
        log(msg, "error");
    };
    socket.onopen = function () {
        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server!", "server");
        document.getElementById("table-form").removeAttribute("style");
        log("Welcome to Sheepshead Online!", "announcement");
        setTimeout(function () {
            log("Play with others by creating a table and sharing the table name and password with other players.", "announcement");
            setTimeout(function () {
                log("Already have a table? Enter the table name and password in the form to join the table.", "announcement");
                setTimeout(function () {
                    log("There must be 4 players at a table to play. The table information and player balances will be stored so you can keep playing later!", "announcement");
                    setTimeout(function () {
                        log("Have fun :)", "announcement");
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
        setInterval(function () {
            socket.send(JSON.stringify({ 'event': 'ping' }));
        }, 5000);
    };
    socket.onmessage = function (me) {
        try {
            var data = JSON.parse(me.data);
            console.log(data);
            switch (data.event) {
                case 'ping':
                    console.log("ping");
                    break;
                case 'table-created':
                    log("Table Created!", 'server');
                    break;
                case 'player-connected': {
                    log(data.player_name + " has connected to the table!", 'server');
                    var table_form = document.getElementById('table-form');
                    if (table_form)
                        table_form.remove();
                    (document.getElementById('game-area')).removeAttribute('style');
                    break;
                }
                case 'player-joined':
                    log(data.player_name + " has joined the table!", 'server');
                    break;
                case 'player-dc':
                    log(data.player_name + " has disconnected from the table...", 'server');
                    break;
                case 'card-played': {
                    if (clear_table) {
                        clear_table_cards();
                        var last_trick = Array.from(document.getElementsByClassName("game"));
                        last_trick.forEach(function (msg) {
                            msg.parentElement.remove();
                        });
                    }
                    if (data.player_name === my_name) {
                        document.getElementById("my-card-shelf").append(card_elem(data.card, false, 'animate-transform-up'));
                    }
                    else {
                        document.getElementById("card-holder-" + data.player_name).append(card_elem(data.card, false, 'animate-transform-down'));
                    }
                    if (data.last_trick) {
                        var last_trick = "Last Trick: ";
                        for (var i = 0; i < data.last_trick.length; i++) {
                            last_trick += text_card(data.last_trick[i]) + (i < data.last_trick.length - 1 ? ',' : '');
                        }
                        log(last_trick, 'game');
                    }
                    log(data.player_name + " played " + text_card(data.card) + ".", "game");
                    if (data.winner) {
                        log(data.winner + " has taken the trick!", 'strategy');
                        clear_table = true;
                        var card_holder = data.winner === my_name ? document.getElementById("my-card-shelf") : document.getElementById("card-holder-" + data.winner);
                        card_holder.getElementsByClassName('card')[0].classList.add('winner');
                    }
                    if (data.player_turn) {
                        set_turn(data.player_turn);
                        log("It is " + data.player_turn + "'" + (data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's') + " turn to play a card...", 'game');
                    }
                    update_hand(data.my_hand, data.trump);
                    if (data.winners) {
                        var winners = '';
                        for (var i = 0; i < data.winners.players.length; i++) {
                            winners += data.winners.players[i].name + (i < data.winners.players.length - 1 ? ', ' : '');
                        }
                        log(winners + " " + (data.winners.players.length > 1 ? 'have' : 'has') + " won the round with " + data.winners.points + " points! Winnings: $" + data.payment.toFixed(2), "strategy");
                        var balances = '';
                        var players_1 = data.winners.players.concat(data.losers.players);
                        for (var i = 0; i < players_1.length; i++) {
                            balances += "[" + players_1[i].name + ": $" + players_1[i].balance.toFixed(2) + "] ";
                        }
                        log("Player Balances: " + balances, 'strategy');
                    }
                    break;
                }
                case 'deal':
                    clear_table_cards();
                    log("Cards have been dealt! Waiting for players to ready up...", 'game');
                    update_hand(data.cards, 'D', true);
                    start_round(data.cards);
                    break;
                case 'table-update': {
                    update_hand(data.my_hand);
                    my_name = data.me.name;
                    var me_1 = document.getElementById("me");
                    me_1.innerHTML = "";
                    me_1.append(player_elem(data.me));
                    var card_shelf = document.getElementById("card-shelf");
                    card_shelf.innerHTML = "";
                    var player_shelf = document.getElementById("player-shelf");
                    player_shelf.innerHTML = "";
                    for (var i = 0; i < data.other_players.length; i++) {
                        var player = data.other_players[i];
                        player_shelf.append(player_elem(player));
                        var card_holder = document.createElement("div");
                        card_holder.classList.add("card-holder");
                        card_holder.id = "card-holder-" + player.name;
                        card_shelf.append(card_holder);
                    }
                    break;
                }
                case 'error':
                    log(data.msg, 'error');
                    break;
                case 'msg':
                    log(data.player_name + ": " + data.msg);
                    break;
                case 'ready': {
                    log(data.player_name + " is ready!", 'game');
                    var ready = document.createElement("div");
                    ready.innerHTML = "Ready";
                    ready.classList.add("player-ready");
                    var player_elem_1 = document.getElementById("player-" + data.player_name);
                    player_elem_1.append(ready);
                    player_elem_1.classList.add("ready");
                    break;
                }
                case 'round-start':
                    var round_options = document.getElementById('round-options');
                    round_options.innerHTML = "";
                    round_options.setAttribute("style", "display: none");
                    if (data.strategy_call) {
                        log(data.strategy_call, 'strategy');
                        window.alert(data.strategy_call);
                    }
                    set_turn(data.player_turn);
                    log("It is " + data.player_turn + "'" + (data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's') + " turn to play a card...", 'game');
                    update_hand(data.my_hand, data.trump);
                    var players = Array.from(document.getElementsByClassName("player"));
                    players.forEach(function (elem) {
                        elem.classList.remove("ready");
                        Array.from(elem.getElementsByClassName("player-ready")).forEach(function (elem) {
                            elem.remove();
                        });
                    });
                    break;
            }
        }
        catch (err) {
            console.error(err);
        }
    };
});
function join_table() {
    var name = document.getElementById('table-name').value;
    var pass = document.getElementById('table-password').value;
    var event = document.getElementById('table-options').value;
    var player_name = document.getElementById('table-player').value;
    if (name && pass && event && player_name) {
        if (name.length < 4 || pass.length < 4) {
            log("Table name and password must be at least 4 characters long.", "error");
        }
        else if (player_name.length < 3) {
            log("Your player name must be at least 3 characters long.", "error");
        }
        else {
            socket.send(JSON.stringify({
                event: event,
                table_name: name,
                table_password: pass,
                player_name: player_name
            }));
        }
    }
}
;
function log(msg, className) {
    if (className === void 0) { className = "none"; }
    var row = document.createElement('tr');
    var head = document.createElement('th');
    head.innerHTML = (new Date()).toLocaleTimeString();
    var data = document.createElement('td');
    data.innerHTML = msg;
    data.classList.add(className);
    row.append(head);
    row.append(data);
    row.classList.add("fade-in");
    setTimeout(function () {
        row.classList.add("visible");
    }, 0);
    document.getElementById("log-messages").append(row);
    if (!scrolled)
        log_elem.scrollTop = log_elem.scrollHeight;
    if (document.getElementById('log-area').classList.contains('hide-log')) {
        var log_1 = document.getElementById("temp-log");
        var temp_1 = document.createElement("div");
        temp_1.classList.add("temp-msg");
        if (className)
            temp_1.classList.add(className);
        temp_1.innerHTML = msg;
        log_1.append(temp_1);
        setTimeout(function () {
            temp_1.setAttribute('style', 'opacity: 0.0');
        }, 0);
        setTimeout(function () {
            temp_1.remove();
        }, 1000);
    }
}
function toggle_chat() {
    var toggle_chat = document.getElementById('toggle-chat');
    var log = document.getElementById('log-area');
    var visible = !log.classList.contains("hide-log");
    log.classList.toggle("hide-log");
    toggle_chat.innerHTML = visible ? "Show Chat" : "Hide Chat";
}
function set_turn(name) {
    var player = document.getElementById("player-" + name);
    var last_turn = Array.from(document.getElementsByClassName('player-turn'));
    last_turn.forEach(function (elem) {
        elem.classList.remove('player-turn');
    });
    player.classList.add("player-turn");
}
function player_elem(player) {
    var elem = document.createElement("div");
    var name = document.createElement("div");
    var balance = document.createElement("div");
    elem.id = "player-" + player.name;
    elem.classList.add("player");
    name.classList.add("player-name");
    name.innerHTML = player.name;
    balance.classList.add("player-balance");
    balance.innerHTML = "$" + player.balance.toFixed(2);
    elem.append(name);
    elem.append(document.createElement("hr"));
    elem.append(balance);
    if (player.dealer) {
        var dealer = document.createElement("div");
        dealer.innerHTML = "Dealer";
        dealer.classList.add("dealer");
        elem.append(dealer);
    }
    return elem;
}
function clear_table_cards() {
    var play_area = document.getElementById('play-area');
    var cards = Array.from(play_area.getElementsByClassName("card"));
    for (var i = 0; i < cards.length; i++) {
        console.log(cards[i]);
        cards[i].remove();
    }
    clear_table = false;
}
function update_hand(cards, trump, animate) {
    if (trump === void 0) { trump = 'D'; }
    if (animate === void 0) { animate = false; }
    var unsorted = cards.filter(function (c) { return true; });
    var sort_hand = document.getElementById("sort-hand");
    var sort = sort_hand.checked;
    sort_hand.onclick = function (e) {
        e.stopPropagation();
        update_hand(unsorted, trump);
    };
    if (sort) {
        cards = cards.sort(function (a, b) {
            var suits = { 'D': 0, 'H': 1, 'S': 2, 'C': 3 };
            var vals = { '7': 0, '8': 1, '9': 2, 'K': 3, 'T': 4, 'A': 5, 'J': 6, 'Q': 7 };
            var suit_a = suits[a.charAt(1)];
            var suit_b = suits[b.charAt(1)];
            var val_a = vals[a.charAt(0)];
            var val_b = vals[b.charAt(0)];
            var trump_a = (val_a > 5 || a.charAt(1) === trump);
            var trump_b = (val_b > 5 || b.charAt(1) === trump);
            if (!trump_a && !trump_b) {
                var diff = suit_a - suit_b;
                if (diff === 0) {
                    return val_a - val_b;
                }
                else {
                    return diff;
                }
            }
            else if (trump_a && trump_b) {
                var diff = val_a - val_b;
                if (diff === 0) {
                    return suit_a - suit_b;
                }
                else {
                    return diff;
                }
            }
            else {
                return (trump_a ? 1 : -1) - (trump_b ? 1 : -1);
            }
        });
    }
    var hand = document.getElementById("my-hand");
    hand.innerHTML = "";
    var _loop_1 = function (i) {
        var card = cards[i];
        if (animate) {
            setTimeout(function () {
                hand.innerHTML = "";
                for (var j = 0; j <= i; j++) {
                    hand.append(card_elem(cards[j], true));
                }
            }, i * 100);
        }
        else {
            hand.append(card_elem(card, true));
        }
    };
    for (var i = 0; i < cards.length; i++) {
        _loop_1(i);
    }
}
function card_elem(card, playable, animation) {
    if (playable === void 0) { playable = false; }
    var val = card.charAt(0);
    var suit = card.charAt(1);
    if (val.toUpperCase() === 'T')
        val = '10';
    var play_card = document.createElement("div");
    play_card.classList.add("card");
    play_card.classList.add(suit);
    var value = document.createElement("div");
    value.classList.add("card-value");
    value.innerHTML = val;
    play_card.append(value);
    play_card.append(suit_img(suit));
    play_card.append(suit_img(suit, true));
    if (playable) {
        play_card.classList.add("playable");
        play_card.addEventListener("click", function () {
            socket.send(JSON.stringify({
                event: 'play-card',
                card: card
            }));
        });
    }
    if (animation) {
        play_card.classList.add(animation);
        setTimeout(function () {
            play_card.classList.add('animate-transform');
        }, 0);
    }
    return play_card;
}
function text_card(card) {
    var str = '';
    var val = card.charAt(0);
    var suit = card.charAt(1);
    if (val.toUpperCase() === 'T')
        val = '10';
    str += val;
    str += suit_img(suit, true).outerHTML;
    return str;
}
function suit_img(suit, small) {
    if (small === void 0) { small = false; }
    var img = document.createElement("img");
    var src = '';
    switch (suit) {
        case 'D':
            src = "img/diamond" + (small ? '_sm' : '') + ".png";
            break;
        case 'H':
            src = "img/heart" + (small ? '_sm' : '') + ".png";
            break;
        case 'S':
            src = "img/spade" + (small ? '_sm' : '') + ".png";
            break;
        case 'C':
            src = "img/club" + (small ? '_sm' : '') + ".png";
            break;
    }
    img.src = src;
    img.classList.add('suit-img');
    if (small) {
        img.classList.add('suit-sm');
    }
    return img;
}
function start_round(cards) {
    var queens = cards.includes('QC') && cards.includes('QS');
    var round_options = document.getElementById("round-options");
    round_options.innerHTML = "";
    round_options.removeAttribute("style");
    var ready = document.createElement("button");
    ready.innerHTML = "Ready";
    ready.addEventListener("click", function () {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'ready'
        }));
    });
    round_options.append(ready);
    if (queens) {
        var first_trick = document.createElement("button");
        first_trick.innerHTML = "First Trick";
        first_trick.addEventListener("click", function () {
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'first-trick'
            }));
        });
        round_options.append(first_trick);
    }
    var trump_solo = document.createElement("button");
    trump_solo.innerHTML = "Trump Solo";
    trump_solo.addEventListener("click", function () {
        var _a;
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'D',
            deux: (_a = document.getElementById("solo-deux")) === null || _a === void 0 ? void 0 : _a.checked
        }));
    });
    round_options.append(trump_solo);
    var heart_solo = document.createElement("button");
    heart_solo.innerHTML = "Heart Solo";
    heart_solo.addEventListener("click", function () {
        var _a;
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'H',
            deux: (_a = document.getElementById("solo-deux")) === null || _a === void 0 ? void 0 : _a.checked
        }));
    });
    round_options.append(heart_solo);
    var spade_solo = document.createElement("button");
    spade_solo.innerHTML = "Spade Solo";
    spade_solo.addEventListener("click", function () {
        var _a;
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'S',
            deux: (_a = document.getElementById("solo-deux")) === null || _a === void 0 ? void 0 : _a.checked
        }));
    });
    round_options.append(spade_solo);
    var club_solo = document.createElement("button");
    club_solo.innerHTML = "Club Solo";
    club_solo.addEventListener("click", function () {
        var _a;
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'C',
            deux: (_a = document.getElementById("solo-deux")) === null || _a === void 0 ? void 0 : _a.checked
        }));
    });
    round_options.append(club_solo);
    if (queens) {
        var solo_deux_container = document.createElement("span");
        solo_deux_container.id = 'solo-deux-container';
        var solo_deux = document.createElement("input");
        solo_deux.type = 'checkbox';
        solo_deux.checked = false;
        solo_deux.id = "solo-deux";
        solo_deux_container.innerHTML = "Solo Deux ";
        solo_deux_container.append(solo_deux);
        round_options.append(solo_deux_container);
        var gets_along = document.createElement("button");
        gets_along.innerHTML = "... Gets Along";
        gets_along.addEventListener("click", function () {
            var card = document.getElementById('get_along_card').value;
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'card',
                suit: card.charAt(1),
                val: card.charAt(0)
            }));
        });
        var get_along_card = document.createElement("select");
        get_along_card.id = "get_along_card";
        get_along_card.setAttribute("placeholder", "Select a Card...");
        var val_keys = Object.keys(vals);
        var suit_keys = Object.keys(suits);
        for (var s = 0; s < suit_keys.length; s++) {
            for (var v = 0; v < val_keys.length; v++) {
                var card = val_keys[v] + suit_keys[s];
                var option = document.createElement("option");
                option.innerHTML = vals[val_keys[v]] + " of " + suits[suit_keys[s]];
                option.value = card;
                get_along_card.append(option);
            }
        }
        round_options.append(get_along_card);
        round_options.append(gets_along);
    }
}
