import cron from 'node-cron';
import Match from '../models/Match.js';

/**
 * Checks for matches that need to be locked (startTime - 2h <= now)
 * and sets their status to "locked" if not already completed/locked.
 */
async function lockMatches() {
  try {
    const now = new Date();

    // Find matches scheduled to start in <= 2h that are still "scheduled"
    const toLock = await Match.find({
      status: 'scheduled',
      lockAt: { $lte: now },
    }).populate('teamA teamB');

    if (toLock.length > 0) {
      for (const match of toLock) {
        match.status = 'locked';
        await match.save();
        console.log(`🔒 Auto-locked match: ${match.teamA} vs ${match.teamB} (${match.startTime.toISOString()})`);
      }
    }
  } catch (err) {
    console.error('Error in lockMatches job:', err);
  }
}

export function startLockJob() {
  // Run every minute (cron syntax: "*/1 * * * *")
  cron.schedule('*/1 * * * *', () => {
    lockMatches();
  });

  console.log('⏰ Auto-lock job scheduled (runs every minute)');
}