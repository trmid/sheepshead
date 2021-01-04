var socket;
var my_name;
var clear_table = false;
var scrolled = false;
var log_elem;
window.addEventListener('load', function () {
    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", function () {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 5)
            scrolled = false;
        else
            scrolled = true;
    });
    var send_btn = document.getElementById("send-btn");
    var send_text = document.getElementById("send-text");
    var send_msg = function () {
        var msg = send_text.value;
        socket.send(JSON.stringify({
            event: 'msg',
            msg: msg
        }));
        send_text.value = "";
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
        log("You have been disconnected from the server...", "error");
    };
    socket.onopen = function () {
        socket.send(JSON.stringify({
            event: "connected"
        }));
        log("Connected to server...");
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
                    (document.getElementById('my-shelf')).removeAttribute('style');
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
                    }
                    if (data.player_name === my_name) {
                        document.getElementById("my-card-shelf").append(card_elem(data.card, false, 'animate-transform-up'));
                    }
                    else {
                        document.getElementById("card-holder-" + data.player_name).append(card_elem(data.card, false, 'animate-transform-down'));
                    }
                    log(data.player_name + " played " + text_card(data.card) + ".", "game");
                    if (data.winner) {
                        log(data.winner + " has taken the trick!", 'strategy');
                        clear_table = true;
                        var card_holder = data.winner === my_name ? document.getElementById("my-card-shelf") : document.getElementById("card-holder-" + data.winner);
                        card_holder.getElementsByClassName('card')[0].classList.add('winner');
                    }
                    if (data.player_turn) {
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
                        var players = data.winners.players.concat(data.losers.players);
                        for (var i = 0; i < players.length; i++) {
                            balances += "[" + players[i].name + ": $" + players[i].balance.toFixed(2) + "] ";
                        }
                        log("Player Balances: " + balances, 'strategy');
                    }
                    break;
                }
                case 'deal':
                    clear_table_cards();
                    log("Cards have been dealt!", 'game');
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
                    document.getElementById('round-options').innerHTML = "";
                    if (data.strategy_call) {
                        log(data.strategy_call, 'strategy');
                    }
                    log("It is " + data.player_turn + "'" + (data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's') + " turn to play a card...", 'game');
                    update_hand(data.my_hand, data.trump);
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
    document.getElementById("log-messages").append(row);
    if (!scrolled)
        log_elem.scrollTop = log_elem.scrollHeight;
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
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'D'
        }));
    });
    round_options.append(trump_solo);
    var heart_solo = document.createElement("button");
    heart_solo.innerHTML = "Heart Solo";
    heart_solo.addEventListener("click", function () {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'H'
        }));
    });
    round_options.append(heart_solo);
    var spade_solo = document.createElement("button");
    spade_solo.innerHTML = "Spade Solo";
    spade_solo.addEventListener("click", function () {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'S'
        }));
    });
    round_options.append(spade_solo);
    var club_solo = document.createElement("button");
    club_solo.innerHTML = "Club Solo";
    club_solo.addEventListener("click", function () {
        socket.send(JSON.stringify({
            event: 'ready',
            call: 'solo',
            suit: 'C'
        }));
    });
    round_options.append(club_solo);
    if (queens) {
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
        var get_along_card = document.createElement("input");
        get_along_card.id = "get_along_card";
        get_along_card.value = 'AS';
        get_along_card.type = 'text';
        round_options.append(get_along_card);
        round_options.append(gets_along);
    }
}
