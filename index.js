"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = __importDefault(require("ws"));
const mongodb_1 = __importDefault(require("mongodb"));
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const app = express_1.default();
const port = process.env.PORT || 3000;
const mongo_url = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@sheepshead.oa0bn.mongodb.net/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;
let db;
mongodb_1.default.MongoClient.connect(mongo_url, (err, client) => __awaiter(void 0, void 0, void 0, function* () {
    if (err)
        throw err;
    console.log("Connected to mongodb server...");
    db = client.db(process.env.MONGO_DBNAME);
    if (process.env.DEBUG) {
        yield db.dropCollection("tables");
    }
    try {
        const tables = db.collection("tables");
        yield tables.createIndex({ name: 1 }, { unique: true });
        yield tables.createIndex({ "players.name": 1 });
    }
    catch (err) {
        console.error(err);
    }
}));
let players_active = false;
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    if (players_active && !process.env.DEBUG) {
        players_active = false;
        const res = yield node_fetch_1.default('https://sheeps-head.herokuapp.com');
        console.log('Sending wake up: ', res.status);
    }
    else {
        console.log("No active players... Not sending wake up...");
    }
}), 5 * 60 * 1000);
const player_map = new Map();
const wss = new ws_1.default.Server({ noServer: true });
wss.on('connection', socket => {
    console.log(`Client connected!`);
    socket.on('message', msg => { handle_msg(socket, msg, player_map.get(socket)); });
    socket.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code}, ${reason}`);
        const player = player_map.get(socket);
        if (player) {
            player.disconnect();
            player_map.delete(socket);
        }
    });
});
const server = app.listen(port);
server.on('listening', () => {
    console.log(`Server listening on port ${port}...`);
});
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, socket => {
        wss.emit('connection', socket, req);
    });
});
const table_cache = new Map();
function hash(pass) {
    const hash = crypto_1.default.createHash("sha256");
    hash.update(pass);
    return hash.digest("hex");
}
function valid_pass(pass, hashed) {
    return hash(pass) === hashed;
}
function handle_msg(socket, msg, player) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof msg !== 'string')
            return;
        players_active = true;
        const data = JSON.parse(msg);
        console.log(data);
        switch (data.event) {
            case 'ping': {
                socket.send(JSON.stringify({ 'event': 'ping' }));
                break;
            }
            case 'create-table': {
                try {
                    const hashed = hash(data.table_password);
                    const res = yield db.collection("tables").insertOne({
                        name: data.table_name,
                        hash: hashed,
                        players: []
                    });
                    if (res.result.ok) {
                        table_cache.set(data.table_name, new Table(data.table_name, hashed));
                        socket.send(JSON.stringify({
                            event: 'table-created'
                        }));
                    }
                    else {
                        throw new Error("Table could not be created...");
                    }
                }
                catch (err) {
                    let err_msg = 'There was an unknown error. Please try again...';
                    if (err instanceof mongodb_1.default.MongoError) {
                        if (err.message.includes("duplicate key")) {
                            err_msg = "A table with that name already exists... Please enter a different name.";
                        }
                    }
                    console.error(err);
                    socket.send(JSON.stringify({
                        event: 'error',
                        msg: err_msg
                    }));
                    break;
                }
            }
            case 'join-table': {
                try {
                    let table_exists = !!table_cache.get(data.table_name);
                    if (!table_exists) {
                        const res = db.collection("tables").find({ name: data.table_name });
                        if (yield res.hasNext()) {
                            table_exists = true;
                            const table_data = yield res.next();
                            const table = new Table(table_data.name, table_data.hash);
                            table_cache.set(data.table_name, table);
                            table_data.players.forEach((player_data) => {
                                const player = new Player(player_data.name, table);
                                player.balance = player_data.balance;
                                table.add(player);
                            });
                        }
                    }
                    if (!table_exists) {
                        socket.send(JSON.stringify({
                            event: "error",
                            msg: "The table requested to join does not exists."
                        }));
                    }
                    else {
                        const table = table_cache.get(data.table_name);
                        if (!table)
                            throw new Error("There was an unknown error fetching the table from the cache.");
                        if (valid_pass(data.table_password, table.hash)) {
                            if (!!table.socket_map.get(socket)) {
                                socket.send(JSON.stringify({
                                    event: "error",
                                    msg: "You are already connected to the table."
                                }));
                            }
                            else {
                                let player = undefined;
                                let joined = false;
                                table.players.forEach(p => {
                                    if (p.name === data.player_name) {
                                        if (p.socket) {
                                            socket.send(JSON.stringify({
                                                event: 'error',
                                                msg: 'There is already a player connected with that name... Please try a different name.'
                                            }));
                                            joined = true;
                                        }
                                        else {
                                            player = p;
                                            joined = true;
                                        }
                                    }
                                });
                                if (!joined) {
                                    player = new Player(data.player_name, table);
                                    joined = table.add(player);
                                }
                                if (joined && player) {
                                    player.connect(socket);
                                    player_map.set(socket, player);
                                    if (table.ready() && !table.round) {
                                        yield table.start_round();
                                    }
                                }
                                else if (!joined) {
                                    socket.send(JSON.stringify({
                                        event: 'error',
                                        msg: 'The requested table is full. Could not join the table.'
                                    }));
                                }
                            }
                        }
                        else {
                            socket.send(JSON.stringify({
                                event: 'error',
                                msg: 'Incorrect table name or password. Please try again.'
                            }));
                        }
                    }
                }
                catch (err) {
                    console.error(err);
                }
                break;
            }
            case 'msg': {
                try {
                    if (player) {
                        player.table.send({
                            event: 'msg',
                            player_name: player.name,
                            msg: data.msg
                        });
                    }
                    else {
                        socket.send(JSON.stringify({
                            event: 'error',
                            msg: 'Could not send message. You are not part of a table.'
                        }));
                    }
                }
                catch (err) {
                    console.error(err);
                }
                break;
            }
            case 'play-card': {
                try {
                    if (player) {
                        player.play(data.card);
                    }
                }
                catch (err) {
                    console.error(err);
                }
                break;
            }
            case 'ready': {
                try {
                    if (player) {
                        (_a = player.table.round) === null || _a === void 0 ? void 0 : _a.call(player, data.call, data.deux, data.suit, data.val);
                    }
                }
                catch (err) {
                    console.error(err);
                }
                break;
            }
            case 'deal-again': {
                try {
                    if (player) {
                        player.table.start_round();
                    }
                }
                catch (err) {
                    console.error(err);
                }
                break;
            }
        }
    });
}
class Round {
    constructor(table) {
        this.trick = new Array();
        this.team1 = new Array();
        this.team2 = new Array();
        this.first_trick = false;
        this.turn = 0;
        this.player_ready = new Map();
        this.table = table;
        this.active = table.dealer + 1;
    }
    active_player() {
        return this.table.players[(this.turn + this.active) % 4];
    }
    trump() {
        return this.solo || 'D';
    }
    deal() {
        if (this.table.players.length != 4)
            throw new Error(`Cannot deal to table with ${this.table.players.length} players!`);
        const cards = new Array();
        for (let val = 0; val < 8; val++) {
            for (let suit = 0; suit < 4; suit++) {
                cards.push(Table.val_to_char(val) + Table.suit_to_char(suit));
            }
        }
        for (let shuffle = 0; shuffle < 4; shuffle++) {
            for (let i = 0; i < cards.length; i++) {
                const rand = Math.floor(Math.random() * cards.length);
                const temp = cards[rand];
                cards[rand] = cards[i];
                cards[i] = temp;
            }
        }
        const deals = new Array();
        for (let i = 0; i < 4; i++) {
            const hand = cards.slice(i * 8, (i + 1) * 8);
            deals.push(this.table.players[i].deal(hand, this.table.players[this.turn].name));
        }
        return Promise.all(deals);
    }
    play(card) {
        return __awaiter(this, void 0, void 0, function* () {
            const active_player = this.active_player();
            this.turn++;
            this.trick.push({ player: active_player, card: card });
            const trick = this.trick.map(play => { return { player: play.player.name, card: play.card }; });
            let winner;
            if (this.turn % 4 == 0) {
                const suit = Table.suit_to_num(this.trick[0].card.charAt(1));
                const trump = Table.suit_to_num(this.trump());
                const trump_played = suit == trump || Table.val_to_num(this.trick[0].card.charAt(0)) > 5;
                winner = this.trick.reduce((p, c) => {
                    const p_suit = Table.suit_to_num(p.card.charAt(1));
                    const p_val = Table.val_to_num(p.card.charAt(0));
                    const c_suit = Table.suit_to_num(c.card.charAt(1));
                    const c_val = Table.val_to_num(c.card.charAt(0));
                    const p_is_trump = p_suit == trump || p_val > 5;
                    const c_is_trump = c_suit == trump || c_val > 5;
                    if (c_is_trump) {
                        if (p_is_trump) {
                            if (c_val == p_val) {
                                if (c_suit > p_suit) {
                                    return c;
                                }
                                else {
                                    return p;
                                }
                            }
                            else if (c_val > p_val) {
                                return c;
                            }
                            else {
                                return p;
                            }
                        }
                        else {
                            return c;
                        }
                    }
                    else if (p_is_trump) {
                        return p;
                    }
                    else {
                        if (c_suit == suit) {
                            if (p_suit == suit) {
                                if (c_val > p_val) {
                                    return c;
                                }
                                else {
                                    return p;
                                }
                            }
                            else {
                                return c;
                            }
                        }
                        else if (p_suit == suit) {
                            return p;
                        }
                        else {
                            return c;
                        }
                    }
                }).player;
                this.trick.forEach(trick => {
                    winner.collected.set(trick.card, true);
                });
                this.last_trick = trick.map(t => t.card);
                this.trick = new Array();
                if (this.first_trick && !trump_played) {
                    this.first_trick = false;
                    if (winner == this.queens_player) {
                        this.team2 = this.table.players.filter(p => p != winner);
                    }
                    else {
                        this.team1.push(winner);
                        this.team2 = this.table.players.filter(p => p != winner && p != this.queens_player);
                    }
                }
                this.active = this.table.players.indexOf(winner);
            }
            let payment = 0, winners, losers;
            if (this.turn == 32) {
                let teams = [
                    { players: this.team1, points: 0, trick: false, dealt: new Map(), black_queens: false },
                    { players: this.team2, points: 0, trick: false, dealt: new Map(), black_queens: false }
                ];
                teams.forEach(team => {
                    team.players.forEach(player => {
                        Array.from(player.collected.keys()).forEach(card => {
                            team.points += Table.card_val(card);
                            team.trick = true;
                        });
                        Array.from(player.original_hand.keys()).forEach(card => {
                            team.dealt.set(card, true);
                        });
                    });
                    team.black_queens = !!(team.dealt.get('QS') && team.dealt.get('QC'));
                });
                const multiplier = 0.05;
                if (teams[0].points == teams[1].points) {
                    if (this.solo) {
                        if (teams[0].players.length > 1) {
                            winners = teams[0];
                            losers = teams[1];
                        }
                        else {
                            winners = teams[1];
                            losers = teams[0];
                        }
                    }
                    else if (teams[0].black_queens) {
                        winners = teams[0];
                        losers = teams[1];
                    }
                    else {
                        winners = teams[1];
                        losers = teams[0];
                    }
                }
                else if (teams[0].points > teams[1].points) {
                    winners = teams[0];
                    losers = teams[1];
                }
                else {
                    winners = teams[1];
                    losers = teams[0];
                }
                if (this.solo_deux) {
                    payment = 24 * multiplier;
                }
                else if (this.solo) {
                    payment = 4 * multiplier;
                }
                else {
                    payment = 2 * multiplier;
                    if (losers.points < 31)
                        payment += multiplier * 2;
                    if (!losers.trick)
                        payment += multiplier * 2;
                }
                if (!this.solo_deux) {
                    const team = winners.black_queens ? winners : (losers.black_queens ? losers : undefined);
                    if (team) {
                        if (team.dealt.get('QH')) {
                            if (team.dealt.get('QD')) {
                                payment += multiplier * 4;
                            }
                            else {
                                payment += multiplier * 3;
                            }
                        }
                    }
                }
                if (losers.black_queens && !this.solo_deux) {
                    payment *= 2;
                }
                if (this.solo && this.solo_player) {
                    if (winners.players[0] == this.solo_player) {
                        this.solo_player.balance += losers.players.length * payment;
                        losers.players.forEach((player) => {
                            player.balance -= payment;
                        });
                    }
                    else {
                        this.solo_player.balance -= winners.players.length * payment;
                        winners.players.forEach((player) => {
                            player.balance += payment;
                        });
                    }
                }
                else {
                    winners.players.forEach((player) => {
                        player.balance += payment;
                    });
                    losers.players.forEach((player) => {
                        player.balance -= payment;
                    });
                }
                try {
                    yield db.collection('tables').updateOne({
                        name: this.table.name
                    }, {
                        $set: {
                            players: this.table.players.map(p => { return { name: p.name, balance: p.balance }; })
                        }
                    });
                }
                catch (err) {
                    console.error(err);
                }
                this.table.dealer++;
            }
            const next_player = this.active_player();
            const messages = new Array();
            this.table.players.forEach(player => {
                messages.push(player.send({
                    event: "card-played",
                    player_name: active_player.name,
                    player_turn: next_player.name,
                    card: card,
                    trick: trick,
                    last_trick: trick.length == 1 ? this.last_trick : undefined,
                    trump: this.trump(),
                    my_hand: Array.from(player.hand.keys()),
                    winner: winner === null || winner === void 0 ? void 0 : winner.name,
                    payment: payment,
                    winners: winners ? { players: winners.players.map((p) => { return { name: p.name, balance: p.balance }; }), points: winners.points } : undefined,
                    losers: losers ? { players: losers.players.map((p) => { return { name: p.name, balance: p.balance }; }), points: losers.points } : undefined
                }));
            });
            const res = yield Promise.all(messages);
            if (winners) {
                const self = this;
                setTimeout(() => {
                    self.table.send_table_data();
                }, 2000);
                setTimeout(() => {
                    self.table.start_round();
                }, 5000);
            }
            return res;
        });
    }
    call(player, call, solo_deux, suit, val) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.player_ready.get(player)) {
                player.send({
                    event: 'error',
                    msg: 'You have already readied up.'
                });
                return;
            }
            const queens = player.hand.get('QC') && player.hand.get('QS');
            if (queens) {
                this.queens_player = player;
            }
            let bad_call = false;
            if (call === 'ready') {
            }
            else if (call === 'first-trick') {
                if (queens && !this.solo) {
                    this.first_trick = true;
                    this.strategy_call = `${player.name} has called First Trick!`;
                }
            }
            else if (suit === undefined) {
                bad_call = true;
            }
            else if (call === 'solo') {
                if (!this.solo || this.solo !== 'D' && suit === 'D') {
                    this.first_trick = false;
                    this.chosen_card = undefined;
                    this.solo = suit;
                    this.solo_player = player;
                    if (queens) {
                        this.solo_deux = !!solo_deux;
                    }
                    this.strategy_call = `${player.name} has called a ${Table.suit_to_string(suit)} Solo${this.solo_deux ? ' Deux' : ''}!`;
                }
            }
            else if (val === undefined) {
                bad_call = true;
            }
            else if (call === 'card') {
                if (queens && !this.solo) {
                    this.first_trick = false;
                    this.chosen_card = `${val}${suit}`;
                    this.strategy_call = `${player.name} has called that the ${Table.val_to_string(val)} of ${Table.suit_to_string(suit)}s gets along.`;
                }
            }
            else {
                bad_call = true;
            }
            if (bad_call) {
                player.send({
                    event: 'error',
                    msg: 'Incorrect ready call...'
                });
            }
            else {
                this.player_ready.set(player, true);
                this.table.send({
                    event: 'ready',
                    player_name: player.name
                });
                if (this.player_ready.size == 4) {
                    if (this.solo && this.solo_player) {
                        this.team1.push(this.solo_player);
                        this.team2 = this.table.players.filter(p => p != this.solo_player);
                    }
                    else if (this.chosen_card && this.queens_player) {
                        const card = this.chosen_card;
                        this.table.players.forEach(player => {
                            if (player.hand.get(card) || player == this.queens_player) {
                                this.team1.push(player);
                            }
                            else {
                                this.team2.push(player);
                            }
                        });
                    }
                    else if (this.first_trick && this.queens_player) {
                        this.team1.push(this.queens_player);
                    }
                    else if (this.queens_player) {
                        this.solo = 'D';
                        this.solo_player = this.queens_player;
                        this.team1.push(this.queens_player);
                        this.team2 = this.table.players.filter(p => p != this.queens_player);
                    }
                    else {
                        this.table.players.forEach(player => {
                            if (player.original_hand.get('QS') || player.original_hand.get('QC')) {
                                this.team1.push(player);
                            }
                            else {
                                this.team2.push(player);
                            }
                        });
                    }
                    const messages = new Array();
                    this.table.players.forEach(player => {
                        messages.push(player.send({
                            event: 'round-start',
                            player_turn: this.active_player().name,
                            strategy_call: this.strategy_call,
                            trump: this.trump(),
                            my_hand: Array.from(player.hand.keys()),
                        }));
                    });
                    const res = yield Promise.all(messages);
                    return res;
                }
            }
        });
    }
    is_trump(card) {
        const card_val = Table.val_to_num(card.charAt(0));
        const card_suit = card.charAt(1);
        return card_suit == this.trump() || card_val > 5;
    }
}
class Table {
    constructor(name, hash) {
        this.socket_map = new Map();
        this.players = new Array();
        this.dealer = 0;
        this.name = name;
        this.hash = hash;
    }
    ready() {
        return this.players.length == 4
            && !!this.players[0].socket
            && !!this.players[1].socket
            && !!this.players[2].socket
            && !!this.players[3].socket;
    }
    add(player) {
        if (this.players.length < 4) {
            this.players.push(player);
            if (player.socket) {
                this.socket_map.set(player.socket, player);
            }
            this.send({
                event: 'player-joined',
                table_name: this.name,
                player_name: player.name,
                players: this.players.map(p => { return { name: p.name, balance: p.balance }; })
            });
            return true;
        }
        else {
            return false;
        }
    }
    remove(player) {
        this.players = this.players.filter(p => p != player);
    }
    is_turn(player) {
        return this.ready() && this.round && this.round.player_ready.size == 4 && this.round.active_player() == player;
    }
    send(msg) {
        const messages = new Array();
        this.players.forEach(player => {
            messages.push(player.send(msg));
        });
        return Promise.all(messages);
    }
    send_table_data() {
        const messages = new Array();
        const dealer_name = this.players[this.dealer % 4].name;
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            const other_players = [];
            for (let j = 1; j < this.players.length; j++) {
                const p = this.players[(i + j) % this.players.length];
                other_players.push({
                    name: p.name,
                    balance: p.balance,
                    dealer: p.name === dealer_name
                });
            }
            const msg = {
                event: 'table-update',
                other_players: other_players,
                me: {
                    name: player.name,
                    balance: player.balance,
                    dealer: player.name === dealer_name
                },
                my_hand: Array.from(player.hand.keys())
            };
            messages.push(player.send(msg));
        }
        return Promise.all(messages);
    }
    play(card) {
        if (!this.round)
            throw new Error("Round is not active...");
        return this.round.play(card);
    }
    start_round() {
        this.round = new Round(this);
        return this.round.deal();
    }
    static val_to_char(val) {
        if (val < 3) {
            return '' + (val + 7);
        }
        switch (val) {
            case 3: return 'K';
            case 4: return 'T';
            case 5: return 'A';
            case 6: return 'J';
            case 7: return 'Q';
        }
        throw new Error("Unknown card value...");
    }
    static suit_to_char(suit) {
        switch (suit) {
            case 0: return 'D';
            case 1: return 'H';
            case 2: return 'S';
            case 3: return 'C';
        }
        throw new Error("Unknown card suit...");
    }
    static suit_to_string(suit) {
        switch (suit) {
            case 'D': return 'Diamond';
            case 'H': return 'Heart';
            case 'S': return 'Spade';
            case 'C': return 'Club';
        }
        throw new Error("Unknown card suit...");
    }
    static val_to_string(val) {
        switch (val) {
            case '7': return 'Seven';
            case '8': return 'Eight';
            case '9': return 'Nine';
            case 'K': return 'King';
            case 'T': return 'Ten';
            case 'A': return 'Ace';
            case 'J': return 'Jack';
            case 'Q': return 'Queen';
        }
        throw new Error("Unknown card value...");
    }
    static suit_to_num(suit) {
        switch (suit) {
            case 'D': return 0;
            case 'H': return 1;
            case 'S': return 2;
            case 'C': return 3;
        }
        throw new Error("Unknown card suit...");
    }
    static val_to_num(val) {
        switch (val) {
            case '7': return 0;
            case '8': return 1;
            case '9': return 2;
            case 'K': return 3;
            case 'T': return 4;
            case 'A': return 5;
            case 'J': return 6;
            case 'Q': return 7;
        }
        throw new Error("Unknown card value...");
    }
    static card_val(card) {
        switch (card.charAt(0)) {
            case '7': return 0;
            case '8': return 0;
            case '9': return 0;
            case 'K': return 4;
            case 'T': return 10;
            case 'A': return 11;
            case 'J': return 2;
            case 'Q': return 3;
        }
        throw new Error("Unknown card value...");
    }
}
class Player {
    constructor(name, table, socket) {
        this.balance = 5.00;
        this.hand = new Map();
        this.original_hand = new Map();
        this.collected = new Map();
        if (socket) {
            this.connect(socket);
        }
        this.name = name;
        this.table = table;
    }
    connect(socket) {
        this.socket = socket;
        this.table.socket_map.set(socket, this);
        this.table.send({
            event: 'player-connected',
            table_name: this.table.name,
            player_name: this.name,
        });
        this.table.send_table_data();
    }
    disconnect() {
        if (this.socket) {
            this.table.socket_map.delete(this.socket);
            this.socket = undefined;
            this.table.send({
                event: 'player-dc',
                player_name: this.name
            });
            this.table.send_table_data();
        }
    }
    deal(cards, player_turn) {
        if (cards.length != 8)
            throw new Error("Incorrect card hand size...");
        this.original_hand.clear();
        this.hand.clear();
        this.collected.clear();
        cards.forEach(card => {
            this.hand.set(card, true);
            this.original_hand.set(card, true);
        });
        return this.send({
            event: "deal",
            cards: cards,
            player_turn: player_turn
        });
    }
    play(card) {
        return __awaiter(this, void 0, void 0, function* () {
            let illegal_card = false;
            if (this.table.round && this.table.round.trick.length > 0) {
                const trick_card = this.table.round.trick[0].card;
                const trick_suit = this.table.round.is_trump(trick_card) ? 'T' : trick_card.charAt(1);
                const card_suit = this.table.round.is_trump(card) ? 'T' : card.charAt(1);
                if (card_suit != trick_suit) {
                    let has_suit = false;
                    Array.from(this.hand.keys()).forEach(card => {
                        var _a;
                        const hand_suit = ((_a = this.table.round) === null || _a === void 0 ? void 0 : _a.is_trump(card)) ? 'T' : card.charAt(1);
                        if (hand_suit == trick_suit)
                            has_suit = true;
                    });
                    if (has_suit) {
                        illegal_card = true;
                    }
                    else if (card === this.table.round.chosen_card && this.hand.size > 1) {
                        yield this.send({ event: 'error', msg: "You cannot play that card unless it matches suit since it was chosen to get along with the queens." });
                        return;
                    }
                }
            }
            if (!this.table.is_turn(this)) {
                yield this.send({ event: "error", msg: "It is not your turn to play a card." });
            }
            else if (!this.hand.get(card)) {
                yield this.send({ event: "error", msg: "You do not have that card in your hand." });
            }
            else if (illegal_card) {
                yield this.send({ event: "error", msg: "You cannot play that card since you have a different card that matches the trick suit!" });
            }
            else {
                this.hand.delete(card);
                yield this.table.play(card);
            }
        });
    }
    send(msg) {
        return new Promise((resolve, reject) => {
            if (this.socket) {
                if (this.socket.readyState == ws_1.default.OPEN) {
                    this.socket.send(JSON.stringify(msg), (err) => {
                        if (err)
                            reject(err);
                        resolve(true);
                    });
                }
                else {
                    this.disconnect();
                    resolve(false);
                }
            }
            else {
                resolve(false);
            }
        });
    }
}
