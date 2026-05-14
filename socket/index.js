const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Yeni bağlantı: ${socket.id}`);

    // Client joins a business queue room
    socket.on('joinQueue', (businessId) => {
      socket.join(`queue_${businessId}`);
      console.log(`📋 ${socket.id} -> queue_${businessId} odasına katıldı`);
    });

    // Client leaves a business queue room
    socket.on('leaveQueue', (businessId) => {
      socket.leave(`queue_${businessId}`);
      console.log(`🚪 ${socket.id} -> queue_${businessId} odasından ayrıldı`);
    });

    // Admin joins their dashboard room
    socket.on('joinAdmin', (businessId) => {
      socket.join(`admin_${businessId}`);
      console.log(`🏢 Admin ${socket.id} -> admin_${businessId} odasına katıldı`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Bağlantı koptu: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io henüz başlatılmadı!');
  }
  return io;
};

module.exports = { initSocket, getIO };
