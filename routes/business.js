const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Business = require('../models/Business');
const auth = require('../middleware/auth');

// @route   GET /api/business/profile
// @desc    Get business profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }
    res.json(business.toJSON());
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   PUT /api/business/profile
// @desc    Update business profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, serviceType, capacity } = req.body;
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }

    if (name) business.name = name;
    if (serviceType) business.serviceType = serviceType;
    if (capacity) business.capacity = capacity;

    await business.save();
    res.json(business.toJSON());
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   POST /api/business/qr
// @desc    Generate QR code for business
// @access  Private
router.post('/qr', auth, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const queueUrl = `${clientUrl}/queue/${business._id}`;

    // Generate QR code as data URL (base64 PNG)
    const qrDataUrl = await QRCode.toDataURL(queueUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    });

    business.qrCodeData = qrDataUrl;
    await business.save();

    res.json({
      qrCodeData: qrDataUrl,
      queueUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'QR kod oluşturulamadı', error: error.message });
  }
});

// @route   GET /api/business/:id/info
// @desc    Get public business info (for customer page)
// @access  Public
router.get('/:id/info', async (req, res) => {
  try {
    const business = await Business.findById(req.params.id).select('name serviceType capacity');
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }
    res.json(business);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

module.exports = router;
