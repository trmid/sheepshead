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
const app = express_1.default();
const port = process.env.PORT || 3000;
const mongo_url = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@sheepshead.oa0bn.mongodb.net/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;
let db;
mongodb_1.default.MongoClient.connect(mongo_url, (err, client) => __awaiter(void 0, void 0, void 0, function* () {
    if (err)
        throw err;
    console.log("Connected to mongodb server...");
    db = client.db("sheepshead");
    try {
        const tables = db.collection("tables");
        yield tables.createIndex({ name: 1 }, { unique: true });
        yield tables.createIndex({ "players.name": 1 }, { unique: true });
    }
    catch (err) {
        console.error(err);
    }
}));
const wss = new ws_1.default.Server({ noServer: true });
wss.on('connection', socket => {
    console.log(`Client connected!`);
    socket.on('message', msg => { handle_msg(socket, msg); });
    socket.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code}, ${reason}`);
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
function handle_msg(socket, msg) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof msg !== 'string')
            return;
        const data = JSON.parse(msg);
        console.log(data);
        switch (data.event) {
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
                            table_data.players.forEach((player) => {
                                table.add(new Player(player.name, table));
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
                            let joined = false;
                            table.players.forEach(player => {
                                if (player.name === data.player_name) {
                                    player.socket = socket;
                                    joined = true;
                                }
                            });
                            if (!joined) {
                                joined = table.add(new Player(data.player_name, table, socket));
                            }
                            if (joined) {
                                socket.send(JSON.stringify({
                                    event: 'table-joined',
                                    table_name: table.name,
                                    players: table.players.map(p => { return { name: p.name, balance: p.balance }; })
                                }));
                            }
                            else {
                                socket.send(JSON.stringify({
                                    event: 'error',
                                    msg: 'The requested table is full. Could not join the table.'
                                }));
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
        }
    });
}
class Table {
    constructor(name, hash) {
        this.players = new Array();
        this.trick = new Array();
        this.name = name;
        this.hash = hash;
    }
    add(player) {
        if (this.players.length < 4) {
            this.players.push(player);
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
        return this.turn == player;
    }
    play(card) {
        this.trick.push(card);
        this.players.forEach(player => {
            var _a, _b;
            (_a = player.socket) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify({
                event: "card-played",
                player: (_b = this.turn) === null || _b === void 0 ? void 0 : _b.name,
                card: card,
                my_hand: player.hand
            }));
        });
    }
}
class Player {
    constructor(name, table, socket) {
        this.balance = 5.00;
        this.hand = new Map();
        this.collected = new Map();
        this.socket = socket;
        this.name = name;
        this.table = table;
    }
    deal(cards) {
        if (cards.length != 8)
            throw new Error("Incorrect card hand size...");
        this.hand.clear();
        this.collected.clear();
        cards.forEach(card => {
            this.hand.set(card, true);
        });
    }
    play(card) {
        var _a, _b;
        if (!this.table.is_turn(this)) {
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify({ event: "error", msg: "It is not your turn to play a card." }));
        }
        else if (!this.hand.get(card)) {
            (_b = this.socket) === null || _b === void 0 ? void 0 : _b.send(JSON.stringify({ event: "error", msg: "You do not have that card in your hand." }));
        }
        else {
            this.table.play(card);
            this.hand.delete(card);
        }
    }
}
