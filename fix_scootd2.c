#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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

// This represents a FIXED version of the team assignment code block
// The rest of the scootd.c file would be unchanged
void assign_teams_fixed(int players_team[], const char* checkin_types[], int swap) {
    int home_team_count = 0;
    int away_team_count = 0;
    
    // Assign teams to players without a team assignment
    for (int i = 0; i < 8; i++) {
        if (players_team[i] == 0) {
            // Parse checkin type for team designation
            const char *type = checkin_types[i];
            char team_designation = get_team_designation(type);
            
            // Assign team based on designation (considering swap if enabled)
            if (team_designation == 'H') {
                players_team[i] = swap ? 2 : 1; // HOME or swap to AWAY
                home_team_count++;
            } else if (team_designation == 'A') {
                players_team[i] = swap ? 1 : 2; // AWAY or swap to HOME
                away_team_count++;
            } else {
                // Default assignment (existing logic) for players without team designation
                if (home_team_count < 4) {
                    // If swap is true, reverse the team assignment
                    players_team[i] = swap ? 2 : 1; // HOME or AWAY based on swap
                    home_team_count++;
                } else {
                    // If swap is true, reverse the team assignment
                    players_team[i] = swap ? 1 : 2; // AWAY or HOME based on swap
                    away_team_count++;
                }
            }
        } else if (swap) {
            // If swap is true, reverse the existing team assignments
            players_team[i] = players_team[i] == 1 ? 2 : 1;
        }
    }
}

// Test program to verify the fix works as expected
int main() {
    // Test with different checkin types including team designations
    const char* test_checkin_types[8] = {
        "loss_promoted:2:A",    // Player 0 - explicit AWAY
        "manual",               // Player 1 - no designation
        "autoup:1:H",           // Player 2 - explicit HOME
        "win_promoted:3",       // Player 3 - no designation
        "loss_promoted:1:A",    // Player 4 - explicit AWAY
        "loss_promoted:2",      // Player 5 - no designation
        "manual:H",             // Player 6 - explicit HOME
        "win_promoted"          // Player 7 - no designation
    };
    
    // Test with team assignments and without swap
    int players_team_no_swap[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    assign_teams_fixed(players_team_no_swap, test_checkin_types, 0);
    
    printf("TEAM ASSIGNMENT TEST (NO SWAP)\n");
    printf("==============================\n");
    printf("Player | Checkin Type        | Team\n");
    printf("-------|--------------------|-----\n");
    for (int i = 0; i < 8; i++) {
        printf("%-6d | %-20s | %s\n", 
            i, 
            test_checkin_types[i], 
            players_team_no_swap[i] == 1 ? "HOME" : "AWAY"
        );
    }
    printf("\n");
    
    // Test with team assignments and with swap
    int players_team_with_swap[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    assign_teams_fixed(players_team_with_swap, test_checkin_types, 1);
    
    printf("TEAM ASSIGNMENT TEST (WITH SWAP)\n");
    printf("===============================\n");
    printf("Player | Checkin Type        | Team\n");
    printf("-------|--------------------|-----\n");
    for (int i = 0; i < 8; i++) {
        printf("%-6d | %-20s | %s\n", 
            i, 
            test_checkin_types[i], 
            players_team_with_swap[i] == 1 ? "HOME" : "AWAY"
        );
    }
    
    return 0;
}