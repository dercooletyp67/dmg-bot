require('dotenv').config();
const { setupBot } = require('./bot/index.js');
const createServer = require('./api/server.js');
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

const client = setupBot(io);
const apiApp = createServer(client);

// Mount the API app
app.use(apiApp);

// Attach socket.io to the client so events can emit it
client.io = io;

client.login(process.env.DISCORD_TOKEN);

const { connectDB } = require('./database');
connectDB();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Admin Dashboard running on http://localhost:${PORT}`);
});
