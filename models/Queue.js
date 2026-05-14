const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Misafir',
    trim: true
  },
  ticketNumber: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'called', 'done'],
    default: 'waiting'
  },
  calledAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

const queueSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  customers: [customerSchema],
  lastTicketNumber: {
    type: Number,
    default: 0
  },
  date: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Compound index: one queue per business per day
queueSchema.index({ businessId: 1, date: 1 }, { unique: true });

// Virtual: get waiting customers
queueSchema.virtual('waitingCount').get(function() {
  return this.customers.filter(c => c.status === 'waiting').length;
});

// Virtual: get called customers
queueSchema.virtual('calledCount').get(function() {
  return this.customers.filter(c => c.status === 'called').length;
});

// Virtual: get completed customers
queueSchema.virtual('doneCount').get(function() {
  return this.customers.filter(c => c.status === 'done').length;
});

// Calculate average wait time (in minutes) for completed customers
queueSchema.methods.getAverageWaitTime = function() {
  const completedCustomers = this.customers.filter(
    c => c.status === 'done' && c.completedAt && c.createdAt
  );

  if (completedCustomers.length === 0) return 0;

  const totalWait = completedCustomers.reduce((sum, c) => {
    return sum + (new Date(c.completedAt) - new Date(c.createdAt));
  }, 0);

  return Math.round(totalWait / completedCustomers.length / 60000); // Convert to minutes
};

module.exports = mongoose.model('Queue', queueSchema);
