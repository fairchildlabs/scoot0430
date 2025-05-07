#include <stdio.h>
#include <string.h>

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