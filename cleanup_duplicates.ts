/**
 * Cleanup script to fix duplicate active checkins
 * This script will deactivate older duplicate active checkins for the same user
 * Run this script once to clean up existing data
 */

import { db } from './server/db';
import { checkins, users } from './shared/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

async function cleanupDuplicateCheckins() {
  console.log('Starting duplicate checkin cleanup...');

  try {
    // Find all active checkins in the queue (gameId = null)
    const allActiveCheckins = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition,
        gameSetId: checkins.gameSetId,
        type: checkins.type,
        checkInTime: checkins.checkInTime,
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          isNull(checkins.gameId), // In the queue (Next Up)
          eq(checkins.isActive, true)
        )
      )
      .orderBy(asc(checkins.userId), asc(checkins.checkInTime));

    console.log(`Found ${allActiveCheckins.length} total active checkins in the queue`);

    // Group checkins by userId to find duplicates
    const checkinsByUser = new Map<number, typeof allActiveCheckins>();
    for (const checkin of allActiveCheckins) {
      if (!checkinsByUser.has(checkin.userId)) {
        checkinsByUser.set(checkin.userId, []);
      }
      checkinsByUser.get(checkin.userId)?.push(checkin);
    }

    // Find users with duplicate checkins
    const usersWithDuplicates = Array.from(checkinsByUser.entries())
      .filter(([_userId, userCheckins]) => userCheckins.length > 1);

    console.log(`Found ${usersWithDuplicates.length} users with duplicate checkins`);

    // For each user with duplicates, keep only the newest checkin
    for (const [userId, userCheckins] of usersWithDuplicates) {
      // Sort by checkInTime descending to keep the newest one
      const sortedCheckins = [...userCheckins].sort(
        (a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()
      );

      // Keep the newest one, deactivate all others
      const [newestCheckin, ...olderCheckins] = sortedCheckins;
      const olderCheckinIds = olderCheckins.map(c => c.id);

      console.log(`User ${newestCheckin.username} (ID: ${userId}): Keeping newest checkin at position ${newestCheckin.queuePosition}, deactivating ${olderCheckins.length} older checkins`);

      if (olderCheckinIds.length > 0) {
        // Deactivate older checkins
        await db
          .update(checkins)
          .set({ isActive: false })
          .where(inArray(checkins.id, olderCheckinIds));
      }
    }

    console.log('Duplicate checkin cleanup completed successfully');
  } catch (error) {
    console.error('Error during duplicate checkin cleanup:', error);
  }
}

// Run the cleanup
cleanupDuplicateCheckins().catch(console.error);