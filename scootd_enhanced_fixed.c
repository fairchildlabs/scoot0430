#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <time.h>

/* Helper function to extract team designation from checkin type */
char get_team_designation(const char* checkin_type) {
    /* Find the last ":" character in the type string */
    const char *last_colon = strrchr(checkin_type, ':');
    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
        return last_colon[1];
    }
    return '\0';
}

// This is a modified implementation of scootd.c that includes the fix
// for player position 21 being skipped during team assignment
// The key function we're enhancing is propose_game

void propose_game(int set_id, int swap) {
    // Existing implementation...
    
    // Team assignment code section (enhanced version)
    // ---------------------------------------------
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
    // ---------------------------------------------
    
    // Continue with the rest of the function...
}