const mongoose = require('mongoose');

// Define Schemas
const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  welcomeChannel: String,
  welcomeMessage: String,
  autoRole: String,
  logChannel: String,
  appReviewChannel: String
});

const commandSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['prefix', 'anywhere'], default: 'prefix' },
  reply: { type: String, required: true }
});

const warningSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  reason: { type: String, required: true },
  timestamp: { type: Number, default: Date.now }
});

const ticketTranscriptSchema = new mongoose.Schema({
  ticketName: { type: String, required: true },
  closedBy: { type: String, required: true },
  reason: { type: String, required: true },
  transcript: { type: Array, required: true },
  isArchived: { type: Boolean, default: false },
  timestamp: { type: Number, default: Date.now }
});

const appCooldownSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  expiresAt: { type: Number, required: true }
});

const applicationSchema = new mongoose.Schema({
  userId: String,
  userTag: String,
  timeTaken: String,
  aiScore: Number,
  plagiarism: Boolean,
  questions: [String],
  answers: [String],
  status: { type: String, default: 'PENDING' }, // PENDING, ACCEPTED, DENIED, BLACKLISTED
  reason: { type: String, default: '' },
  processedBy: String,
  timestamp: { type: Number, default: Date.now }
});

// Models
const Settings = mongoose.model('Settings', settingsSchema);
const Command = mongoose.model('Command', commandSchema);
const Warning = mongoose.model('Warning', warningSchema);
const TicketTranscript = mongoose.model('TicketTranscript', ticketTranscriptSchema);
const AppCooldown = mongoose.model('AppCooldown', appCooldownSchema);
const Application = mongoose.model('Application', applicationSchema);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined in the environment variables!');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('Successfully connected to MongoDB!');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
  }
}

module.exports = {
  connectDB,
  Settings,
  Command,
  Warning,
  TicketTranscript,
  AppCooldown,
  Application
};
