import express from 'express';
import ws from 'ws';
import mongo, { MongoError } from 'mongodb';
import crypto from 'crypto';
import e from 'express';

const app = express();
const port = process.env.PORT || 3000;
const mongo_url = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@sheepshead.oa0bn.mongodb.net/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;

// Connect to database
let db: mongo.Db;
mongo.MongoClient.connect(mongo_url, async (err, client) => {
    if (err) throw err;
    console.log("Connected to mongodb server...");
    db = client.db("sheepshead");

    await db.dropCollection("tables");

    // Create indexes
    try {
        const tables = db.collection("tables");
        await tables.createIndex({ name: 1 }, { unique: true });
        await tables.createIndex({ "players.name": 1 });
    } catch (err) {
        console.error(err);
    }

});


// Setup Web Sockets
const player_map = new Map<ws, Player>();
const wss = new ws.Server({ noServer: true });
wss.on('connection', socket => {
    console.log(`Client connected!`);
    socket.on('message', msg => { handle_msg(socket, msg, player_map.get(socket)); });
    socket.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code}, ${reason}`);

        // Disconnect from table if in session
        const player = player_map.get(socket);
        if (player) {
            player.disconnect();
            player_map.delete(socket);
        }

    });
});


// Listen on Express Server
const server = app.listen(port);
server.on('listening', () => {
    console.log(`Server listening on port ${port}...`);
});
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, socket => {
        wss.emit('connection', socket, req);
    });
});


// Setup Tables Cache
const table_cache = new Map<string, Table>();


// Functions
function hash(pass: string) {
    const hash = crypto.createHash("sha256");
    hash.update(pass);
    return hash.digest("hex");
}

function valid_pass(pass: string, hashed: string) {
    return hash(pass) === hashed;
}

async function handle_msg(socket: ws, msg: ws.Data, player?: Player) {
    if (typeof msg !== 'string') return;
    const data = JSON.parse(msg);
    console.log(data);
    switch (data.event) {
        case 'create-table': {
            try {
                const hashed = hash(data.table_password);
                const res = await db.collection("tables").insertOne({
                    name: data.table_name,
                    hash: hashed,
                    players: []
                });
                if (res.result.ok) {
                    // Create the table
                    table_cache.set(data.table_name, new Table(data.table_name, hashed));
                    socket.send(JSON.stringify({
                        event: 'table-created'
                    }));
                } else {
                    throw new Error("Table could not be created...");
                }
            } catch (err) {
                let err_msg = 'There was an unknown error. Please try again...';
                if (err instanceof mongo.MongoError) {
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
        // No break
        case 'join-table': {
            try {

                // Ensure the table exists
                let table_exists = !!table_cache.get(data.table_name);
                if (!table_exists) {
                    const res = db.collection("tables").find({ name: data.table_name });
                    if (await res.hasNext()) {
                        table_exists = true;
                        const table_data = await res.next();
                        const table = new Table(table_data.name, table_data.hash);
                        table_cache.set(data.table_name, table);
                        table_data.players.forEach((player_data: { name: string, balance: number }) => {
                            // Add existing players to table
                            const player = new Player(player_data.name, table);
                            player.balance = player_data.balance;
                            table.add(player);
                        });
                    }
                }
                if (!table_exists) {
                    // Send error
                    socket.send(JSON.stringify({
                        event: "error",
                        msg: "The table requested to join does not exists."
                    }));
                } else {

                    // Get the table from cache
                    const table = table_cache.get(data.table_name);
                    if (!table) throw new Error("There was an unknown error fetching the table from the cache.");

                    // Check the password
                    if (valid_pass(data.table_password, table.hash)) {

                        if (!!table.socket_map.get(socket)) {

                            // Player is already connected during this session
                            socket.send(JSON.stringify({
                                event: "error",
                                msg: "You are already connected to the table."
                            }));

                        } else {

                            let player = undefined;

                            // Check if the player is already in the table
                            let joined = false;
                            table.players.forEach(p => {
                                if (p.name === data.player_name) {
                                    // Player is a part of the table already
                                    if (p.socket) {
                                        // Player is already connected with that name
                                        socket.send(JSON.stringify({
                                            event: 'error',
                                            msg: 'There is already a player connected with that name... Please try a different name.'
                                        }));
                                        joined = true;
                                    } else {
                                        player = p;
                                        joined = true;
                                    }
                                }
                            })

                            if (!joined) {
                                // Join the table if it has room
                                player = new Player(data.player_name, table);
                                joined = table.add(player);
                            }

                            if (joined && player) {
                                // Connect
                                player.connect(socket);
                                // Save to player map
                                player_map.set(socket, player)
                                // Check for game beginning
                                if (table.ready() && !table.round) {
                                    await table.start_round();
                                }
                            } else if (!joined) {
                                // Table full
                                socket.send(JSON.stringify({
                                    event: 'error',
                                    msg: 'The requested table is full. Could not join the table.'
                                }));
                            }

                        }
                    } else {
                        // Bad Authentication
                        socket.send(JSON.stringify({
                            event: 'error',
                            msg: 'Incorrect table name or password. Please try again.'
                        }));
                    }
                }
            } catch (err) {
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
                } else {
                    socket.send(JSON.stringify({
                        event: 'error',
                        msg: 'Could not send message. You are not part of a table.'
                    }));
                }
            } catch (err) {
                console.error(err);
            }
            break;
        }
        case 'play-card': {
            try {
                if (player) {
                    player.play(data.card);
                }
            } catch (err) {
                console.error(err);
            }
            break;
        }
        case 'ready': {
            try {
                if (player) {
                    player.table.round?.call(player, data.call, data.suit, data.val);
                }
            } catch (err) {
                console.error(err);
            }
            break;
        }
    }
}

// Round
class Round {

    trick = new Array<{ player: Player, card: string }>();
    last_trick?: string[]
    team1 = new Array<Player>();
    team2 = new Array<Player>();
    solo?: string // suit
    solo_player?: Player
    queens_player?: Player
    first_trick = false;
    chosen_card?: string;
    turn = 0;
    active: number
    table: Table
    player_ready = new Map<Player, boolean>();
    strategy_call?: string

    constructor(table: Table) {
        this.table = table;
        this.active = table.dealer + 1;
    }

    active_player() {
        return this.table.players[(this.turn + this.active) % 4];
    }

    trump() {
        return this.solo || 'D'
    }

    deal() {

        if (this.table.players.length != 4) throw new Error(`Cannot deal to table with ${this.table.players.length} players!`);

        // Create the deck
        const cards = new Array<string>();
        for (let val = 0; val < 8; val++) {
            for (let suit = 0; suit < 4; suit++) {
                cards.push(Table.val_to_char(val) + Table.suit_to_char(suit));
            }
        }

        // Shuffle the deck
        for (let shuffle = 0; shuffle < 4; shuffle++) {
            for (let i = 0; i < cards.length; i++) {
                const rand = Math.floor(Math.random() * cards.length);
                const temp = cards[rand];
                cards[rand] = cards[i];
                cards[i] = temp;
            }
        }

        // Deal the cards
        const deals = new Array<Promise<boolean>>();
        for (let i = 0; i < 4; i++) {
            const hand = cards.slice(i * 8, (i + 1) * 8);
            deals.push(this.table.players[i].deal(hand, this.table.players[this.turn].name));
        }
        return Promise.all(deals);

    }

    play(card: string) {

        const active_player = this.active_player();
        this.turn++;

        this.trick.push({ player: active_player, card: card });

        let winner: Player
        if (this.turn % 4 == 0) {
            const suit = Table.suit_to_num(this.trick[0].card.charAt(1));
            const trump = Table.suit_to_num(this.trump());
            winner = this.trick.reduce((p, c) => {
                const p_suit = Table.suit_to_num(p.card.charAt(1));
                const p_val = Table.val_to_num(p.card.charAt(0));
                const c_suit = Table.suit_to_num(c.card.charAt(1));
                const c_val = Table.val_to_num(c.card.charAt(0));
                if (c_suit != suit) {
                    if (c_suit != trump) {
                        return p; // not suited
                    } else if (p_suit != trump) {
                        return c; // trumped
                    } else if (p_val > c_val) {
                        return p; // greater trump
                    } else {
                        return c;
                    }
                } else if (suit == trump) {
                    if (p_suit == trump) {
                        // Both trump
                        if (p_val > c_val) {
                            return p;
                        } else {
                            return c;
                        }
                    } else {
                        // previous not trump
                        return c;
                    }
                } else {
                    if (p_suit == trump) {
                        // trumped
                        return p;
                    } else {
                        // Both are suited
                        if (p_val > c_val) {
                            return p;
                        } else {
                            return c;
                        }
                    }
                }
            }).player;

            this.trick.forEach(trick => {
                // Collect
                winner.collected.set(trick.card, true);
            });

            // Check for first trick
            if (this.first_trick && suit != trump) {
                if (winner == this.queens_player) {
                    this.team2 = this.table.players.filter(p => p != winner);
                } else {
                    this.team1.push(winner);
                    this.team2 = this.table.players.filter(p => p != winner && p != this.queens_player);
                }
            }

            // Set active player
            this.active = this.table.players.indexOf(winner);

        }

        if (this.turn == 32) {
            // Round over
        }

        const next_player = this.active_player();

        const messages = new Array<Promise<boolean>>();
        this.table.players.forEach(player => {
            messages.push(player.send({
                event: "card-played",
                player_name: active_player.name,
                player_turn: next_player.name,
                card: card,
                trick: this.trick.map(play => { return { player: play.player.name, card: play.card }; }),
                my_hand: Array.from(player.hand.keys()),
                winner: winner?.name,
            }));
        });

        return Promise.all(messages);
    }

    call(
        player: Player,
        call: 'ready' | 'solo' | 'first-trick' | 'card',
        suit?: 'D' | 'H' | 'S' | 'C',
        val?: '7' | '8' | '9' | 'T' | 'K' | 'A' | 'J' | 'Q'
    ) {

        if (this.player_ready.get(player)) {
            player.send({
                event: 'error',
                msg: 'You have already readied up.'
            });
            return;
        }

        // Check if player has both queens
        const queens = player.hand.get('QC') && player.hand.get('QS');
        if (queens) {
            this.queens_player = player;
        }

        // Keep track of bad calls
        let bad_call = false;
        if (call === 'ready') {
            // nothing
        } else if (call === 'first-trick') {
            if (queens && !this.solo) {
                this.first_trick = true;
                this.strategy_call = `${player.name} has called First Trick!`;
            }
        } else if (!suit) {
            bad_call = true;
        } else if (call === 'solo') {
            if (!this.solo || this.solo !== 'D' && suit === 'D') {
                this.solo = suit;
                this.solo_player = player;
                this.strategy_call = `${player.name} has called a ${Table.suit_to_string(suit)} Solo!`;
            }
        } else if (!val) {
            bad_call = true;
        } else if (call === 'card') {
            if (queens && !this.solo) {
                this.chosen_card = val + suit;
                this.strategy_call = `${player.name} has called that the ${Table.val_to_string(val)} of ${Table.suit_to_string(suit)}s gets along.`;
            }
        } else {
            bad_call = true;
        }

        if (bad_call) {
            player.send({
                event: 'error',
                msg: 'Incorrect ready call...'
            });
        } else {
            this.player_ready.set(player, true);
            this.table.send({
                event: 'ready',
                player_name: player.name
            });
            if (this.player_ready.size == 4) {
                // Setup teams
                if (this.solo && this.solo_player) {
                    this.team1.push(this.solo_player);
                    this.team2 = this.table.players.filter(p => p != this.solo_player);
                } else if (this.chosen_card && this.queens_player) {
                    const card = this.chosen_card;
                    this.team1.push(this.queens_player);
                    this.table.players.forEach(player => {
                        if (player.hand.get(card)) {
                            this.team1.push(player);
                        } else {
                            this.team2.push(player);
                        }
                    });
                } else if (this.first_trick && this.queens_player) {
                    this.team1.push(this.queens_player);
                    // Other team is decided when trick is won
                }

                // Start round
                this.table.send({
                    event: 'round-start',
                    player_turn: this.active_player().name,
                    strategy_call: this.strategy_call
                });
            }
        }
    }

}

// Table
class Table {

    name: string
    hash: string
    socket_map = new Map<ws, Player>();
    players = new Array<Player>();
    dealer = 0;
    round?: Round;

    constructor(name: string, hash: string) {
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

    add(player: Player) {
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
        } else {
            return false;
        }
    }

    remove(player: Player) {
        this.players = this.players.filter(p => p != player);
    }

    is_turn(player: Player) {
        return this.ready() && this.round && this.round.player_ready.size == 4 && this.round.active_player() == player;
    }

    send<T extends { event: string }>(msg: T) {
        // Send a message to all players at the table (only return true if all sent)
        const messages = new Array<Promise<boolean>>();
        this.players.forEach(player => {
            messages.push(player.send(msg));
        });
        return Promise.all(messages);
    }

    send_table_data() {
        // Send all player and personal hand data to each player
        const messages = new Array<Promise<boolean>>();
        this.players.forEach(player => {
            const msg = {
                event: 'table_update',
                other_players: this.players.map(p => { return { name: p.name, balance: p.balance }; }).filter(p => { return p.name != player.name; }),
                my_hand: Array.from(player.hand.keys()),
                my_name: player.name,
                my_balance: player.balance
            }
            messages.push(player.send(msg));
        });
        return Promise.all(messages);
    }

    play(card: string) {
        if (!this.round) throw new Error("Round is not active...");
        return this.round.play(card);
    }

    start_round() {
        this.round = new Round(this);
        return this.round.deal();
    }

    static val_to_char(val: number) {
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

    static suit_to_char(suit: number) {
        switch (suit) {
            case 0: return 'D';
            case 1: return 'H';
            case 2: return 'S';
            case 3: return 'C';
        }
        throw new Error("Unknown card suit...");
    }

    static suit_to_string(suit: string) {
        switch (suit) {
            case 'D': return 'Diamond';
            case 'H': return 'Heart';
            case 'S': return 'Spade';
            case 'C': return 'Club';
        }
        throw new Error("Unknown card suit...");
    }

    static val_to_string(val: string) {
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

    static suit_to_num(suit: string) {
        switch (suit) {
            case 'D': return 0;
            case 'H': return 1;
            case 'S': return 2;
            case 'C': return 3;
        }
        throw new Error("Unknown card suit...");
    }

    static val_to_num(val: string) {
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

}

// Player
class Player {

    name: string
    socket?: ws
    balance = 5.00;
    hand = new Map<string, boolean>();
    collected = new Map<string, boolean>();
    table: Table

    constructor(name: string, table: Table, socket?: ws) {
        if (socket) {
            this.connect(socket);
        }
        this.name = name;
        this.table = table;
    }

    connect(socket: ws) {
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

    deal(cards: string[], player_turn: string) {
        if (cards.length != 8) throw new Error("Incorrect card hand size...");
        this.hand.clear();
        this.collected.clear();
        cards.forEach(card => {
            this.hand.set(card, true);
        });
        return this.send({
            event: "deal",
            cards: cards,
            player_turn: player_turn
        });
    }

    async play(card: string) {
        if (!this.table.is_turn(this)) {
            // Wrong turn
            await this.send({ event: "error", msg: "It is not your turn to play a card." });
        } else if (!this.hand.get(card)) {
            // Hand mismatch
            await this.send({ event: "error", msg: "You do not have that card in your hand." });
        } else {
            // Play card
            this.hand.delete(card);
            await this.table.play(card);
        }
    }

    send<T extends { event: string }>(msg: T): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this.socket) {
                if (this.socket.readyState == ws.OPEN) {
                    this.socket.send(JSON.stringify(msg), (err) => {
                        if (err) reject(err);
                        resolve(true);
                    });
                } else {
                    this.disconnect();
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        });
    }

}