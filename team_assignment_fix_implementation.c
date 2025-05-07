/**
 * COMPLETE FIX FOR TEAM ASSIGNMENT IN SCOOTD.C
 * 
 * This code demonstrates how to implement the fix for the team assignment issue
 * in scootd.c where player position 21 is being skipped during team assignment.
 * 
 * 1. First, add the team designation function at the top of the file:
 */

/**
 * Extract team designation from a checkin type
 * Checks if the checkin type ends with :H or :A and returns the designation
 * 
 * @param checkin_type The checkin type string to parse
 * @return 'H' for HOME team, 'A' for AWAY team, '\0' if no designation
 */
char get_team_designation(const char* checkin_type) {
    // Find the last ':' character in the type string
    const char *last_colon = strrchr(checkin_type, ':');
    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
        return last_colon[1];
    }
    return '\0';
}

/**
 * 2. Then replace BOTH instances of the team assignment code with this updated version:
 */

// Assign teams to players without a team assignment
for (int i = 0; i < 8; i++) {
    if (players[i].team == 0) {
        // Parse checkin type for team designation
        const char *type = players[i].checkin_type;
        char team_designation = get_team_designation(type);
        
        // Assign team based on designation (considering swap if enabled)
        if (team_designation == 'H') {
            players[i].team = swap ? 2 : 1; // HOME or swap to AWAY
            home_team_count++;
        } else if (team_designation == 'A') {
            players[i].team = swap ? 1 : 2; // AWAY or swap to HOME
            away_team_count++;
        } else {
            // Default assignment (existing logic) for players without team designation
            if (home_team_count < 4) {
                // If swap is true, reverse the team assignment
                players[i].team = swap ? 2 : 1; // HOME or AWAY based on swap
                home_team_count++;
            } else {
                // If swap is true, reverse the team assignment
                players[i].team = swap ? 1 : 2; // AWAY or HOME based on swap
                away_team_count++;
            }
        }
    } else if (swap) {
        // If swap is true, reverse the existing team assignments
        players[i].team = players[i].team == 1 ? 2 : 1;
    }
}

/**
 * 3. There are two instances of this code that need to be replaced:
 *    - Around line 1059 (First instance in JSON output function)
 *    - Around line 1187 (Second instance in text output function)
 * 
 * The key enhancement is checking the checkin_type field for a team designation
 * before applying the default team assignment logic.
 */