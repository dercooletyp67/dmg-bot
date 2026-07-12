const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Connect to DB (Prisma handles connection lazily, but we can verify it here)
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to PostgreSQL via Prisma!');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error);
  }
}

module.exports = {
  prisma,
  connectDB
};
