/**
 * Database cleanup utility to fix duplicate player check-ins
 */
import { eq, inArray, and, isNull } from "drizzle-orm";
import { db } from "./db";
import { checkins, users } from "@shared/schema";

async function cleanupDuplicateCheckins() {
  console.log("Starting database cleanup...");

  // Find all players who have multiple active check-ins
  const result = await db.execute<{ userId: number, count: number }>(
    `SELECT user_id as "userId", COUNT(*) as count
     FROM checkins
     WHERE is_active = true
     GROUP BY user_id
     HAVING COUNT(*) > 1`
  );
  
  // Convert to array for easier manipulation
  const duplicateUsers = result as unknown as Array<{ userId: number, count: number }>;

  console.log(`Found ${duplicateUsers.length} users with duplicate check-ins:`);
  
  // Process each user with duplicate check-ins
  for (const user of duplicateUsers) {
    // Get all active check-ins for this user
    const userCheckins = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        gameId: checkins.gameId,
        queuePosition: checkins.queuePosition,
        type: checkins.type
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.userId, user.userId),
          eq(checkins.isActive, true)
        )
      )
      .orderBy(checkins.id);

    console.log(`User ${userCheckins[0]?.username} (ID: ${user.userId}) has ${userCheckins.length} active check-ins:`);
    
    for (const checkin of userCheckins) {
      console.log(`  - ID: ${checkin.id}, Position: ${checkin.queuePosition}, GameID: ${checkin.gameId || 'null'}, Type: ${checkin.type}`);
    }

    // Get the preferred check-in to keep (the one that's assigned to a game takes precedence)
    const gameAssignedCheckin = userCheckins.find(c => c.gameId !== null);
    
    if (gameAssignedCheckin) {
      // User is assigned to a game, deactivate all other check-ins
      const checkinIdsToDeactivate = userCheckins
        .filter(c => c.id !== gameAssignedCheckin.id)
        .map(c => c.id);
      
      if (checkinIdsToDeactivate.length > 0) {
        await db
          .update(checkins)
          .set({ isActive: false })
          .where(inArray(checkins.id, checkinIdsToDeactivate));
        
        console.log(`  → Deactivated ${checkinIdsToDeactivate.length} duplicate check-ins, kept game assigned check-in ID ${gameAssignedCheckin.id}`);
      }
    } else {
      // User is not assigned to a game, keep only the check-in with the lowest position
      const checkinToKeep = userCheckins.reduce((prev, curr) => 
        (prev.queuePosition || 999) < (curr.queuePosition || 999) ? prev : curr
      );
      
      const checkinIdsToDeactivate = userCheckins
        .filter(c => c.id !== checkinToKeep.id)
        .map(c => c.id);
      
      if (checkinIdsToDeactivate.length > 0) {
        await db
          .update(checkins)
          .set({ isActive: false })
          .where(inArray(checkins.id, checkinIdsToDeactivate));
        
        console.log(`  → Deactivated ${checkinIdsToDeactivate.length} duplicate check-ins, kept check-in ID ${checkinToKeep.id} with position ${checkinToKeep.queuePosition}`);
      }
    }
  }
  
  console.log("Database cleanup completed successfully.");
}

export { cleanupDuplicateCheckins };