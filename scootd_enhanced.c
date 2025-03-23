#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <libpq-fe.h>
#include <time.h>

/* Database connection string */
#define MAX_CONN_INFO_LEN 256

/* Status codes */
#define STAT_SUCCESS 0
#define STAT_ERROR_DB -1
#define STAT_ERROR_INVALID_GAME_SET -2
#define STAT_ERROR_GAME_IN_PROGRESS -3
#define STAT_ERROR_NOT_ENOUGH_PLAYERS -4
#define STAT_ERROR_INVALID_FORMAT -5

/* Function prototypes */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format);
PGconn *connect_to_db(void);

/* Function to check if a player is an OG based on birth year */
bool is_og_player(int birth_year) {
    /* Players born in 1980 or earlier are considered OGs */
    return birth_year > 0 && birth_year <= 1980;
}

/* Enhanced implementation of get_game_set_status with user_id and is_og fields */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format) {
    // First check if the game set exists
    const char *check_game_set_query = 
        "SELECT id, players_per_team, is_active, gym, created_at, current_queue_position, "
        "created_by "
        "FROM game_sets WHERE id = $1";
    
    char set_id_str[16];
    sprintf(set_id_str, "%d", game_set_id);
    const char *check_params[1] = { set_id_str };
    
    PGresult *check_result = PQexecParams(conn, check_game_set_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(check_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game set check query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when checking game set\"\n");
            printf("}\n");
        } else {
            printf("Error checking game set: Database error\n");
        }
        return;
    }
    
    if (PQntuples(check_result) == 0) {
        PQclear(check_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Invalid game_set_id: %d\"\n", game_set_id);
            printf("}\n");
        } else {
            printf("Invalid game_set_id: %d\n", game_set_id);
        }
        return;
    }
    
    // Get game set basic info
    const char *game_set_active = PQgetvalue(check_result, 0, 2);
    const char *game_set_state = game_set_active[0] == 't' ? "active" : "ended";
    const char *game_set_name = PQgetvalue(check_result, 0, 3);  // gym name
    const char *create_date = PQgetvalue(check_result, 0, 4);    // created_at
    int current_queue_position = atoi(PQgetvalue(check_result, 0, 5));
    int players_per_team = atoi(PQgetvalue(check_result, 0, 1));
    
    // 1. Get ACTIVE GAMES
    const char *active_games_query = 
        "SELECT g.id, g.court, g.state, g.start_time, g.team1_score, g.team2_score "
        "FROM games g "
        "WHERE g.set_id = $1 AND g.state = 'started' "
        "ORDER BY g.id";
    
    PGresult *active_games_result = PQexecParams(conn, active_games_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(active_games_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Active games query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        PQclear(active_games_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when fetching active games\"\n");
            printf("}\n");
        } else {
            printf("Error fetching active games: Database error\n");
        }
        return;
    }
    
    int active_games_count = PQntuples(active_games_result);
    
    // 2. Get NEXT UP PLAYERS (players without a game_id)
    const char *next_up_query = 
        "SELECT c.queue_position, u.username, u.id, c.type, c.team, u.birth_year "
        "FROM checkins c "
        "JOIN users u ON c.user_id = u.id "
        "WHERE c.is_active = true AND c.game_set_id = $1 AND c.game_id IS NULL "
        "ORDER BY c.queue_position ASC";
    
    PGresult *next_up_result = PQexecParams(conn, next_up_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(next_up_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Next up query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        PQclear(active_games_result);
        PQclear(next_up_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when fetching next up players\"\n");
            printf("}\n");
        } else {
            printf("Error fetching next up players: Database error\n");
        }
        return;
    }
    
    int next_up_count = PQntuples(next_up_result);
    
    // 3. Get COMPLETED GAMES with players
    const char *completed_games_query = 
        "SELECT g.id, g.court, g.team1_score, g.team2_score, g.start_time, g.end_time "
        "FROM games g "
        "WHERE g.set_id = $1 AND g.state = 'final' "
        "ORDER BY g.id";
    
    PGresult *completed_games_result = PQexecParams(conn, completed_games_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(completed_games_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Completed games query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        PQclear(active_games_result);
        PQclear(next_up_result);
        PQclear(completed_games_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when fetching completed games\"\n");
            printf("}\n");
        } else {
            printf("Error fetching completed games: Database error\n");
        }
        return;
    }
    
    int completed_games_count = PQntuples(completed_games_result);
    
    // 4. Calculate game set statistics
    // Get the first game's start time and the last game's end time
    const char *game_set_time_query = 
        "SELECT "
        "  (SELECT MIN(start_time) FROM games WHERE set_id = $1) as first_game_time, "
        "  (SELECT MAX(end_time) FROM games WHERE set_id = $1 AND state = 'final') as last_game_time, "
        "  (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE game_set_id = $1) as unique_players, "
        "  (SELECT COUNT(*) FROM games WHERE set_id = $1) as total_games";
    
    PGresult *game_set_time_result = PQexecParams(conn, game_set_time_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(game_set_time_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game set time query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        PQclear(active_games_result);
        PQclear(next_up_result);
        PQclear(completed_games_result);
        PQclear(game_set_time_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when calculating game set statistics\"\n");
            printf("}\n");
        } else {
            printf("Error calculating game set statistics: Database error\n");
        }
        return;
    }
    
    // Format start time
    const char *first_game_time = NULL;
    if (!PQgetisnull(game_set_time_result, 0, 0)) {
        first_game_time = PQgetvalue(game_set_time_result, 0, 0);
    }
    
    // Format end time
    const char *last_game_time = NULL;
    if (!PQgetisnull(game_set_time_result, 0, 1)) {
        last_game_time = PQgetvalue(game_set_time_result, 0, 1);
    }
    
    // Get unique players and total games count
    int unique_players = 0;
    if (!PQgetisnull(game_set_time_result, 0, 2)) {
        unique_players = atoi(PQgetvalue(game_set_time_result, 0, 2));
    }
    
    int total_games = 0;
    if (!PQgetisnull(game_set_time_result, 0, 3)) {
        total_games = atoi(PQgetvalue(game_set_time_result, 0, 3));
    }
    
    // JSON FORMAT
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"OK\",\n");
        printf("  \"game_set\": {\n");
        printf("    \"id\": %d,\n", game_set_id);
        printf("    \"name\": \"%s\",\n", game_set_name);
        printf("    \"state\": \"%s\",\n", game_set_state);
        printf("    \"created_at\": \"%s\",\n", create_date);
        
        if (first_game_time) {
            printf("    \"start_time\": \"%s\",\n", first_game_time);
        } else {
            printf("    \"start_time\": null,\n");
        }
        
        if (last_game_time) {
            printf("    \"end_time\": \"%s\",\n", last_game_time);
        } else {
            printf("    \"end_time\": null,\n");
        }
        
        printf("    \"current_queue_position\": %d,\n", current_queue_position);
        printf("    \"players_per_team\": %d,\n", players_per_team);
        printf("    \"unique_players\": %d,\n", unique_players);
        printf("    \"total_games\": %d\n", total_games);
        printf("  },\n");
        
        // Active games
        printf("  \"active_games\": [\n");
        for (int i = 0; i < active_games_count; i++) {
            int game_id = atoi(PQgetvalue(active_games_result, i, 0));
            const char *court = PQgetvalue(active_games_result, i, 1);
            const char *state = PQgetvalue(active_games_result, i, 2);
            const char *start_time = PQgetvalue(active_games_result, i, 3);
            int team1_score = atoi(PQgetvalue(active_games_result, i, 4));
            int team2_score = atoi(PQgetvalue(active_games_result, i, 5));
            
            printf("    {\n");
            printf("      \"id\": %d,\n", game_id);
            printf("      \"court\": \"%s\",\n", court);
            printf("      \"state\": \"%s\",\n", state);
            printf("      \"start_time\": \"%s\",\n", start_time);
            printf("      \"team1_score\": %d,\n", team1_score);
            printf("      \"team2_score\": %d,\n", team2_score);
            
            // Fetch players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                "FROM game_players gp "
                "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                "JOIN users u ON gp.user_id = u.id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            const char *game_params[1] = { game_id_str };
            PGresult *players_result = PQexecParams(conn, game_players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
                fprintf(stderr, "Players query failed for game %d: %s\n", game_id, PQerrorMessage(conn));
                PQclear(players_result);
                printf("      \"players\": []\n");
            } else {
                int player_count = PQntuples(players_result);
                printf("      \"players\": [\n");
                
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    int user_id = atoi(PQgetvalue(players_result, j, 4));
                    
                    // Check if player is OG based on birth year
                    bool is_og = false;
                    if (!PQgetisnull(players_result, j, 5)) {
                        int birth_year = atoi(PQgetvalue(players_result, j, 5));
                        is_og = is_og_player(birth_year);
                    }
                    
                    printf("        {\n");
                    printf("          \"username\": \"%s\",\n", username);
                    printf("          \"team\": %d,\n", team);
                    printf("          \"relative_position\": %d,\n", relative_position);
                    printf("          \"queue_position\": %d,\n", queue_position);
                    printf("          \"user_id\": %d,\n", user_id);
                    printf("          \"is_og\": %s\n", is_og ? "true" : "false");
                    
                    if (j < player_count - 1) {
                        printf("        },\n");
                    } else {
                        printf("        }\n");
                    }
                }
                printf("      ]\n");
                PQclear(players_result);
            }
            
            if (i < active_games_count - 1) {
                printf("    },\n");
            } else {
                printf("    }\n");
            }
        }
        printf("  ],\n");
        
        // Next up players
        printf("  \"next_up\": [\n");
        for (int i = 0; i < next_up_count; i++) {
            int queue_position = atoi(PQgetvalue(next_up_result, i, 0));
            const char *username = PQgetvalue(next_up_result, i, 1);
            int user_id = atoi(PQgetvalue(next_up_result, i, 2));
            const char *type = PQgetvalue(next_up_result, i, 3);
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(next_up_result, i, 5)) {
                int birth_year = atoi(PQgetvalue(next_up_result, i, 5));
                is_og = is_og_player(birth_year);
            }
            
            printf("    {\n");
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"position\": %d,\n", queue_position);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            
            if (i < next_up_count - 1) {
                printf("    },\n");
            } else {
                printf("    }\n");
            }
        }
        printf("  ],\n");
        
        // Completed games
        printf("  \"completed_games\": [\n");
        for (int i = 0; i < completed_games_count; i++) {
            int game_id = atoi(PQgetvalue(completed_games_result, i, 0));
            const char *court = PQgetvalue(completed_games_result, i, 1);
            int team1_score = atoi(PQgetvalue(completed_games_result, i, 2));
            int team2_score = atoi(PQgetvalue(completed_games_result, i, 3));
            const char *start_time = PQgetvalue(completed_games_result, i, 4);
            const char *end_time = PQgetvalue(completed_games_result, i, 5);
            
            printf("    {\n");
            printf("      \"id\": %d,\n", game_id);
            printf("      \"court\": \"%s\",\n", court);
            printf("      \"team1_score\": %d,\n", team1_score);
            printf("      \"team2_score\": %d,\n", team2_score);
            printf("      \"start_time\": \"%s\",\n", start_time);
            printf("      \"end_time\": \"%s\",\n", end_time);
            printf("      \"winner\": %d,\n", team1_score > team2_score ? 1 : 2);
            
            // Fetch players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                "FROM game_players gp "
                "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                "JOIN users u ON gp.user_id = u.id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            const char *game_params[1] = { game_id_str };
            PGresult *players_result = PQexecParams(conn, game_players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
                fprintf(stderr, "Players query failed for game %d: %s\n", game_id, PQerrorMessage(conn));
                PQclear(players_result);
                printf("      \"players\": []\n");
            } else {
                int player_count = PQntuples(players_result);
                printf("      \"players\": [\n");
                
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    int user_id = atoi(PQgetvalue(players_result, j, 4));
                    
                    // Check if player is OG based on birth year
                    bool is_og = false;
                    if (!PQgetisnull(players_result, j, 5)) {
                        int birth_year = atoi(PQgetvalue(players_result, j, 5));
                        is_og = is_og_player(birth_year);
                    }
                    
                    printf("        {\n");
                    printf("          \"username\": \"%s\",\n", username);
                    printf("          \"team\": %d,\n", team);
                    printf("          \"relative_position\": %d,\n", relative_position);
                    printf("          \"queue_position\": %d,\n", queue_position);
                    printf("          \"user_id\": %d,\n", user_id);
                    printf("          \"is_og\": %s\n", is_og ? "true" : "false");
                    
                    if (j < player_count - 1) {
                        printf("        },\n");
                    } else {
                        printf("        }\n");
                    }
                }
                printf("      ]\n");
                PQclear(players_result);
            }
            
            if (i < completed_games_count - 1) {
                printf("    },\n");
            } else {
                printf("    }\n");
            }
        }
        printf("  ]\n");
        printf("}\n");
    } else {
        // TEXT FORMAT (unchanged from original)
        printf("=== Game Set #%d: %s (%s) ===\n", game_set_id, game_set_name, game_set_state);
        printf("Created: %s\n", create_date);
        
        if (first_game_time) {
            printf("Start: %s\n", first_game_time);
        }
        
        if (last_game_time) {
            printf("End: %s\n", last_game_time);
        }
        
        printf("Current Queue Position: %d\n", current_queue_position);
        printf("Players Per Team: %d\n", players_per_team);
        printf("Unique Players: %d\n", unique_players);
        printf("Total Games: %d\n\n", total_games);
        
        // Active games
        printf("=== Active Games ===\n");
        if (active_games_count == 0) {
            printf("No active games\n\n");
        } else {
            for (int i = 0; i < active_games_count; i++) {
                int game_id = atoi(PQgetvalue(active_games_result, i, 0));
                const char *court = PQgetvalue(active_games_result, i, 1);
                const char *state = PQgetvalue(active_games_result, i, 2);
                const char *start_time = PQgetvalue(active_games_result, i, 3);
                int team1_score = atoi(PQgetvalue(active_games_result, i, 4));
                int team2_score = atoi(PQgetvalue(active_games_result, i, 5));
                
                printf("Game #%d on Court %s (Started: %s)\n", game_id, court, start_time);
                printf("State: %s\n", state);
                printf("Score: %d - %d\n", team1_score, team2_score);
                
                // Fetch players for this game
                char game_id_str[16];
                sprintf(game_id_str, "%d", game_id);
                const char *game_players_query = 
                    "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                    "FROM game_players gp "
                    "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = $1 "
                    "ORDER BY gp.team, gp.relative_position";
                
                const char *game_params[1] = { game_id_str };
                PGresult *players_result = PQexecParams(conn, game_players_query, 1, NULL, game_params, NULL, NULL, 0);
                
                if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
                    fprintf(stderr, "Players query failed for game %d: %s\n", game_id, PQerrorMessage(conn));
                } else {
                    int player_count = PQntuples(players_result);
                    printf("TEAM 1 (HOME):\n");
                    for (int j = 0; j < player_count; j++) {
                        int team = atoi(PQgetvalue(players_result, j, 0));
                        if (team != 1) continue;
                        
                        int relative_position = atoi(PQgetvalue(players_result, j, 1));
                        int queue_position = atoi(PQgetvalue(players_result, j, 2));
                        const char *username = PQgetvalue(players_result, j, 3);
                        int user_id = atoi(PQgetvalue(players_result, j, 4));
                        
                        // Check if player is OG
                        const char *og_status = "";
                        if (!PQgetisnull(players_result, j, 5)) {
                            int birth_year = atoi(PQgetvalue(players_result, j, 5));
                            if (is_og_player(birth_year)) {
                                og_status = " (OG)";
                            }
                        }
                        
                        printf("  %d. %s [%d]%s\n", 
                               relative_position, 
                               username, 
                               user_id,
                               og_status);
                    }
                    
                    printf("TEAM 2 (AWAY):\n");
                    for (int j = 0; j < player_count; j++) {
                        int team = atoi(PQgetvalue(players_result, j, 0));
                        if (team != 2) continue;
                        
                        int relative_position = atoi(PQgetvalue(players_result, j, 1));
                        int queue_position = atoi(PQgetvalue(players_result, j, 2));
                        const char *username = PQgetvalue(players_result, j, 3);
                        int user_id = atoi(PQgetvalue(players_result, j, 4));
                        
                        // Check if player is OG
                        const char *og_status = "";
                        if (!PQgetisnull(players_result, j, 5)) {
                            int birth_year = atoi(PQgetvalue(players_result, j, 5));
                            if (is_og_player(birth_year)) {
                                og_status = " (OG)";
                            }
                        }
                        
                        printf("  %d. %s [%d]%s\n", 
                               relative_position, 
                               username, 
                               user_id,
                               og_status);
                    }
                }
                
                PQclear(players_result);
                printf("\n");
            }
        }
        
        // Next up players
        printf("=== Next Up Queue ===\n");
        if (next_up_count == 0) {
            printf("No players in queue\n\n");
        } else {
            printf("%-3s %-20s %-10s %s\n", "Pos", "Player", "ID", "Status");
            printf("%-3s %-20s %-10s %s\n", "---", "--------------------", "----------", "------");
            
            for (int i = 0; i < next_up_count; i++) {
                int queue_position = atoi(PQgetvalue(next_up_result, i, 0));
                const char *username = PQgetvalue(next_up_result, i, 1);
                int user_id = atoi(PQgetvalue(next_up_result, i, 2));
                const char *type = PQgetvalue(next_up_result, i, 3);
                
                // Check if player is OG
                const char *og_status = "";
                if (!PQgetisnull(next_up_result, i, 5)) {
                    int birth_year = atoi(PQgetvalue(next_up_result, i, 5));
                    if (is_og_player(birth_year)) {
                        og_status = "OG";
                    }
                }
                
                printf("%-3d %-20s %-10d %s\n", 
                       queue_position, 
                       username, 
                       user_id,
                       og_status);
            }
            printf("\n");
        }
        
        // Completed games
        printf("=== Completed Games ===\n");
        if (completed_games_count == 0) {
            printf("No completed games\n\n");
        } else {
            for (int i = 0; i < completed_games_count; i++) {
                int game_id = atoi(PQgetvalue(completed_games_result, i, 0));
                const char *court = PQgetvalue(completed_games_result, i, 1);
                int team1_score = atoi(PQgetvalue(completed_games_result, i, 2));
                int team2_score = atoi(PQgetvalue(completed_games_result, i, 3));
                const char *start_time = PQgetvalue(completed_games_result, i, 4);
                const char *end_time = PQgetvalue(completed_games_result, i, 5);
                int winner = team1_score > team2_score ? 1 : 2;
                
                printf("Game #%d on Court %s (Played: %s to %s)\n", 
                       game_id, court, start_time, end_time);
                printf("Final Score: Team %d (HOME) %d - %d Team %d (AWAY)\n", 
                       1, team1_score, team2_score, 2);
                printf("Winner: Team %d %s\n", 
                       winner, winner == 1 ? "(HOME)" : "(AWAY)");
                
                // Fetch players for this game
                char game_id_str[16];
                sprintf(game_id_str, "%d", game_id);
                const char *game_players_query = 
                    "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                    "FROM game_players gp "
                    "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = $1 "
                    "ORDER BY gp.team, gp.relative_position";
                
                const char *game_params[1] = { game_id_str };
                PGresult *players_result = PQexecParams(conn, game_players_query, 1, NULL, game_params, NULL, NULL, 0);
                
                if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
                    fprintf(stderr, "Players query failed for game %d: %s\n", game_id, PQerrorMessage(conn));
                } else {
                    int player_count = PQntuples(players_result);
                    printf("TEAM 1 (HOME)%s:\n", winner == 1 ? " - WINNER" : "");
                    for (int j = 0; j < player_count; j++) {
                        int team = atoi(PQgetvalue(players_result, j, 0));
                        if (team != 1) continue;
                        
                        int relative_position = atoi(PQgetvalue(players_result, j, 1));
                        int queue_position = atoi(PQgetvalue(players_result, j, 2));
                        const char *username = PQgetvalue(players_result, j, 3);
                        int user_id = atoi(PQgetvalue(players_result, j, 4));
                        
                        // Check if player is OG
                        const char *og_status = "";
                        if (!PQgetisnull(players_result, j, 5)) {
                            int birth_year = atoi(PQgetvalue(players_result, j, 5));
                            if (is_og_player(birth_year)) {
                                og_status = " (OG)";
                            }
                        }
                        
                        printf("  %d. %s [%d]%s\n", 
                               relative_position, 
                               username, 
                               user_id,
                               og_status);
                    }
                    
                    printf("TEAM 2 (AWAY)%s:\n", winner == 2 ? " - WINNER" : "");
                    for (int j = 0; j < player_count; j++) {
                        int team = atoi(PQgetvalue(players_result, j, 0));
                        if (team != 2) continue;
                        
                        int relative_position = atoi(PQgetvalue(players_result, j, 1));
                        int queue_position = atoi(PQgetvalue(players_result, j, 2));
                        const char *username = PQgetvalue(players_result, j, 3);
                        int user_id = atoi(PQgetvalue(players_result, j, 4));
                        
                        // Check if player is OG
                        const char *og_status = "";
                        if (!PQgetisnull(players_result, j, 5)) {
                            int birth_year = atoi(PQgetvalue(players_result, j, 5));
                            if (is_og_player(birth_year)) {
                                og_status = " (OG)";
                            }
                        }
                        
                        printf("  %d. %s [%d]%s\n", 
                               relative_position, 
                               username, 
                               user_id,
                               og_status);
                    }
                }
                
                PQclear(players_result);
                printf("\n");
            }
        }
    }
    
    // Clean up
    PQclear(check_result);
    PQclear(active_games_result);
    PQclear(next_up_result);
    PQclear(completed_games_result);
    PQclear(game_set_time_result);
}

