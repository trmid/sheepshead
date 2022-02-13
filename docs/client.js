var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
var socket;
var my_name;
var clear_table = false;
var suits = { 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades', 'C': 'Clubs' };
var vals = { '7': 'Seven', '8': 'Eight', '9': 'Nine', 'K': 'King', 'T': 'Ten', 'A': 'Ace', 'J': 'Jack', 'Q': 'Queen' };
var scrolled = false;
var log_elem;
var place_card_audio = new Array();
var play_card_audio = new Array();
window.addEventListener('load', function () {
    var query = new URLSearchParams(window.location.search);
    var table_id = query.get("id");
    if (table_id && table_id.length > 0) {
        var container = document.createElement("div");
        container.id = "loading-container";
        var header = document.createElement("h3");
        header.innerHTML = "Joining Table";
        var spinner = document.createElement("div");
        spinner.classList.add("spinner");
        var spinner_inner = document.createElement("div");
        spinner_inner.classList.add("spinner-inner");
        spinner.append(spinner_inner);
        container.append(header, spinner);
        popup([container]);
    }
    for (var i = 0; i < 8; i++) {
        place_card_audio.push(document.getElementById("place_card_".concat(i)));
    }
    play_card_audio.push(document.getElementById("play_card_0"));
    log_elem = document.getElementById("log");
    log_elem.addEventListener("scroll", function (e) {
        if (log_elem.scrollHeight - log_elem.clientHeight - log_elem.scrollTop <= 200)
            scrolled = false;
        else
            scrolled = true;
    });
    var chat_visible = localStorage.getItem("chat-visible");
    toggle_chat(chat_visible === null ? true : chat_visible === 'true');
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
    var player_name_input = document.querySelector("#table-player");
    if (player_name_input) {
        var player_name = localStorage.getItem("player_name");
        player_name_input.value = player_name !== null && player_name !== void 0 ? player_name : '';
        player_name_input.addEventListener("change", function () {
            if (player_name_input.value.length > 0) {
                localStorage.setItem("player_name", player_name_input.value);
            }
            else {
                localStorage.removeItem("player_name");
            }
        });
    }
    socket = new WebSocket("wss://sheeps-head.herokuapp.com");
    socket.onclose = function () {
        var msg = "You have been disconnected from the server... Please reload the page and try again.";
        log(msg, "error");
    };
    socket.onopen = function () { return __awaiter(_this, void 0, void 0, function () {
        var announce, delay;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    announce = function (msg, delay, className) {
                        if (delay === void 0) { delay = 0; }
                        if (className === void 0) { className = "announcement"; }
                        return new Promise(function (resolve, reject) {
                            setTimeout(function () {
                                try {
                                    resolve(log(msg, className));
                                }
                                catch (err) {
                                    reject(err);
                                }
                            }, delay);
                        });
                    };
                    delay = 200;
                    socket.send(JSON.stringify({
                        event: "connected"
                    }));
                    log("Connected to server!", "server");
                    document.getElementById("table-form").removeAttribute("style");
                    if (!(table_id && table_id.length > 0)) return [3, 2];
                    join_table(table_id);
                    return [4, announce("Joining table...")];
                case 1:
                    _a.sent();
                    return [3, 10];
                case 2: return [4, announce("Welcome to Sheepshead Online!", delay)];
                case 3:
                    _a.sent();
                    return [4, announce("Play with others by creating a table and sharing the table link or 6-character code with other players.", delay)];
                case 4:
                    _a.sent();
                    return [4, announce("There must be 4 players at a table to play. The table information and player balances will be stored so you can keep playing later!", delay)];
                case 5:
                    _a.sent();
                    return [4, announce("However, if a table has not used within the last 2 weeks it will be removed.", delay)];
                case 6:
                    _a.sent();
                    return [4, announce("Have fun :)", delay)];
                case 7:
                    _a.sent();
                    return [4, announce("Have any feedback? Email me at <a href='mailto: sheapshead@pernetsystems.com'>sheepshead@pernetsystems.com</a>.", delay, "none")];
                case 8:
                    _a.sent();
                    return [4, announce("Found a bug? Report it <a href='https://github.com/midpoint68/sheepshead/issues/new'>here</a>.", delay, "none")];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10:
                    setInterval(function () {
                        socket.send(JSON.stringify({ 'event': 'ping' }));
                    }, 1000 * 30);
                    return [2];
            }
        });
    }); };
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
                    show_table_link(data.table_id);
                    break;
                case 'table-joined':
                    hide_popup();
                    var table_form = document.getElementById('table-form');
                    if (table_form)
                        table_form.remove();
                    (document.getElementById('game-area')).removeAttribute('style');
                    break;
                case 'player-connected': {
                    log("".concat(data.player_name, " has connected to the table!"), 'server');
                    break;
                }
                case 'player-joined':
                    log("".concat(data.player_name, " has joined the table!"), 'server');
                    break;
                case 'player-dc':
                    log("".concat(data.player_name, " has disconnected from the table..."), 'server');
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
                        document.getElementById("card-holder-".concat(data.player_name)).append(card_elem(data.card, false, 'animate-transform-down'));
                    }
                    play_card_audio[Math.floor(Math.random() * play_card_audio.length)].play();
                    if (data.last_trick) {
                        var last_trick = "Last Trick: ";
                        for (var i = 0; i < data.last_trick.length; i++) {
                            last_trick += text_card(data.last_trick[i]) + (i < data.last_trick.length - 1 ? ',' : '');
                        }
                        log(last_trick, 'game');
                    }
                    log("".concat(data.player_name, " played ").concat(text_card(data.card), "."), "game");
                    if (data.winner) {
                        log("".concat(data.winner, " has taken the trick!"), 'strategy');
                        clear_table = true;
                        var card_holder = data.winner === my_name ? document.getElementById("my-card-shelf") : document.getElementById("card-holder-".concat(data.winner));
                        card_holder.getElementsByClassName('card')[0].classList.add('winner');
                    }
                    if (data.player_turn) {
                        set_turn(data.player_turn);
                        log("It is ".concat(data.player_turn, "'").concat(data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's', " turn to play a card..."), 'game');
                    }
                    update_hand(data.my_hand, data.trump);
                    if (data.winners) {
                        var winners = '';
                        for (var i = 0; i < data.winners.players.length; i++) {
                            winners += data.winners.players[i].name + (i < data.winners.players.length - 1 ? ', ' : '');
                        }
                        log("".concat(winners, " ").concat(data.winners.players.length > 1 ? 'have' : 'has', " won the round with ").concat(data.winners.points, " points! Winnings: $").concat(data.payment.toFixed(2)), "strategy");
                        var balances = '';
                        var players_1 = data.winners.players.concat(data.losers.players);
                        for (var i = 0; i < players_1.length; i++) {
                            balances += "[".concat(players_1[i].name, ": $").concat(players_1[i].balance.toFixed(2), "] ");
                        }
                        log("Player Balances: ".concat(balances), 'strategy');
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
                        card_holder.id = "card-holder-".concat(player.name);
                        card_shelf.append(card_holder);
                    }
                    break;
                }
                case 'error':
                    hide_popup();
                    log(data.msg, 'error');
                    break;
                case 'msg':
                    log("".concat(data.player_name, ": ").concat(data.msg));
                    break;
                case 'ready': {
                    log("".concat(data.player_name, " is ready!"), 'game');
                    var player_elem_1 = document.getElementById("player-".concat(data.player_name));
                    if (!player_elem_1.classList.contains("ready")) {
                        var ready = document.createElement("div");
                        ready.innerHTML = "Ready";
                        ready.classList.add("player-ready");
                        player_elem_1.append(ready);
                        player_elem_1.classList.add("ready");
                    }
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
                    log("It is ".concat(data.player_turn, "'").concat(data.player_turn.charAt(data.player_turn.length - 1).toUpperCase() == 'S' ? '' : 's', " turn to play a card..."), 'game');
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
function create_table() {
    socket.send(JSON.stringify({
        event: 'create-table'
    }));
}
function join_table(table_id) {
    var player_name = localStorage.getItem("player_name");
    while (!player_name) {
        player_name = window.prompt("Enter your player name to join the table:");
        if (player_name.length < 2 || player_name.length > 20) {
            window.alert("Your player name must be between 2 and 20 characters long.");
            player_name = null;
        }
        else {
            localStorage.setItem("player_name", player_name);
        }
    }
    socket.send(JSON.stringify({
        event: 'join-table',
        table_name: table_id,
        player_name: player_name
    }));
}
function leave_table() {
    if (window.confirm("Are you sure you want to leave the table?")) {
        window.location.assign(window.location.origin + window.location.pathname);
    }
}
function hide_popup() {
    var _a;
    (_a = document.querySelector("#popup-container")) === null || _a === void 0 ? void 0 : _a.classList.remove("show");
}
function popup(content) {
    var container = document.querySelector("#popup-container");
    if (!container)
        throw new Error("Can't find popup container in document...");
    var popup = document.querySelector("#popup");
    if (!popup)
        throw new Error("Can't find popup in document...");
    popup.innerHTML = "";
    popup.append.apply(popup, content);
    container.classList.add("show");
}
function show_table_link(table_id) {
    var fieldset = document.createElement("fieldset");
    var legend = document.createElement("legend");
    legend.innerHTML = "Table Created!";
    var info = document.createElement("p");
    info.innerHTML = "Copy and share the table link or 6-character code with other players to let them join your table:";
    var share_link = "".concat(window.location.origin).concat(window.location.pathname, "?id=").concat(table_id);
    var link = document.createElement("input");
    link.type = "text";
    link.disabled = true;
    link.value = share_link;
    var copy_btn = document.createElement("button");
    copy_btn.innerHTML = "Copy Link";
    var copy_link = function () {
        window.navigator.clipboard.writeText(share_link);
        window.alert("Link copied to clipboard!");
    };
    copy_btn.addEventListener("click", copy_link);
    link.addEventListener("click", copy_link);
    var code = document.createElement("input");
    code.type = "text";
    code.disabled = true;
    code.value = table_id;
    var copy_btn_2 = document.createElement("button");
    copy_btn_2.innerHTML = "Copy Code";
    var copy_code = function () {
        window.navigator.clipboard.writeText(table_id);
        window.alert("Code copied to clipboard!");
    };
    copy_btn_2.addEventListener("click", copy_code);
    code.addEventListener("click", copy_code);
    var continue_btn = document.createElement("button");
    continue_btn.innerHTML = "Join Table";
    continue_btn.addEventListener("click", function () {
        window.location.assign(share_link);
    });
    fieldset.append(legend, info, link, copy_btn, document.createElement('br'), code, copy_btn_2, document.createElement('br'), continue_btn);
    popup([fieldset]);
}
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
        var temp_log = document.getElementById("temp-log");
        var temp_1 = document.createElement("div");
        var temp_text = document.createElement("span");
        temp_text.innerHTML = msg;
        temp_1.classList.add("temp-msg");
        if (className)
            temp_text.classList.add(className);
        temp_1.append(temp_text);
        temp_log.prepend(temp_1);
        setTimeout(function () {
            temp_1.setAttribute('style', 'opacity: 0.0');
        }, 1000);
        setTimeout(function () {
            temp_1.remove();
        }, 2000);
    }
}
function toggle_chat(visible) {
    var toggle_chat = document.getElementById('toggle-chat');
    var log = document.getElementById('log-area');
    visible = visible !== undefined ? visible : log.classList.contains("hide-log");
    log.classList.toggle("hide-log", !visible);
    toggle_chat.innerHTML = visible ? "Hide Chat" : "Show Chat";
    localStorage.setItem("chat-visible", "" + visible);
    if (visible) {
        log_elem.scrollTop = log_elem.scrollHeight;
        scrolled = false;
    }
}
function set_turn(name) {
    var player = document.getElementById("player-".concat(name));
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
    elem.id = "player-".concat(player.name);
    elem.classList.add("player");
    name.classList.add("player-name");
    name.innerHTML = player.name;
    balance.classList.add("player-balance");
    balance.innerHTML = "$".concat(player.balance.toFixed(2));
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
                place_card_audio[i % 8].play();
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
            src = "img/diamond".concat(small ? '_sm' : '', ".png");
            break;
        case 'H':
            src = "img/heart".concat(small ? '_sm' : '', ".png");
            break;
        case 'S':
            src = "img/spade".concat(small ? '_sm' : '', ".png");
            break;
        case 'C':
            src = "img/club".concat(small ? '_sm' : '', ".png");
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
    var ready_choice = function (elem) {
        document.querySelectorAll(".ready-choice").forEach(function (elem) { return elem.classList.remove("ready-choice"); });
        elem.classList.add("ready-choice");
    };
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
        ready_choice(ready);
    });
    round_options.append(ready);
    if (queens) {
        var first_trick_1 = document.createElement("button");
        first_trick_1.innerHTML = "First Trick";
        first_trick_1.addEventListener("click", function () {
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'first-trick'
            }));
            ready_choice(first_trick_1);
        });
        round_options.append(first_trick_1);
    }
    var solo = document.createElement("button");
    solo.innerHTML = "Solo";
    solo.addEventListener("click", function () {
        var selector = suit_selector(function (suit) {
            socket.send(JSON.stringify({
                event: "ready",
                call: "solo",
                suit: suit,
                du: false
            }));
            ready_choice(solo);
        }, {
            title: "Solo: "
        });
        var bb = solo.getBoundingClientRect();
        document.body.append(selector);
        selector.style.position = "fixed";
        selector.style.top = "".concat(bb.top - (15 + selector.getBoundingClientRect().height), "px");
        selector.style.left = "".concat(bb.left, "px");
    });
    round_options.append(solo);
    var solo_du = document.createElement("button");
    solo_du.innerHTML = "Solo Du";
    solo_du.addEventListener("click", function () {
        var selector = suit_selector(function (suit) {
            socket.send(JSON.stringify({
                event: "ready",
                call: "solo",
                suit: suit,
                du: true
            }));
            ready_choice(solo_du);
        }, {
            title: "Solo Du: "
        });
        var bb = solo_du.getBoundingClientRect();
        document.body.append(selector);
        selector.style.position = "fixed";
        selector.style.top = "".concat(bb.top - (15 + selector.getBoundingClientRect().height), "px");
        selector.style.left = "".concat(bb.left, "px");
    });
    round_options.append(solo_du);
    if (queens) {
        var gets_along_1 = document.createElement("button");
        gets_along_1.innerHTML = "... Gets Along";
        gets_along_1.addEventListener("click", function () {
            var card = document.getElementById('get_along_card').value;
            socket.send(JSON.stringify({
                event: 'ready',
                call: 'card',
                suit: card.charAt(1),
                val: card.charAt(0)
            }));
            ready_choice(gets_along_1);
        });
        gets_along_1.style.marginLeft = "0";
        var get_along_card = document.createElement("select");
        get_along_card.style.marginRight = "0";
        get_along_card.id = "get_along_card";
        get_along_card.setAttribute("placeholder", "Select a Card...");
        var val_keys = Object.keys(vals);
        var suit_keys = Object.keys(suits);
        for (var s = 0; s < suit_keys.length; s++) {
            if (suit_keys[s] !== 'D') {
                for (var v = 0; v < val_keys.length; v++) {
                    if (!(['J', 'Q']).includes(val_keys[v])) {
                        var card = val_keys[v] + suit_keys[s];
                        var option = document.createElement("option");
                        option.innerHTML = vals[val_keys[v]] + " of " + suits[suit_keys[s]];
                        option.value = card;
                        get_along_card.append(option);
                    }
                }
            }
        }
        round_options.append(get_along_card);
        round_options.append(gets_along_1);
    }
}
function suit_selector(on_select, options) {
    if (options === void 0) { options = {}; }
    var vals = [undefined, 'D', 'H', 'S', 'C'];
    var container = document.createElement("div");
    container.classList.add("suit-selector");
    container.addEventListener("click", function (e) {
        e.stopPropagation();
    });
    var remove = function () { container.remove(); };
    if (options.title) {
        var title = document.createElement("span");
        title.style.marginLeft = "0.5em";
        title.innerHTML = options.title;
        container.append(title);
    }
    var _loop_2 = function (suit) {
        var btn = document.createElement("button");
        btn.innerHTML = suit ? suit_img(suit, true).outerHTML : "Cancel";
        btn.addEventListener("click", function () {
            if (suit) {
                on_select(suit);
            }
            else if (options.on_cancel) {
                options.on_cancel();
            }
            remove();
        });
        container.append(btn);
    };
    for (var _i = 0, vals_1 = vals; _i < vals_1.length; _i++) {
        var suit = vals_1[_i];
        _loop_2(suit);
    }
    setTimeout(function () {
        document.addEventListener("click", function () {
            remove();
        }, {
            once: true
        });
    }, 0);
    return container;
}
