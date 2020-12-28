import express from 'express';
import ws from 'ws';
import mongo, { MongoError } from 'mongodb';
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 3000;
const mongo_url = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@sheepshead.oa0bn.mongodb.net/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;

// Connect to database
let db: mongo.Db;
mongo.MongoClient.connect(mongo_url, async (err, client) => {
    if (err) throw err;
    console.log("Connected to mongodb server...");
    db = client.db("sheepshead");

    // Create indexes
    try {
        const tables = db.collection("tables");
        await tables.createIndex({ name: 1 }, { unique: true });
        await tables.createIndex({ "players.name": 1 }, { unique: true });
    } catch (err) {
        console.error(err);
    }

});


// Setup Web Sockets
const wss = new ws.Server({ noServer: true });
wss.on('connection', socket => {
    console.log(`Client connected!`);
    socket.on('message', msg => { handle_msg(socket, msg); });
    socket.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code}, ${reason}`);
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

async function handle_msg(socket: ws, msg: ws.Data) {
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
                        table_data.players.forEach((player: { name: string, balance: number }) => {
                            // Add existing players to table
                            table.add(new Player(player.name, table));
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

                        // Check if the player is already in the table
                        let joined = false;
                        table.players.forEach(player => {
                            if (player.name === data.player_name) {
                                // Player is a part of the table already
                                player.socket = socket;
                                joined = true;
                            }
                        })

                        if (!joined) {
                            // Join the table if it has room
                            joined = table.add(new Player(data.player_name, table, socket));
                        }

                        if (joined) {
                            // Success
                            socket.send(JSON.stringify({
                                event: 'table-joined',
                                table_name: table.name,
                                players: table.players.map(p => { return { name: p.name, balance: p.balance }; })
                            }));
                        } else {
                            // Table full
                            socket.send(JSON.stringify({
                                event: 'error',
                                msg: 'The requested table is full. Could not join the table.'
                            }));
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
    }
}

// Table
class Table {

    name: string
    hash: string
    players = new Array<Player>();
    trick = new Array<string>();
    last_trick?: string[]
    turn?: Player

    constructor(name: string, hash: string) {
        this.name = name;
        this.hash = hash;
    }

    add(player: Player) {
        if (this.players.length < 4) {
            this.players.push(player);
            return true;
        } else {
            return false;
        }
    }

    remove(player: Player) {
        this.players = this.players.filter(p => p != player);
    }

    is_turn(player: Player) {
        return this.turn == player;
    }

    play(card: string) {
        this.trick.push(card);
        this.players.forEach(player => {
            player.socket?.send(JSON.stringify({
                event: "card-played",
                player: this.turn?.name,
                card: card,
                my_hand: player.hand
            }));
        });
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
        this.socket = socket;
        this.name = name;
        this.table = table
    }

    deal(cards: string[]) {
        if (cards.length != 8) throw new Error("Incorrect card hand size...");
        this.hand.clear();
        this.collected.clear();
        cards.forEach(card => {
            this.hand.set(card, true);
        });
    }

    play(card: string) {
        if (!this.table.is_turn(this)) {
            // Wrong turn
            this.socket?.send(JSON.stringify({ event: "error", msg: "It is not your turn to play a card." }));
        } else if (!this.hand.get(card)) {
            // Hand mismatch
            this.socket?.send(JSON.stringify({ event: "error", msg: "You do not have that card in your hand." }));
        } else {
            // Play card
            this.table.play(card);
            this.hand.delete(card);
        }
    }

}