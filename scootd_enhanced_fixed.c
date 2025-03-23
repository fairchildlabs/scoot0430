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
int end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote);
bool team_compare(PGconn *conn, int team1_game_id, int team2_game_id, int team1_team_number, int team2_team_number);
PGconn *connect_to_db(void);

/* Function to check if a player is an OG based on birth year */
bool is_og_player(int birth_year) {
    /* Players born in 1980 or earlier are considered OGs */
    return birth_year > 0 && birth_year <= 1980;
}

/* Function to compare if two teams are identical */
bool team_compare(PGconn *conn, int team1_game_id, int team2_game_id, int team1_team_number, int team2_team_number) {
    /* Get players from team 1 */
    const char *team1_query = 
        "SELECT gp.user_id "
        "FROM game_players gp "
        "WHERE gp.game_id = $1 AND gp.team = $2 "
        "ORDER BY gp.user_id";
    
    char team1_game_id_str[16];
    sprintf(team1_game_id_str, "%d", team1_game_id);
    
    char team1_team_str[2];
    sprintf(team1_team_str, "%d", team1_team_number);
    
    const char *team1_params[2] = { team1_game_id_str, team1_team_str };
    
    PGresult *team1_result = PQexecParams(conn, team1_query, 2, NULL, team1_params, NULL, NULL, 0);
    
    if (PQresultStatus(team1_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Team 1 query failed: %s\n", PQerrorMessage(conn));
        PQclear(team1_result);
        return false;
    }
    
    /* Get players from team 2 */
    const char *team2_query = 
        "SELECT gp.user_id "
        "FROM game_players gp "
        "WHERE gp.game_id = $1 AND gp.team = $2 "
        "ORDER BY gp.user_id";
    
    char team2_game_id_str[16];
    sprintf(team2_game_id_str, "%d", team2_game_id);
    
    char team2_team_str[2];
    sprintf(team2_team_str, "%d", team2_team_number);
    
    const char *team2_params[2] = { team2_game_id_str, team2_team_str };
    
    PGresult *team2_result = PQexecParams(conn, team2_query, 2, NULL, team2_params, NULL, NULL, 0);
    
    if (PQresultStatus(team2_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Team 2 query failed: %s\n", PQerrorMessage(conn));
        PQclear(team1_result);
        PQclear(team2_result);
        return false;
    }
    
    /* Compare team sizes */
    int team1_rows = PQntuples(team1_result);
    int team2_rows = PQntuples(team2_result);
    
    if (team1_rows != team2_rows) {
        PQclear(team1_result);
        PQclear(team2_result);
        return false;
    }
    
    /* Compare player IDs */
    for (int i = 0; i < team1_rows; i++) {
        int player1_id = atoi(PQgetvalue(team1_result, i, 0));
        int player2_id = atoi(PQgetvalue(team2_result, i, 0));
        
        if (player1_id != player2_id) {
            PQclear(team1_result);
            PQclear(team2_result);
            return false;
        }
    }
    
    /* If we reach here, teams are identical */
    PQclear(team1_result);
    PQclear(team2_result);
    return true;
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
                    /* Not used: int queue_position = atoi(PQgetvalue(players_result, j, 2)); */
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
            /* Not used: const char *type = PQgetvalue(next_up_result, i, 3); */
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(next_up_result, i, 5)) {
                int birth_year = atoi(PQgetvalue(next_up_result, i, 5));
                is_og = is_og_player(birth_year);
            }
            
            printf("    {\n");
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"position\": %d,\n", queue_position);
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
                    /* Not used: int queue_position = atoi(PQgetvalue(players_result, j, 2)); */
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
    }
    // TEXT FORMAT
    else {
        printf("Game Set #%d - %s (%s)\n", game_set_id, game_set_name, game_set_state);
        printf("Created: %s\n", create_date);
        
        if (first_game_time) {
            printf("Start Time: %s\n", first_game_time);
        }
        
        if (last_game_time) {
            printf("End Time: %s\n", last_game_time);
        }
        
        printf("Current Queue Position: %d\n", current_queue_position);
        printf("Players Per Team: %d\n", players_per_team);
        printf("Unique Players: %d\n", unique_players);
        printf("Total Games: %d\n\n", total_games);
        
        // Active games
        if (active_games_count > 0) {
            printf("=== ACTIVE GAMES ===\n");
            for (int i = 0; i < active_games_count; i++) {
                int game_id = atoi(PQgetvalue(active_games_result, i, 0));
                const char *court = PQgetvalue(active_games_result, i, 1);
                int team1_score = atoi(PQgetvalue(active_games_result, i, 4));
                int team2_score = atoi(PQgetvalue(active_games_result, i, 5));
                
                printf("Game #%d (Court %s): Team 1 [%d] vs Team 2 [%d]\n", 
                      game_id, court, team1_score, team2_score);
                
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
                    printf("  No players found\n\n");
                } else {
                    int player_count = PQntuples(players_result);
                    
                    if (player_count > 0) {
                        printf("  Team 1 (HOME):\n");
                        for (int j = 0; j < player_count; j++) {
                            int team = atoi(PQgetvalue(players_result, j, 0));
                            if (team != 1) continue;
                            
                            int relative_position = atoi(PQgetvalue(players_result, j, 1));
                            /* Not used: int queue_position = atoi(PQgetvalue(players_result, j, 2)); */
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
                        
                        printf("  Team 2 (AWAY):\n");
                        for (int j = 0; j < player_count; j++) {
                            int team = atoi(PQgetvalue(players_result, j, 0));
                            if (team != 2) continue;
                            
                            int relative_position = atoi(PQgetvalue(players_result, j, 1));
                            /* Not used: int queue_position = atoi(PQgetvalue(players_result, j, 2)); */
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
                }
                
                PQclear(players_result);
                printf("\n");
            }
        }
        
        // Next up players
        if (next_up_count > 0) {
            printf("=== NEXT UP ===\n");
            
            // Calculate home team (first half of next up players)
            int home_team_count = next_up_count / 2;
            if (home_team_count > 0) {
                printf("HOME TEAM (Team 1):\n");
                printf("Position | Username             | User ID    | Type            | OG   \n");
                printf("------------------------------------------\n");
                
                for (int i = 0; i < home_team_count; i++) {
                    int queue_position = atoi(PQgetvalue(next_up_result, i, 0));
                    const char *username = PQgetvalue(next_up_result, i, 1);
                    int user_id = atoi(PQgetvalue(next_up_result, i, 2));
                    const char *type = PQgetvalue(next_up_result, i, 3);
                    
                    // Check if player is OG
                    const char *og_status = "No";
                    if (!PQgetisnull(next_up_result, i, 5)) {
                        int birth_year = atoi(PQgetvalue(next_up_result, i, 5));
                        if (is_og_player(birth_year)) {
                            og_status = "Yes";
                        }
                    }
                    
                    printf("%-8d | %-20s | %-10d | %-15s | %-5s\n", 
                           queue_position, 
                           username, 
                           user_id,
                           type,
                           og_status);
                }
                printf("\n");
            }
            
            // Calculate away team (second half of next up players)
            if (next_up_count > home_team_count) {
                printf("AWAY TEAM (Team 2):\n");
                printf("Position | Username             | User ID    | Type            | OG   \n");
                printf("------------------------------------------\n");
                
                for (int i = home_team_count; i < next_up_count; i++) {
                    int queue_position = atoi(PQgetvalue(next_up_result, i, 0));
                    const char *username = PQgetvalue(next_up_result, i, 1);
                    int user_id = atoi(PQgetvalue(next_up_result, i, 2));
                    const char *type = PQgetvalue(next_up_result, i, 3);
                    
                    // Check if player is OG
                    const char *og_status = "No";
                    if (!PQgetisnull(next_up_result, i, 5)) {
                        int birth_year = atoi(PQgetvalue(next_up_result, i, 5));
                        if (is_og_player(birth_year)) {
                            og_status = "Yes";
                        }
                    }
                    
                    printf("%-8d | %-20s | %-10d | %-15s | %-5s\n", 
                           queue_position, 
                           username, 
                           user_id,
                           type,
                           og_status);
                }
            }
            printf("\n");
        }
        
        // Completed games
        if (completed_games_count > 0) {
            printf("=== COMPLETED GAMES ===\n");
            for (int i = 0; i < completed_games_count; i++) {
                int game_id = atoi(PQgetvalue(completed_games_result, i, 0));
                const char *court = PQgetvalue(completed_games_result, i, 1);
                int team1_score = atoi(PQgetvalue(completed_games_result, i, 2));
                int team2_score = atoi(PQgetvalue(completed_games_result, i, 3));
                const char *start_time = PQgetvalue(completed_games_result, i, 4);
                const char *end_time = PQgetvalue(completed_games_result, i, 5);
                
                printf("Game #%d (Court %s): Team 1 [%d] vs Team 2 [%d]\n", 
                      game_id, court, team1_score, team2_score);
                printf("Started: %s, Ended: %s\n", start_time, end_time);
                
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
                    printf("  No players found\n\n");
                } else {
                    int player_count = PQntuples(players_result);
                    
                    if (player_count > 0) {
                        printf("  HOME TEAM (Team 1)%s:\n", team1_score > team2_score ? " [WINNER]" : "");
                        printf("  Position | Username             | User ID    | Type            | OG   \n");
                        printf("  ------------------------------------------\n");
                        
                        for (int j = 0; j < player_count; j++) {
                            int team = atoi(PQgetvalue(players_result, j, 0));
                            if (team != 1) continue;
                            
                            int relative_position = atoi(PQgetvalue(players_result, j, 1));
                            int queue_position = atoi(PQgetvalue(players_result, j, 2));
                            const char *username = PQgetvalue(players_result, j, 3);
                            int user_id = atoi(PQgetvalue(players_result, j, 4));
                            
                            // Check if player is OG
                            const char *og_status = "No";
                            if (!PQgetisnull(players_result, j, 5)) {
                                int birth_year = atoi(PQgetvalue(players_result, j, 5));
                                if (is_og_player(birth_year)) {
                                    og_status = "Yes";
                                }
                            }
                            
                            printf("  %-8d | %-20s | %-10d | %-15s | %-5s\n", 
                                   queue_position, 
                                   username, 
                                   user_id,
                                   team1_score > team2_score ? "win_promoted" : "loss_promoted",
                                   og_status);
                        }
                        printf("\n");
                        
                        printf("  AWAY TEAM (Team 2)%s:\n", team2_score > team1_score ? " [WINNER]" : "");
                        printf("  Position | Username             | User ID    | Type            | OG   \n");
                        printf("  ------------------------------------------\n");
                        
                        for (int j = 0; j < player_count; j++) {
                            int team = atoi(PQgetvalue(players_result, j, 0));
                            if (team != 2) continue;
                            
                            int relative_position = atoi(PQgetvalue(players_result, j, 1));
                            int queue_position = atoi(PQgetvalue(players_result, j, 2));
                            const char *username = PQgetvalue(players_result, j, 3);
                            int user_id = atoi(PQgetvalue(players_result, j, 4));
                            
                            // Check if player is OG
                            const char *og_status = "No";
                            if (!PQgetisnull(players_result, j, 5)) {
                                int birth_year = atoi(PQgetvalue(players_result, j, 5));
                                if (is_og_player(birth_year)) {
                                    og_status = "Yes";
                                }
                            }
                            
                            printf("  %-8d | %-20s | %-10d | %-15s | %-5s\n", 
                                   queue_position, 
                                   username, 
                                   user_id,
                                   team2_score > team1_score ? "win_promoted" : "loss_promoted",
                                   og_status);
                        }
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
        fprintf(stderr, "  end-game <game_id> <home_score> <away_score> [autopromote]\n");
        fprintf(stderr, "    End a game with the given scores and optionally auto-promote players (true/false, default is true).\n");
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
    } 
    // Command: end-game
    else if (strcmp(command, "end-game") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s end-game <game_id> <home_score> <away_score> [autopromote]\n", argv[0]);
            fprintf(stderr, "  autopromote: true or false (default is true)\n");
            PQfinish(conn);
            return 1;
        }
        
        // Get game_id
        int game_id = atoi(argv[2]);
        if (game_id <= 0) {
            fprintf(stderr, "Invalid game_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        // Get scores
        int home_score = atoi(argv[3]);
        int away_score = atoi(argv[4]);
        
        if (home_score < 0 || away_score < 0) {
            fprintf(stderr, "Invalid scores: %d-%d\n", home_score, away_score);
            PQfinish(conn);
            return 1;
        }
        
        // Get autopromote parameter (default is true)
        bool autopromote = true;
        if (argc >= 6) {
            if (strcmp(argv[5], "false") == 0) {
                autopromote = false;
            } else if (strcmp(argv[5], "true") != 0) {
                fprintf(stderr, "Invalid autopromote value: %s (should be 'true' or 'false')\n", argv[5]);
                PQfinish(conn);
                return 1;
            }
        }
        
        int result = end_game(conn, game_id, home_score, away_score, autopromote);
        if (result == 0) {
            PQfinish(conn);
            return 1;
        }
    } else {
        fprintf(stderr, "Unknown command: %s\n", command);
        PQfinish(conn);
        return 1;
    }
    
    // Disconnect from the database
    PQfinish(conn);
    return STAT_SUCCESS;
}

/* End a game and handle player promotions */
int end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote) {
    /* First check if the game exists and is in 'started' state */
    const char *game_query = 
        "SELECT id, state FROM games WHERE id = $1";
    
    char game_id_str[16];
    sprintf(game_id_str, "%d", game_id);
    const char *game_params[1] = { game_id_str };
    
    PGresult *game_result = PQexecParams(conn, game_query, 1, NULL, game_params, NULL, NULL, 0);
    
    if (PQresultStatus(game_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game query failed: %s\n", PQerrorMessage(conn));
        PQclear(game_result);
        return 0;
    }
    
    int game_rows = PQntuples(game_result);
    if (game_rows == 0) {
        printf("No game found with ID %d\n", game_id);
        PQclear(game_result);
        return 0;
    }
    
    const char *state = PQgetvalue(game_result, 0, 1);
    if (strcmp(state, "started") != 0) {
        printf("Game #%d is not in 'started' state (current state: %s)\n", game_id, state);
        if (strcmp(state, "final") == 0) {
            printf("Game is already finalized. Use the 'promote' command to move players to the queue.\n");
        }
        PQclear(game_result);
        return 0;
    }
    
    /* Update the game with scores and set it to final */
    const char *update_query = 
        "UPDATE games SET "
        "team1_score = $1, "
        "team2_score = $2, "
        "end_time = NOW(), "
        "state = 'final' "
        "WHERE id = $3 "
        "RETURNING id";
    
    char team1_str[16];
    char team2_str[16];
    
    sprintf(team1_str, "%d", home_score);
    sprintf(team2_str, "%d", away_score);
    
    const char *update_params[3] = { team1_str, team2_str, game_id_str };
    
    PGresult *update_result = PQexecParams(conn, update_query, 3, NULL, update_params, NULL, NULL, 0);
    
    if (PQresultStatus(update_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to update game: %s\n", PQerrorMessage(conn));
        PQclear(game_result);
        PQclear(update_result);
        return 0;
    }
    
    int updated_id = atoi(PQgetvalue(update_result, 0, 0));
    
    printf("Successfully finalized game #%d with score %d-%d\n", 
           updated_id, home_score, away_score);
    
    /* Print the game result */
    printf("Game result: %s\n", 
           (home_score == away_score) ? "Tie game" : 
           (home_score > away_score) ? "Home team wins" : "Away team wins");
    
    /* If autopromote is true, handle automatic promotion */
    if (autopromote && home_score != away_score) {
        /* Get the set_id of this game */
        const char *set_query = "SELECT set_id FROM games WHERE id = $1";
        PGresult *set_result = PQexecParams(conn, set_query, 1, NULL, game_params, NULL, NULL, 0);
        
        if (PQresultStatus(set_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Set ID query failed: %s\n", PQerrorMessage(conn));
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            return updated_id;
        }
        
        int set_id = atoi(PQgetvalue(set_result, 0, 0));
        
        /* Get the max_consecutive_games and players_per_team from game_sets */
        const char *set_config_query = 
            "SELECT max_consecutive_games, players_per_team, current_queue_position, queue_next_up "
            "FROM game_sets WHERE id = $1";
        
        char set_id_str[16];
        sprintf(set_id_str, "%d", set_id);
        const char *set_config_params[1] = { set_id_str };
        
        PGresult *set_config_result = PQexecParams(conn, set_config_query, 1, NULL, set_config_params, NULL, NULL, 0);
        
        if (PQresultStatus(set_config_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Set config query failed: %s\n", PQerrorMessage(conn));
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            return updated_id;
        }
        
        int max_consecutive_games = atoi(PQgetvalue(set_config_result, 0, 0));
        /* Not used: int players_per_team = atoi(PQgetvalue(set_config_result, 0, 1)); */
        /* Not used: int current_queue_position = atoi(PQgetvalue(set_config_result, 0, 2)); */
        int queue_next_up = atoi(PQgetvalue(set_config_result, 0, 3));
        
        /* Determine winning team */
        int winning_team = (home_score > away_score) ? 1 : 2;
        
        /* Start a transaction */
        PGresult *begin_result = PQexec(conn, "BEGIN");
        if (PQresultStatus(begin_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "BEGIN command failed: %s\n", PQerrorMessage(conn));
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(begin_result);
            return updated_id;
        }
        PQclear(begin_result);
        
        /* Deactivate all player checkins for the current game */
        const char *deactivate_query = 
            "UPDATE checkins "
            "SET is_active = false "
            "WHERE game_id = $1 "
            "RETURNING user_id";
        
        PGresult *deactivate_result = PQexecParams(conn, deactivate_query, 1, NULL, game_params, NULL, NULL, 0);
        
        if (PQresultStatus(deactivate_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Deactivate checkins failed: %s\n", PQerrorMessage(conn));
            PQexec(conn, "ROLLBACK");
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(deactivate_result);
            return updated_id;
        }
        
        /* Count the number of consecutive wins for the winning team */
        /* Get the previous games to check for consecutive wins */
        const char *prev_games_query = 
            "SELECT id, team1_score, team2_score "
            "FROM games "
            "WHERE set_id = $1 AND state = 'final' AND id < $2 "
            "ORDER BY id DESC "
            "LIMIT $3";
        
        char max_consecutive_str[16];
        sprintf(max_consecutive_str, "%d", max_consecutive_games);
        
        const char *prev_games_params[3] = { set_id_str, game_id_str, max_consecutive_str };
        
        PGresult *prev_games_result = PQexecParams(conn, prev_games_query, 3, NULL, prev_games_params, NULL, NULL, 0);
        
        if (PQresultStatus(prev_games_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Previous games query failed: %s\n", PQerrorMessage(conn));
            PQexec(conn, "ROLLBACK");
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(deactivate_result);
            PQclear(prev_games_result);
            return updated_id;
        }
        
        /* Check if the winning team is the same as in previous games */
        int consecutive_wins = 1; // Start with 1 for current game
        bool promote_losing_team = false;
        
        for (int i = 0; i < PQntuples(prev_games_result); i++) {
            int prev_game_id = atoi(PQgetvalue(prev_games_result, i, 0));
            int prev_team1_score = atoi(PQgetvalue(prev_games_result, i, 1));
            int prev_team2_score = atoi(PQgetvalue(prev_games_result, i, 2));
            
            /* Skip ties */
            if (prev_team1_score == prev_team2_score) {
                continue;
            }
            
            int prev_winning_team = (prev_team1_score > prev_team2_score) ? 1 : 2;
            
            /* Check if same team won based on player composition */
            bool same_winning_team = team_compare(
                conn, 
                game_id, prev_game_id, 
                winning_team, prev_winning_team
            );
            
            if (same_winning_team) {
                consecutive_wins++;
                if (consecutive_wins >= max_consecutive_games) {
                    promote_losing_team = true;
                    break;
                }
            } else {
                break;
            }
        }
        
        /* Determine which team to promote */
        int team_to_promote = promote_losing_team ? (winning_team == 1 ? 2 : 1) : winning_team;
        
        printf("Team %d will be promoted to next up (consecutive wins: %d/%d)\n", 
               team_to_promote, consecutive_wins, max_consecutive_games);
        
        if (promote_losing_team) {
            printf("Note: Winners have reached max consecutive games (%d), so losers will play next\n", 
                   max_consecutive_games);
        }
        
        /* Get the players from the team being promoted */
        const char *team_query = 
            "SELECT gp.user_id, u.username, c.id as checkin_id "
            "FROM game_players gp "
            "JOIN users u ON gp.user_id = u.id "
            "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = $1 "
            "WHERE gp.game_id = $1 AND gp.team = $2 "
            "ORDER BY gp.relative_position";
        
        char team_to_promote_str[2];
        sprintf(team_to_promote_str, "%d", team_to_promote);
        
        const char *team_params[2] = { game_id_str, team_to_promote_str };
        
        PGresult *team_result = PQexecParams(conn, team_query, 2, NULL, team_params, NULL, NULL, 0);
        
        if (PQresultStatus(team_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Team query failed: %s\n", PQerrorMessage(conn));
            PQexec(conn, "ROLLBACK");
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(deactivate_result);
            PQclear(prev_games_result);
            PQclear(team_result);
            return updated_id;
        }
        
        int team_player_count = PQntuples(team_result);
        printf("Found %d players on team %d to promote\n", team_player_count, team_to_promote);
        
        /* Get the next queue positions */
        int queue_positions[team_player_count];
        for (int i = 0; i < team_player_count; i++) {
            queue_positions[i] = queue_next_up + i;
        }
        
        /* Create new checkins for the promoted team starting at queue_next_up */
        for (int i = 0; i < team_player_count; i++) {
            int user_id = atoi(PQgetvalue(team_result, i, 0));
            const char *username = PQgetvalue(team_result, i, 1);
            
            /* Create a new checkin for this user */
            const char *checkin_query = 
                "INSERT INTO checkins "
                "(user_id, check_in_time, check_in_date, is_active, game_set_id, club_index, queue_position, type) "
                "VALUES "
                "($1, NOW(), current_date, true, $2, "
                "(SELECT club_index FROM games WHERE id = $3), $4, 'promoted') "
                "RETURNING id";
            
            char user_id_str[16];
            sprintf(user_id_str, "%d", user_id);
            
            char queue_pos_str[16];
            sprintf(queue_pos_str, "%d", queue_positions[i]);
            
            const char *checkin_params[4] = { user_id_str, set_id_str, game_id_str, queue_pos_str };
            
            PGresult *checkin_result = PQexecParams(conn, checkin_query, 4, NULL, checkin_params, NULL, NULL, 0);
            
            if (PQresultStatus(checkin_result) != PGRES_TUPLES_OK) {
                fprintf(stderr, "Failed to create checkin for user %s: %s\n", 
                        username, PQerrorMessage(conn));
                PQexec(conn, "ROLLBACK");
                PQclear(game_result);
                PQclear(update_result);
                PQclear(set_result);
                PQclear(set_config_result);
                PQclear(deactivate_result);
                PQclear(prev_games_result);
                PQclear(team_result);
                PQclear(checkin_result);
                return updated_id;
            }
            
            printf("Promoted %s to position %d\n", username, queue_positions[i]);
            PQclear(checkin_result);
        }
        
        /* Update the game_sets.queue_next_up value */
        const char *update_queue_query = 
            "UPDATE game_sets "
            "SET queue_next_up = $1 "
            "WHERE id = $2";
        
        char new_queue_next_up_str[16];
        sprintf(new_queue_next_up_str, "%d", queue_next_up + team_player_count);
        
        const char *update_queue_params[2] = { new_queue_next_up_str, set_id_str };
        
        PGresult *update_queue_result = PQexecParams(conn, update_queue_query, 2, NULL, update_queue_params, NULL, NULL, 0);
        
        if (PQresultStatus(update_queue_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "Failed to update queue_next_up: %s\n", PQerrorMessage(conn));
            PQexec(conn, "ROLLBACK");
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(deactivate_result);
            PQclear(prev_games_result);
            PQclear(team_result);
            PQclear(update_queue_result);
            return updated_id;
        }
        PQclear(update_queue_result);
        
        /* Commit the transaction */
        PGresult *commit_result = PQexec(conn, "COMMIT");
        if (PQresultStatus(commit_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT command failed: %s\n", PQerrorMessage(conn));
            PQexec(conn, "ROLLBACK");
            PQclear(game_result);
            PQclear(update_result);
            PQclear(set_result);
            PQclear(set_config_result);
            PQclear(deactivate_result);
            PQclear(prev_games_result);
            PQclear(team_result);
            PQclear(commit_result);
            return updated_id;
        }
        PQclear(commit_result);
        
        printf("Successfully promoted team %d players to next up positions %d-%d\n", 
               team_to_promote, queue_next_up, queue_next_up + team_player_count - 1);
        
        PQclear(prev_games_result);
        PQclear(team_result);
        PQclear(deactivate_result);
        PQclear(set_config_result);
        PQclear(set_result);
    } else if (!autopromote) {
        printf("Automatic promotion disabled. Players will need to be manually promoted.\n");
    } else {
        printf("No automatic promotion for tie games.\n");
    }
    
    PQclear(game_result);
    PQclear(update_result);
    return updated_id;
}
