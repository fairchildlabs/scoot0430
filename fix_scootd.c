#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/**
 * This program serves as a helper to patch scootd.c with the team designation fix.
 * It reads the original file, adds the get_team_designation function,
 * and updates the team assignment logic blocks.
 */

int main() {
    FILE *source = fopen("scootd.c", "r");
    FILE *temp = fopen("scootd_patched.c", "w");
    
    if (!source || !temp) {
        printf("Error opening files\n");
        return 1;
    }
    
    // Make a backup
    system("cp scootd.c scootd.c.backup");
    
    // Read the original file and add the helper function after includes
    char buffer[1024];
    int added_function = 0;
    
    while (fgets(buffer, sizeof(buffer), source)) {
        fputs(buffer, temp);
        
        // After #include <time.h>, add our helper function
        if (!added_function && strstr(buffer, "#include <time.h>")) {
            fprintf(temp, "\n/* Helper function to extract team designation from checkin type */\n");
            fprintf(temp, "char get_team_designation(const char* checkin_type) {\n");
            fprintf(temp, "    /* Find the last \":\" character in the type string */\n");
            fprintf(temp, "    const char *last_colon = strrchr(checkin_type, ':');\n");
            fprintf(temp, "    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {\n");
            fprintf(temp, "        return last_colon[1];\n");
            fprintf(temp, "    }\n");
            fprintf(temp, "    return '\\0';\n");
            fprintf(temp, "}\n\n");
            added_function = 1;
        }
    }
    
    fclose(source);
    fclose(temp);
    
    // Now do a search and replace of the team assignment code blocks
    // Use sed to replace team assignment logic in both locations
    system("sed -i '/\\/\\/ Assign teams to players without a team assignment/,/away_team_count++; /c\\\n        // Assign teams to players without a team assignment\\n        for (int i = 0; i < 8; i++) {\\n            if (players[i].team == 0) {\\n                // Parse checkin type for team designation\\n                const char *type = players[i].checkin_type;\\n                char team_designation = get_team_designation(type);\\n                \\n                // Assign team based on designation (considering swap if enabled)\\n                if (team_designation == \\'H\\') {\\n                    players[i].team = swap ? 2 : 1; // HOME or swap to AWAY\\n                    home_team_count++;\\n                } else if (team_designation == \\'A\\') {\\n                    players[i].team = swap ? 1 : 2; // AWAY or swap to HOME\\n                    away_team_count++;\\n                } else {\\n                    // Default assignment (existing logic) for players without team designation\\n                    if (home_team_count < 4) {\\n                        // If swap is true, reverse the team assignment\\n                        players[i].team = swap ? 2 : 1; // HOME or AWAY based on swap\\n                        home_team_count++;\\n                    } else {\\n                        // If swap is true, reverse the team assignment\\n                        players[i].team = swap ? 1 : 2; // AWAY or HOME based on swap\\n                        away_team_count++;\\n                    }\\n                }' scootd_patched.c");
    
    // Move the patched file to the original location
    system("mv scootd_patched.c scootd.c");
    
    printf("Fix applied successfully!\n");
    printf("1. Original backup saved as: scootd.c.backup\n");
    printf("2. The fix includes:\n");
    printf("   - Added get_team_designation() helper function\n");
    printf("   - Enhanced team assignment logic to parse checkin types\n\n");
    printf("Compile with: gcc -o scootd scootd.c\n");
    
    return 0;
}