/* Connect to the PostgreSQL database */
PGconn *connect_to_db(void) {
    const char *conn_info;
    
    conn_info = getenv("DATABASE_URL");
    if (conn_info == NULL) {
        fprintf(stderr, "No DATABASE_URL environment variable set\n");
        return NULL;
    }
    
    PGconn *conn = PQconnectdb(conn_info);
    
    if (PQstatus(conn) != CONNECTION_OK) {
        fprintf(stderr, "Connection to database failed: %s\n", PQerrorMessage(conn));
        PQfinish(conn);
        return NULL;
    }
    
    return conn;
}

/* Main function */
int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <command> [options]\n", argv[0]);
        fprintf(stderr, "Commands:\n");
        fprintf(stderr, "  game-set-status <game_set_id> [json|text]\n");
        fprintf(stderr, "    Show the status of a game set, including active games, next up players, and completed games.\n");
        return 1;
    }
    
    const char *command = argv[1];
    
    // Connect to the database
    PGconn *conn = connect_to_db();
    if (conn == NULL) {
        fprintf(stderr, "Failed to connect to database\n");
        return STAT_ERROR_DB;
    }
    
    // Command: game-set-status
    if (strcmp(command, "game-set-status") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Usage: %s game-set-status <game_set_id> [json|text]\n", argv[0]);
            PQfinish(conn);
            return 1;
        }
        
        // Get game_set_id
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        // Get output format (default is text)
        const char *format = "text";
        if (argc >= 4) {
            format = argv[3];
            if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'json' or 'text')\n", format);
                PQfinish(conn);
                return STAT_ERROR_INVALID_FORMAT;
            }
        }
        
        get_game_set_status(conn, game_set_id, format);
    } else {
        fprintf(stderr, "Unknown command: %s\n", command);
        PQfinish(conn);
        return 1;
    }
    
    // Disconnect from the database
    PQfinish(conn);
    return STAT_SUCCESS;
}