const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path'); // React dosyalarını bulmak için eklendi
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);

// Make io accessible to routes (if needed)
app.set('io', io);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/business', require('./routes/business'));
app.use('/api/queue', require('./routes/queue'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Sadece API isteklerinde bulunamayan yollar için 404 ver
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API Endpoint bulunamadı' });
});

// ==========================================
// FRONTEND (REACT) BAĞLANTI KISMI
// ==========================================
// dist klasörünü dışarıya açıyoruz
app.use(express.static(path.join(__dirname, 'dist')));

// API harici gelen tüm istekleri (site ziyaretçilerini) React'a yönlendiriyoruz
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// ==========================================

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Sunucu hatası', error: err.message });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Sırala Backend - Port ${PORT} üzerinde çalışıyor`);
  console.log(`📡 Socket.io hazır`);
  console.log(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
});