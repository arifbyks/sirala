const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const businessSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'İşletme adı zorunludur'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'E-posta zorunludur'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Şifre zorunludur'],
    minlength: 6
  },
  serviceType: {
    type: String,
    required: [true, 'Hizmet türü zorunludur'],
    trim: true
  },
  capacity: {
    type: Number,
    default: 1,
    min: 1
  },
  qrCodeData: {
    type: String
  },
  darkMode: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Hash password before saving
businessSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
businessSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
businessSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Business', businessSchema);
