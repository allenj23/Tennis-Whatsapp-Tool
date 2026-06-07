const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  console.log('Browser connected:', socket.id);

  socket.emit('server:ready');

  socket.on('disconnect', () => {
    console.log('Browser disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`WhatsApp Campaign Tool running at http://localhost:${PORT}`);
});
