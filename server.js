const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Estado das salas para o multiplayer
const rooms = {};

function gerarCodigoSala() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('Jogador conectado:', socket.id);
  let currentRoomCode = null;

  // Criar Sala
  socket.on('create_room', (data) => {
    const code = gerarCodigoSala();
    rooms[code] = {
      code,
      name: data.name || 'Sala',
      pass: data.pass || '',
      max: data.max || 4,
      hostId: socket.id,
      players: new Map()
    };
    
    currentRoomCode = code;
    socket.join(code);
    rooms[code].players.set(socket.id, { nick: data.nick, look: data.look, host: true });

    socket.emit('room_created', {
      code,
      players: Array.from(rooms[code].players.entries()).map(([id, p]) => ({ id, ...p }))
    });
  });

  // Entrar em Sala
  socket.on('join_room', (data) => {
    const room = rooms[data.code];
    if (!room) {
      return socket.emit('error_msg', 'Sala não encontrada');
    }
    if (room.pass && room.pass !== data.pass) {
      return socket.emit('error_msg', 'Senha incorreta');
    }
    if (room.players.size >= room.max) {
      return socket.emit('error_msg', 'Sala cheia');
    }

    currentRoomCode = data.code;
    socket.join(data.code);
    room.players.set(socket.id, { nick: data.nick, look: data.look, host: false });

    const playersList = Array.from(room.players.entries()).map(([id, p]) => ({ id, ...p }));
    
    // Avisa a todos na sala
    io.to(data.code).emit('update_players', playersList);
    socket.emit('room_joined', { code: data.code, players: playersList });
  });

  // Eventos de Jogo / Sincronização
  socket.on('game_action', (data) => {
    if (currentRoomCode) {
      socket.to(currentRoomCode).emit('game_action', { id: socket.id, ...data });
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log('Jogador desconectado:', socket.id);
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      room.players.delete(socket.id);
      
      if (room.players.size === 0) {
        delete rooms[currentRoomCode];
      } else {
        if (room.hostId === socket.id) {
          // Passa o host para o próximo
          const nextId = room.players.keys().next().value;
          room.hostId = nextId;
          const p = room.players.get(nextId);
          if (p) p.host = true;
        }
        const playersList = Array.from(room.players.entries()).map(([id, p]) => ({ id, ...p }));
        io.to(currentRoomCode).emit('update_players', playersList);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
