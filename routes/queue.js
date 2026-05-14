const express = require('express');
const router = express.Router();
const Queue = require('../models/Queue');
const Business = require('../models/Business');
const auth = require('../middleware/auth');
const { getIO } = require('../socket');

// Helper: Get today's date string
const getTodayDate = () => {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Helper: Get or create today's queue for a business
const getOrCreateQueue = async (businessId) => {
  const today = getTodayDate();
  let queue = await Queue.findOne({ businessId, date: today });

  if (!queue) {
    queue = new Queue({
      businessId,
      date: today,
      customers: [],
      lastTicketNumber: 0
    });
    await queue.save();
  }

  return queue;
};

// Helper: Emit queue update to all clients
const emitQueueUpdate = async (businessId) => {
  const io = getIO();
  const queue = await getOrCreateQueue(businessId);
  const business = await Business.findById(businessId).select('capacity');

  const waitingCustomers = queue.customers.filter(c => c.status === 'waiting');
  const calledCustomers = queue.customers.filter(c => c.status === 'called');
  const doneCustomers = queue.customers.filter(c => c.status === 'done');
  const avgWaitTime = queue.getAverageWaitTime();

  const payload = {
    customers: queue.customers,
    waitingCount: waitingCustomers.length,
    calledCount: calledCustomers.length,
    doneCount: doneCustomers.length,
    avgWaitTime,
    lastTicketNumber: queue.lastTicketNumber,
    capacity: business ? business.capacity : 1
  };

  // Emit to both queue viewers and admin
  io.to(`queue_${businessId}`).emit('queueUpdated', payload);
  io.to(`admin_${businessId}`).emit('queueUpdated', payload);
};

// ========================
// PUBLIC ROUTES
// ========================

// @route   GET /api/queue/:businessId
// @desc    Get current queue for a business (public)
// @access  Public
router.get('/:businessId', async (req, res) => {
  try {
    const queue = await getOrCreateQueue(req.params.businessId);
    const business = await Business.findById(req.params.businessId).select('capacity');

    const waitingCustomers = queue.customers.filter(c => c.status === 'waiting');
    const calledCustomers = queue.customers.filter(c => c.status === 'called');
    const doneCustomers = queue.customers.filter(c => c.status === 'done');

    res.json({
      customers: queue.customers,
      waitingCount: waitingCustomers.length,
      calledCount: calledCustomers.length,
      doneCount: doneCustomers.length,
      avgWaitTime: queue.getAverageWaitTime(),
      lastTicketNumber: queue.lastTicketNumber,
      capacity: business ? business.capacity : 1
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   POST /api/queue/:businessId/join
// @desc    Join queue (customer)
// @access  Public
router.post('/:businessId/join', async (req, res) => {
  try {
    const { name } = req.body;
    const { businessId } = req.params;

    // Verify business exists
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: 'İşletme bulunamadı' });
    }

    const queue = await getOrCreateQueue(businessId);

    // Increment ticket number
    queue.lastTicketNumber += 1;
    const ticketNumber = queue.lastTicketNumber;

    // Add customer to queue
    const customer = {
      name: name || 'Misafir',
      ticketNumber,
      status: 'waiting'
    };

    queue.customers.push(customer);
    await queue.save();

    // Get the saved customer (with _id)
    const savedCustomer = queue.customers[queue.customers.length - 1];

    // Calculate position
    const waitingBefore = queue.customers.filter(
      c => c.status === 'waiting' && c.ticketNumber < ticketNumber
    ).length;

    // Emit real-time update
    await emitQueueUpdate(businessId);

    res.status(201).json({
      customer: savedCustomer,
      position: waitingBefore + 1,
      waitingCount: queue.customers.filter(c => c.status === 'waiting').length,
      avgWaitTime: queue.getAverageWaitTime()
    });
  } catch (error) {
    res.status(500).json({ message: 'Sıraya katılınamadı', error: error.message });
  }
});

// @route   GET /api/queue/:businessId/position/:customerId
// @desc    Get customer's current position in queue
// @access  Public
router.get('/:businessId/position/:customerId', async (req, res) => {
  try {
    const { businessId, customerId } = req.params;
    const queue = await getOrCreateQueue(businessId);

    const customer = queue.customers.id(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Müşteri bulunamadı' });
    }

    if (customer.status === 'waiting') {
      const waitingBefore = queue.customers.filter(
        c => c.status === 'waiting' && c.ticketNumber < customer.ticketNumber
      ).length;

      return res.json({
        customer,
        position: waitingBefore + 1,
        waitingCount: queue.customers.filter(c => c.status === 'waiting').length,
        avgWaitTime: queue.getAverageWaitTime()
      });
    }

    res.json({
      customer,
      position: 0,
      waitingCount: queue.customers.filter(c => c.status === 'waiting').length,
      avgWaitTime: queue.getAverageWaitTime()
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// ========================
// ADMIN ROUTES (Protected)
// ========================

// @route   PUT /api/queue/call-next
// @desc    Call the next waiting customer
// @access  Private
router.put('/call-next', auth, async (req, res) => {
  try {
    const queue = await getOrCreateQueue(req.businessId);

    // Find the next waiting customer (lowest ticket number)
    const waitingCustomers = queue.customers
      .filter(c => c.status === 'waiting')
      .sort((a, b) => a.ticketNumber - b.ticketNumber);

    if (waitingCustomers.length === 0) {
      return res.status(400).json({ message: 'Sırada bekleyen müşteri yok' });
    }

    const nextCustomer = waitingCustomers[0];
    const customerDoc = queue.customers.id(nextCustomer._id);
    customerDoc.status = 'called';
    customerDoc.calledAt = new Date();

    await queue.save();

    // Emit real-time update
    await emitQueueUpdate(req.businessId);

    // Emit specific notification to the called customer
    const io = getIO();
    io.to(`queue_${req.businessId}`).emit('customerCalled', {
      customerId: customerDoc._id.toString(),
      ticketNumber: customerDoc.ticketNumber,
      name: customerDoc.name
    });

    res.json({ message: 'Müşteri çağrıldı', customer: customerDoc });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   PUT /api/queue/complete/:customerId
// @desc    Mark customer as completed
// @access  Private
router.put('/complete/:customerId', auth, async (req, res) => {
  try {
    const queue = await getOrCreateQueue(req.businessId);

    const customer = queue.customers.id(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Müşteri bulunamadı' });
    }

    customer.status = 'done';
    customer.completedAt = new Date();

    await queue.save();

    // Emit real-time update
    await emitQueueUpdate(req.businessId);

    const io = getIO();
    io.to(`queue_${req.businessId}`).emit('customerCompleted', {
      customerId: customer._id.toString()
    });

    res.json({ message: 'Müşteri hizmeti tamamlandı', customer });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   DELETE /api/queue/remove/:customerId
// @desc    Remove customer from queue
// @access  Private
router.delete('/remove/:customerId', auth, async (req, res) => {
  try {
    const queue = await getOrCreateQueue(req.businessId);

    const customer = queue.customers.id(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Müşteri bulunamadı' });
    }

    customer.deleteOne();
    await queue.save();

    // Emit real-time update
    await emitQueueUpdate(req.businessId);

    res.json({ message: 'Müşteri sıradan çıkarıldı' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   POST /api/queue/reset
// @desc    Reset today's queue
// @access  Private
router.post('/reset', auth, async (req, res) => {
  try {
    const today = getTodayDate();
    await Queue.findOneAndDelete({ businessId: req.businessId, date: today });

    // Emit real-time update
    await emitQueueUpdate(req.businessId);

    res.json({ message: 'Sıra sıfırlandı' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// @route   GET /api/queue/stats/today
// @desc    Get today's queue statistics
// @access  Private
router.get('/stats/today', auth, async (req, res) => {
  try {
    const queue = await getOrCreateQueue(req.businessId);

    const waitingCustomers = queue.customers.filter(c => c.status === 'waiting');
    const calledCustomers = queue.customers.filter(c => c.status === 'called');
    const doneCustomers = queue.customers.filter(c => c.status === 'done');

    res.json({
      totalCustomers: queue.customers.length,
      waitingCount: waitingCustomers.length,
      calledCount: calledCustomers.length,
      doneCount: doneCustomers.length,
      avgWaitTime: queue.getAverageWaitTime(),
      lastTicketNumber: queue.lastTicketNumber
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

module.exports = router;
