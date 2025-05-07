#!/bin/bash

# Backup the original file
cp scootd.c scootd.c.original

# Add the team designation helper function after the includes section
sed -i '/#include <time.h>/a \
\
/* Helper function to extract team designation from checkin type */ \
char get_team_designation(const char* checkin_type) { \
    /* Find the last ":" character in the type string */ \
    const char *last_colon = strrchr(checkin_type, "\":\""); \
    if (last_colon != NULL && (last_colon[1] == \"H\" || last_colon[1] == \"A\")) { \
        return last_colon[1]; \
    } \
    return \"\\\0\"; \
}' scootd.c

# Replace the first team assignment block (around line 1059)
sed -i '1061,1071c\
            if (players[i].team == 0) { \
                /* Parse checkin type for team designation */ \
                const char *type = players[i].checkin_type; \
                char team_designation = get_team_designation(type); \
                \
                /* Assign team based on designation (considering swap if enabled) */ \
                if (team_designation == \"H\") { \
                    players[i].team = swap ? 2 : 1; /* HOME or swap to AWAY */ \
                    home_team_count++; \
                } else if (team_designation == \"A\") { \
                    players[i].team = swap ? 1 : 2; /* AWAY or swap to HOME */ \
                    away_team_count++; \
                } else { \
                    /* Default assignment (existing logic) for players without team designation */ \
                    if (home_team_count < 4) { \
                        /* If swap is true, reverse the team assignment */ \
                        players[i].team = swap ? 2 : 1; /* HOME or AWAY based on swap */ \
                        home_team_count++; \
                    } else { \
                        /* If swap is true, reverse the team assignment */ \
                        players[i].team = swap ? 1 : 2; /* AWAY or HOME based on swap */ \
                        away_team_count++; \
                    } \
                }' scootd.c

# Replace the second team assignment block (around line 1187)
sed -i '1189,1199c\
            if (players[i].team == 0) { \
                /* Parse checkin type for team designation */ \
                const char *type = players[i].checkin_type; \
                char team_designation = get_team_designation(type); \
                \
                /* Assign team based on designation (considering swap if enabled) */ \
                if (team_designation == \"H\") { \
                    players[i].team = swap ? 2 : 1; /* HOME or swap to AWAY */ \
                    home_team_count++; \
                } else if (team_designation == \"A\") { \
                    players[i].team = swap ? 1 : 2; /* AWAY or swap to HOME */ \
                    away_team_count++; \
                } else { \
                    /* Default assignment (existing logic) for players without team designation */ \
                    if (home_team_count < 4) { \
                        /* If swap is true, reverse the team assignment */ \
                        players[i].team = swap ? 2 : 1; /* HOME or AWAY based on swap */ \
                        home_team_count++; \
                    } else { \
                        /* If swap is true, reverse the team assignment */ \
                        players[i].team = swap ? 1 : 2; /* AWAY or HOME based on swap */ \
                        away_team_count++; \
                    } \
                }' scootd.c

echo "Applied fixes to scootd.c. Original backup saved at scootd.c.original"