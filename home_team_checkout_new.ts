  private async handleHomeTeamCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number },
    activeGameSet: GameSet
  ): Promise<void> {
    // Store original position before deactivating
    const checkedOutPosition = currentCheckin.queuePosition;

    // Calculate the minimum position for NEXT_UP players
    const nextUpMinPosition = activeGameSet.currentQueuePosition + (2 * activeGameSet.playersPerTeam);
    console.log(`Calculated NEXT_UP minimum position: ${nextUpMinPosition} (currentQueuePosition: ${activeGameSet.currentQueuePosition}, playersPerTeam: ${activeGameSet.playersPerTeam})`);

    console.log('Starting HOME team checkout:', {
      username: currentCheckin.username,
      checkinId: currentCheckin.id,
      checkedOutPosition,
      gameId: currentCheckin.gameId,
      team: currentCheckin.team
    });

    // Log all active checkins before deactivation
    const beforeCheckins = await this.getCurrentCheckinsState();
    console.log('Checkins before deactivation:', beforeCheckins);

    // First deactivate current player's checkin and explicitly set queue_position to 0
    await db
      .update(checkins)
      .set({
        isActive: false,
        queuePosition: 0
      })
      .where(eq(checkins.id, currentCheckin.id));

    console.log(`Deactivated HOME player checkin ${currentCheckin.id} and set queue_position to 0`);

    // Get all active NEXT_UP players (those with queue positions >= nextUpMinPosition)
    const availablePlayers = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive,
        gameId: checkins.gameId
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gte(checkins.queuePosition, nextUpMinPosition) // Only NEXT_UP players
        )
      )
      .orderBy(checkins.queuePosition);

    console.log('Available NEXT_UP players for replacement:', availablePlayers);

    if (availablePlayers.length === 0) {
      throw new Error('No available NEXT_UP players found to replace HOME team player');
    }

    // Take the first NEXT_UP player as the replacement
    const nextPlayerCheckin = availablePlayers[0];

    // Store next player's original position for decrementing logic
    const nextPlayerOriginalPosition = nextPlayerCheckin.queuePosition;

    console.log('HOME team replacement details:', {
      checkedOutPosition,
      nextPlayerUsername: nextPlayerCheckin.username,
      nextPlayerOldPosition: nextPlayerOriginalPosition,
      inheritingPosition: checkedOutPosition
    });

    // Update next player with game info and checked-out position
    await db
      .update(checkins)
      .set({
        gameId: currentCheckin.gameId,
        team: currentCheckin.team,
        queuePosition: checkedOutPosition // Inherit exact position
      })
      .where(eq(checkins.id, nextPlayerCheckin.id));

    console.log(`Updated next player ${nextPlayerCheckin.username} to inherit position ${checkedOutPosition}`);

    // Log intermediate state
    console.log('State after position inheritance:', await this.getCurrentCheckinsState());

    // Decrement positions only for Next Up players after nextPlayerCheckin's original position
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, nextPlayerOriginalPosition),
          gte(checkins.queuePosition, nextUpMinPosition) // Only affect NEXT_UP players
        )
      );

    // Decrement queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));

    console.log('HOME team checkout complete - Updated Next Up positions and decremented queue_next_up');

    // Log final state
    console.log('Final checkins state:', await this.getCurrentCheckinsState());
  }
