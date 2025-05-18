"use strict"
const http = require("http");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const {calculate, Generations, Pokemon, Move} = require('@smogon/calc');

const gen = Generations.get(9);
require("dotenv").config({
   path: path.resolve(__dirname, "credentials/.env"),
});


const databaseName = "CMSC335DB";
const collectionName = "pokemon";
const uri = process.env.MONGO_CONNECTION_STRING;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

app.use(bodyParser.urlencoded({extended:false}));
app.use(express.static(path.join(__dirname)));
const portNumber = 3000

async function insertPokemon(pokemon, text) {
    try {
        await client.connect();
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const entry = {pokemon: pokemon, text:text};
        let result = await collection.insertOne(entry);
        return result;
     } catch (e) {
        console.error(e);
     } finally {
        await client.close();
     }
}

async function getCurrentTarget() {
    try {
        await client.connect();
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const target = await collection.find().sort({ _id: -1 }).limit(1).toArray();
        return target[0]['pokemon'];
     } catch (e) {
        console.error(e);
     } finally {
        await client.close();
     }
}

async function getHistory() {
    try {
        await client.connect();
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const cursor = collection.find();
        let result = (await cursor.toArray()).reverse();

        let table = "";
        result.forEach(entry => table += `${entry.text}<br>`);
        return table;

     } catch (e) {
        console.error(e);
     } finally {
        await client.close();
     }
}

async function clear() {
    try {
        await client.connect();
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const cursor = collection.find();
        await collection.drop();
        await insertPokemon("Pikachu", "Pikachu was originally here")
     } catch (e) {
        console.error(e);
     } finally {
        await client.close();
     }
}

function learnsMove(pokeData, move) {
    return pokeData['moves'].find(item => item['move']['name'] === move.toLowerCase()) != undefined;
}

function capitalize(str) {
    return str.split(" ").map((word) => { 
        return word[0].toUpperCase() + word.substring(1); 
    }).join(" ");
}

function damage(p1, p2, move) {
    const result = calculate(
        gen,
        new Pokemon(gen, p1),
        new Pokemon(gen, p2),
        new Move(gen, move)
      );
    return result;

}

/* Defining the view/templating engine to use */
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "pages"));


app.get("/", (req, res) => {
    
    getCurrentTarget().then(async (data) => 
    {
        const history = await getHistory();
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${data}`);
        const sprite = await response.json();

        if (response.ok) {
            let spritelink = sprite['sprites']['front_default']
            res.render("index", {target: data, history: history, sprite: spritelink})
        }
        
    })
        

});

app.get("/suggest", (request, response) => {
    getCurrentTarget().then(
        data => 
        response.render("suggest", {target: data})
        )
  });

app.post("/suggest", (req, res) => {
    let {pokemon, move} = req.body;
    pokemon = capitalize(pokemon);
    let move2 = move.replace(" ", "-");
    
    fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon.toLowerCase()}`)
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            res.send(`<script>alert("${pokemon} is not the name of a Pokemon. Double-check your spelling and try again."); window.location.href = "/suggest"; </script></script>`)
            return null;
        }
    })
    .then(async data => {
        if (data == null) {
            return null;
        } else if (learnsMove(data, move2)) {
            const target = await getCurrentTarget();
            let damageResult = damage(pokemon, target, move);
            if (damageResult.damage != 0  && damageResult.kochance().chance == 1 && damageResult.kochance().n == 1) {
                let variables = {p1: pokemon, p2: target, move: move, text: damageResult.fullDesc()}
                // res.send(`<script>alert("Inserting with ${pokemon} ${target} ${move}"); window.location.href = "/suggest"; </script>`)
                insertPokemon(pokemon, `${pokemon} KO'd ${target} with ${move}`)
                res.render("result", variables);
            } else {
                res.send(`<script>alert("${pokemon}'s ${capitalize(move)} does not always one-hit KO ${target}. Try another pair of Pokemon and move. \\n${damageResult.fullDesc()}"); window.location.href = "/suggest"; </script>`)
            }
        } else {
            res.send(`<script>alert("Error: ${capitalize(data['name'])} doesn't learn ${capitalize(move)}."); window.location.href = "/suggest"; </script></script>`)
        }
    })
    .catch(error => console.error(error));
  });

app.listen(portNumber);
console.log(`Web server started and running at http://localhost:${portNumber}`);
process.stdout.write("Stop to shutdown the server, or reset to reset the database: ");

process.stdin.setEncoding("utf8"); /* encoding */
process.stdin.on('readable', () => {  /* on equivalent to addEventListener */
    
    const dataInput = process.stdin.read();
    if (dataInput !== null) {
        const command = dataInput.trim();
        if (command === "stop") {
            console.log("Shutting down the server"); 
            process.exit(0);  /* exiting */
        } else if (command === "reset") {
            console.log("Resetting database\n"); 
            clear();
        } else {
            console.log(`Invalid command: ${command}`);
        }
        process.stdout.write("Stop to shutdown the server: ");
        process.stdin.resume(); // Allows the code to process next request
    }
});
