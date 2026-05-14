const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Business = require('../models/Business');
const auth = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new business
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, serviceType, capacity } = req.body;

    // Validation
    if (!name || !email || !password || !serviceType) {
      return res.status(400).json({ message: 'Tüm alanlar zorunludur' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Şifre en az 6 karakter olmalıdır' });
    }

    // Check if email already exists
    const existing = await Business.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Bu e-posta adresi zaten kayıtlı' });
    }

    const business = new Business({
      name,
      email,
      password,
      serviceType,
      capacity: capacity || 1
    });

    await business.save();

    const token = jwt.sign({ id: business._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.status(201).json({
      token,
      business: business.toJSON()
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login business
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-posta ve şifre zorunludur' });
    }

    const business = await Business.findOne({ email });
    if (!business) {
      return res.status(400).json({ message: 'Geçersiz e-posta veya şifre' });
    }

    const isMatch = await business.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Geçersiz e-posta veya şifre' });
    }

    const token = jwt.sign({ id: business._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      token,
      business: business.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in business
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }
    res.json(business.toJSON());
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

module.exports = router;
