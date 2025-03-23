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

/* Database constants */
#define PLAYERS_PER_TEAM 4
#define OG_BIRTH_YEAR 1980

/* Function prototypes - from original scootd */
PGconn *connect_to_db();
void list_users(PGconn *conn);
void list_active_checkins(PGconn *conn);
void list_active_games(PGconn *conn);
void show_active_game_set(PGconn *conn);
void checkout_players(PGconn *conn, int argc, char *argv[]);
void show_player_info(PGconn *conn, const char *username, const char *format);
void promote_players(PGconn *conn, int game_id, bool promote_winners);
void list_next_up_players(PGconn *conn, int game_set_id, const char *format);
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format);
void finalize_game(PGconn *conn, int game_id, int team1_score, int team2_score);
void run_sql_query(PGconn *conn, const char *query);

/* Function prototypes - from enhanced scootd */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format);
void end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote);
bool team_compare(PGconn *conn, int game_id1, int game_id2);

/**
 * Connect to the PostgreSQL database using environment variables
 */
PGconn *connect_to_db() {
    char conn_info[MAX_CONN_INFO_LEN] = {0};
    
    // Using environment variables for connection
    const char *db_host = getenv("PGHOST");
    const char *db_port = getenv("PGPORT");
    const char *db_name = getenv("PGDATABASE");
    const char *db_user = getenv("PGUSER");
    const char *db_password = getenv("PGPASSWORD");
    
    // Build connection string
    snprintf(conn_info, sizeof(conn_info),
             "host=%s port=%s dbname=%s user=%s password=%s",
             db_host ? db_host : "localhost",
             db_port ? db_port : "5432",
             db_name ? db_name : "postgres",
             db_user ? db_user : "postgres",
             db_password ? db_password : "");
    
    // Connect to database
    PGconn *conn = PQconnectdb(conn_info);
    
    // Check connection status
    if (PQstatus(conn) != CONNECTION_OK) {
        fprintf(stderr, "Connection to database failed: %s", PQerrorMessage(conn));
        PQfinish(conn);
        return NULL;
    }
    
    printf("Successfully connected to the database\n");
    return conn;
}

/**
 * List all users in the database
 */
void list_users(PGconn *conn) {
    const char *query = "SELECT id, username, autoup FROM users ORDER BY username";
    PGresult *res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "SELECT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int rows = PQntuples(res);
    printf("=== Users (%d) ===\n", rows);
    printf("ID | Username | AutoUp\n");
    printf("----------------------\n");
    
    for (int i = 0; i < rows; i++) {
        printf("%s | %s | %s\n", 
               PQgetvalue(res, i, 0), 
               PQgetvalue(res, i, 1),
               strcmp(PQgetvalue(res, i, 2), "t") == 0 ? "Yes" : "No");
    }
    
    PQclear(res);
}

/**
 * List active check-ins with usernames
 */
void list_active_checkins(PGconn *conn) {
    const char *query = 
        "SELECT c.id, c.user_id, u.username, c.club_index, c.queue_position, c.type AS checkin_type "
        "FROM checkins c "
        "JOIN users u ON c.user_id = u.id "
        "WHERE c.is_active = true "
        "ORDER BY c.queue_position";
    
    PGresult *res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "SELECT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int rows = PQntuples(res);
    printf("=== Active Check-ins (%d) ===\n", rows);
    printf("ID | User ID | Username | Club | Position | Type\n");
    printf("-----------------------------------------\n");
    
    for (int i = 0; i < rows; i++) {
        printf("%s | %s | %s | %s | %s | %s\n", 
               PQgetvalue(res, i, 0), 
               PQgetvalue(res, i, 1),
               PQgetvalue(res, i, 2),
               PQgetvalue(res, i, 3),
               PQgetvalue(res, i, 4),
               PQgetvalue(res, i, 5));
    }
    
    PQclear(res);
}

/**
 * List active games
 */
void list_active_games(PGconn *conn) {
    const char *query = 
        "SELECT g.id, g.set_id, g.court, g.team1_score, g.team2_score, g.state, "
        "COUNT(gp.id) as player_count "
        "FROM games g "
        "LEFT JOIN game_players gp ON g.id = gp.game_id "
        "WHERE g.state = 'active' "
        "GROUP BY g.id "
        "ORDER BY g.id";
    
    PGresult *res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "SELECT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int rows = PQntuples(res);
    printf("=== Active Games (%d) ===\n", rows);
    printf("ID | Set ID | Court | Team 1 | Team 2 | State | Players\n");
    printf("-----------------------------------------------------\n");
    
    for (int i = 0; i < rows; i++) {
        printf("%s | %s | %s | %s | %s | %s | %s\n", 
               PQgetvalue(res, i, 0), 
               PQgetvalue(res, i, 1),
               PQgetvalue(res, i, 2),
               PQgetvalue(res, i, 3),
               PQgetvalue(res, i, 4),
               PQgetvalue(res, i, 5),
               PQgetvalue(res, i, 6));
    }
    
    PQclear(res);
}

/**
 * Show active game set details
 */
void show_active_game_set(PGconn *conn) {
    const char *query = 
        "SELECT id, created_by_id, club_index, court_count, max_consecutive_games, "
        "current_queue_position, queue_next_up, created_at "
        "FROM game_sets "
        "WHERE is_active = true";
    
    PGresult *res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "SELECT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int rows = PQntuples(res);
    if (rows == 0) {
        printf("No active game set found.\n");
        PQclear(res);
        return;
    }
    
    printf("=== Active Game Set ===\n");
    printf("ID: %s\n", PQgetvalue(res, 0, 0));
    printf("Created by: %s\n", PQgetvalue(res, 0, 1));
    printf("Club index: %s\n", PQgetvalue(res, 0, 2));
    printf("Court count: %s\n", PQgetvalue(res, 0, 3));
    printf("Max consecutive games: %s\n", PQgetvalue(res, 0, 4));
    printf("Current queue position: %s\n", PQgetvalue(res, 0, 5));
    printf("Queue next up: %s\n", PQgetvalue(res, 0, 6));
    printf("Created at: %s\n", PQgetvalue(res, 0, 7));
    
    PQclear(res);
}

/**
 * Check out player(s) at specified queue position(s)
 */
void checkout_players(PGconn *conn, int argc, char *argv[]) {
    // Start a transaction
    PGresult *res = PQexec(conn, "BEGIN");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    // Process each position
    int success_count = 0;
    for (int i = 3; i < argc; i++) {
        int position = atoi(argv[i]);
        if (position <= 0) {
            fprintf(stderr, "Invalid position: %s\n", argv[i]);
            continue;
        }
        
        // Prepare query with parameter
        const char *params[1];
        char pos_str[12];
        snprintf(pos_str, sizeof(pos_str), "%d", position);
        params[0] = pos_str;
        
        // Execute the query
        res = PQexecParams(conn, 
            "UPDATE checkins SET is_active = false "
            "WHERE is_active = true AND queue_position = $1 "
            "RETURNING id, user_id, queue_position", 
            1, NULL, params, NULL, NULL, 0);
        
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "UPDATE failed for position %d: %s", 
                    position, PQerrorMessage(conn));
            PQclear(res);
            continue;
        }
        
        if (PQntuples(res) > 0) {
            printf("Checked out player at position %d (ID: %s, User ID: %s)\n",
                   position,
                   PQgetvalue(res, 0, 0),
                   PQgetvalue(res, 0, 1));
            success_count++;
        } else {
            printf("No active check-in found at position %d\n", position);
        }
        
        PQclear(res);
    }
    
    // Commit the transaction if at least one checkout was successful
    if (success_count > 0) {
        res = PQexec(conn, "COMMIT");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        printf("Successfully checked out %d player(s)\n", success_count);
    } else {
        res = PQexec(conn, "ROLLBACK");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "ROLLBACK command failed: %s", PQerrorMessage(conn));
        }
        printf("No players were checked out\n");
    }
    
    PQclear(res);
}

/**
 * Show detailed information about a player
 */
void show_player_info(PGconn *conn, const char *username, const char *format) {
    // Prepare the query with parameter
    const char *params[1];
    params[0] = username;
    
    PGresult *res = PQexecParams(conn, 
        "SELECT u.id, u.username, u.birth_year, u.autoup, "
        "EXTRACT(YEAR FROM AGE(NOW(), MAKE_DATE(u.birth_year, 1, 1))) AS age, "
        "COUNT(gp.id) AS games_played, "
        "(SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id AND c.is_active = true) AS active_checkins "
        "FROM users u "
        "LEFT JOIN game_players gp ON u.id = gp.user_id "
        "WHERE u.username = $1 "
        "GROUP BY u.id", 
        1, NULL, params, NULL, NULL, 0);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "SELECT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    if (PQntuples(res) == 0) {
        printf("Player '%s' not found\n", username);
        PQclear(res);
        return;
    }
    
    // Extract data
    int user_id = atoi(PQgetvalue(res, 0, 0));
    int birth_year = PQgetvalue(res, 0, 2)[0] != '\0' ? atoi(PQgetvalue(res, 0, 2)) : 0;
    int age = PQgetvalue(res, 0, 4)[0] != '\0' ? atoi(PQgetvalue(res, 0, 4)) : 0;
    int games_played = atoi(PQgetvalue(res, 0, 5));
    int active_checkins = atoi(PQgetvalue(res, 0, 6));
    bool autoup = strcmp(PQgetvalue(res, 0, 3), "t") == 0;
    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
    
    // Format: json or text
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"id\": %d,\n", user_id);
        printf("  \"username\": \"%s\",\n", username);
        if (birth_year > 0) {
            printf("  \"birth_year\": %d,\n", birth_year);
            printf("  \"age\": %d,\n", age);
        } else {
            printf("  \"birth_year\": null,\n");
            printf("  \"age\": null,\n");
        }
        printf("  \"autoup\": %s,\n", autoup ? "true" : "false");
        printf("  \"is_og\": %s,\n", is_og ? "true" : "false");
        printf("  \"games_played\": %d,\n", games_played);
        printf("  \"active_checkins\": %d\n", active_checkins);
        printf("}\n");
    } else {
        printf("=== Player Information: %s ===\n", username);
        printf("ID: %d\n", user_id);
        printf("Username: %s\n", username);
        if (birth_year > 0) {
            printf("Birth Year: %d (Age: %d)\n", birth_year, age);
        } else {
            printf("Birth Year: Not set\n");
        }
        printf("Auto Up: %s\n", autoup ? "Yes" : "No");
        printf("OG Status: %s\n", is_og ? "OG" : "Regular");
        printf("Games Played: %d\n", games_played);
        printf("Active Check-ins: %d\n", active_checkins);
        
        // Get recent games if available
        if (games_played > 0) {
            const char *recent_params[1];
            char id_str[12];
            snprintf(id_str, sizeof(id_str), "%d", user_id);
            recent_params[0] = id_str;
            
            PGresult *recent_res = PQexecParams(conn, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.state, gp.team, "
                "g.created_at, g.updated_at "
                "FROM games g "
                "JOIN game_players gp ON g.id = gp.game_id "
                "WHERE gp.user_id = $1 "
                "ORDER BY g.created_at DESC "
                "LIMIT 5", 
                1, NULL, recent_params, NULL, NULL, 0);
            
            if (PQresultStatus(recent_res) == PGRES_TUPLES_OK && PQntuples(recent_res) > 0) {
                printf("\n=== Recent Games ===\n");
                printf("Game ID | Court | Team | Score | Result | Date\n");
                printf("-------------------------------------------\n");
                
                for (int i = 0; i < PQntuples(recent_res); i++) {
                    int game_id = atoi(PQgetvalue(recent_res, i, 0));
                    const char *court = PQgetvalue(recent_res, i, 1);
                    int team1_score = atoi(PQgetvalue(recent_res, i, 2));
                    int team2_score = atoi(PQgetvalue(recent_res, i, 3));
                    const char *state = PQgetvalue(recent_res, i, 4);
                    int team = atoi(PQgetvalue(recent_res, i, 5));
                    const char *created_at = PQgetvalue(recent_res, i, 6);
                    
                    const char *result = "N/A";
                    if (strcmp(state, "completed") == 0) {
                        if (team == 1) {
                            result = team1_score > team2_score ? "Win" : "Loss";
                        } else {
                            result = team2_score > team1_score ? "Win" : "Loss";
                        }
                    }
                    
                    printf("%d | %s | %d | %d-%d | %s | %s\n",
                           game_id, court, team, team1_score, team2_score, 
                           result, created_at);
                }
            }
            
            PQclear(recent_res);
        }
    }
    
    PQclear(res);
}

/**
 * Promote winners or losers of the specified game
 */
void promote_players(PGconn *conn, int game_id, bool promote_winners) {
    // Start a transaction
    PGresult *res = PQexec(conn, "BEGIN");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    // Get game info
    char query[256];
    sprintf(query, 
            "SELECT g.id, g.set_id, g.team1_score, g.team2_score, g.state, gs.queue_next_up "
            "FROM games g "
            "JOIN game_sets gs ON g.set_id = gs.id "
            "WHERE g.id = %d",
            game_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game not found or error: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if game is completed
    const char *state = PQgetvalue(res, 0, 4);
    if (strcmp(state, "completed") != 0) {
        fprintf(stderr, "Game is not completed (current state: %s)\n", state);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int set_id = atoi(PQgetvalue(res, 0, 1));
    int team1_score = atoi(PQgetvalue(res, 0, 2));
    int team2_score = atoi(PQgetvalue(res, 0, 3));
    int queue_next_up = atoi(PQgetvalue(res, 0, 5));
    
    // Determine winning team
    int winning_team = team1_score > team2_score ? 1 : 2;
    int team_to_promote = promote_winners ? winning_team : (winning_team == 1 ? 2 : 1);
    
    PQclear(res);
    
    // Get players to promote
    sprintf(query, 
            "SELECT gp.user_id, u.username, u.autoup "
            "FROM game_players gp "
            "JOIN users u ON gp.user_id = u.id "
            "WHERE gp.game_id = %d AND gp.team = %d",
            game_id, team_to_promote);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting players: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int player_count = PQntuples(res);
    if (player_count == 0) {
        fprintf(stderr, "No players found in team %d\n", team_to_promote);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Promoting %s of game %d (Team %d):\n", 
           promote_winners ? "winners" : "losers", 
           game_id, team_to_promote);
    
    // Process each player
    int promoted_count = 0;
    for (int i = 0; i < player_count; i++) {
        int user_id = atoi(PQgetvalue(res, i, 0));
        const char *username = PQgetvalue(res, i, 1);
        
        // Check if player already has an active check-in
        sprintf(query, 
                "SELECT id FROM checkins "
                "WHERE user_id = %d AND is_active = true",
                user_id);
        
        PGresult *check_res = PQexec(conn, query);
        if (PQresultStatus(check_res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error checking existing check-ins: %s", PQerrorMessage(conn));
            PQclear(check_res);
            continue;
        }
        
        if (PQntuples(check_res) > 0) {
            printf("- %s already has an active check-in\n", username);
            PQclear(check_res);
            continue;
        }
        
        PQclear(check_res);
        
        // Insert new check-in
        sprintf(query, 
                "INSERT INTO checkins (user_id, club_index, queue_position, is_active, type) "
                "VALUES (%d, (SELECT club_index FROM game_sets WHERE id = %d), %d, true, 'promoted') "
                "RETURNING id",
                user_id, set_id, queue_next_up + i);
        
        PGresult *insert_res = PQexec(conn, query);
        if (PQresultStatus(insert_res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error creating check-in: %s", PQerrorMessage(conn));
            PQclear(insert_res);
            continue;
        }
        
        printf("- %s promoted to position %d\n", username, queue_next_up + i);
        promoted_count++;
        
        PQclear(insert_res);
    }
    
    PQclear(res);
    
    // Update queue_next_up if players were promoted
    if (promoted_count > 0) {
        sprintf(query, 
                "UPDATE game_sets SET queue_next_up = queue_next_up + %d "
                "WHERE id = %d "
                "RETURNING queue_next_up",
                promoted_count, set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error updating queue_next_up: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int new_queue_next_up = atoi(PQgetvalue(res, 0, 0));
        printf("Updated queue_next_up to %d\n", new_queue_next_up);
        
        PQclear(res);
    }
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Successfully promoted %d player(s)\n", promoted_count);
    
    PQclear(res);
}

/**
 * List next-up players for a game set
 */
void list_next_up_players(PGconn *conn, int game_set_id, const char *format) {
    char query[1024];
    PGresult *res;
    
    // If game_set_id is not specified, get the active game set
    if (game_set_id <= 0) {
        res = PQexec(conn, "SELECT id FROM game_sets WHERE is_active = true");
        
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
            fprintf(stderr, "No active game set found\n");
            PQclear(res);
            return;
        }
        
        game_set_id = atoi(PQgetvalue(res, 0, 0));
        PQclear(res);
    }
    
    // Get game set details
    sprintf(query, 
            "SELECT current_queue_position FROM game_sets WHERE id = %d",
            game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
        return;
    }
    
    int current_position = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    
    // Get next-up players
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position, "
            "EXTRACT(YEAR FROM AGE(NOW(), MAKE_DATE(u.birth_year, 1, 1))) AS age, "
            "c.type AS checkin_type "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.is_active = true "
            "AND c.queue_position >= %d "
            "ORDER BY c.queue_position",
            current_position);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting next-up players: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int player_count = PQntuples(res);
    
    // Format: json or text
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"game_set_id\": %d,\n", game_set_id);
        printf("  \"current_position\": %d,\n", current_position);
        printf("  \"player_count\": %d,\n", player_count);
        printf("  \"players\": [\n");
        
        for (int i = 0; i < player_count; i++) {
            int user_id = atoi(PQgetvalue(res, i, 1));
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            const char *age_str = PQgetvalue(res, i, 5);
            const char *checkin_type = PQgetvalue(res, i, 6);
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            int age = age_str[0] != '\0' ? atoi(age_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"username\": \"%s\",\n", username);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
                printf("      \"age\": %d,\n", age);
            } else {
                printf("      \"birth_year\": null,\n");
                printf("      \"age\": null,\n");
            }
            printf("      \"position\": %d,\n", position);
            printf("      \"is_og\": %s,\n", is_og ? "true" : "false");
            printf("      \"checkin_type\": \"%s\"%s\n", 
                   checkin_type, 
                   i < player_count - 1 ? "," : "");
            printf("    }%s\n", i < player_count - 1 ? "," : "");
        }
        
        printf("  ]\n");
        printf("}\n");
    } else {
        printf("=== Next Up Players (Game Set %d) ===\n", game_set_id);
        printf("Current position: %d\n", current_position);
        
        if (player_count == 0) {
            printf("No players in queue\n");
        } else {
            printf("Position | Username | Age | OG | Check-in Type\n");
            printf("------------------------------------------\n");
            
            for (int i = 0; i < player_count; i++) {
                const char *username = PQgetvalue(res, i, 2);
                const char *birth_year_str = PQgetvalue(res, i, 3);
                int position = atoi(PQgetvalue(res, i, 4));
                const char *age_str = PQgetvalue(res, i, 5);
                const char *checkin_type = PQgetvalue(res, i, 6);
                
                int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                int age = age_str[0] != '\0' ? atoi(age_str) : 0;
                bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                
                printf("%d | %s | %s | %s | %s\n",
                       position,
                       username,
                       age > 0 ? PQgetvalue(res, i, 5) : "N/A",
                       is_og ? "Yes" : "No",
                       checkin_type);
            }
        }
    }
    
    PQclear(res);
}

/**
 * Propose a new game without creating it
 */
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format) {
    char query[1024];
    PGresult *res;
    
    // Get game set details
    sprintf(query, 
            "SELECT current_queue_position FROM game_sets WHERE id = %d",
            game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
        return;
    }
    
    int current_position = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    
    // Get next-up players
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.is_active = true "
            "AND c.queue_position >= %d "
            "ORDER BY c.queue_position "
            "LIMIT 8",
            current_position);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting next-up players: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    int player_count = PQntuples(res);
    if (player_count < 8) {
        fprintf(stderr, "Not enough players for a game (need 8, have %d)\n", player_count);
        PQclear(res);
        return;
    }
    
    // Format: json or text
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"game_set_id\": %d,\n", game_set_id);
        printf("  \"court\": \"%s\",\n", court);
        printf("  \"team1\": [\n");
        
        for (int i = 0; i < 4; i++) {
            int user_id = atoi(PQgetvalue(res, i, 1));
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"username\": \"%s\",\n", username);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
            } else {
                printf("      \"birth_year\": null,\n");
            }
            printf("      \"position\": %d,\n", position);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", i < 3 ? "," : "");
        }
        
        printf("  ],\n");
        printf("  \"team2\": [\n");
        
        for (int i = 4; i < 8; i++) {
            int user_id = atoi(PQgetvalue(res, i, 1));
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"username\": \"%s\",\n", username);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
            } else {
                printf("      \"birth_year\": null,\n");
            }
            printf("      \"position\": %d,\n", position);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", i < 7 ? "," : "");
        }
        
        printf("  ]\n");
        printf("}\n");
    } else {
        printf("=== Proposed Game (Game Set %d, Court: %s) ===\n", game_set_id, court);
        
        printf("Team 1 (HOME):\n");
        printf("Position | Username | OG\n");
        printf("-------------------------\n");
        
        for (int i = 0; i < 4; i++) {
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("%d | %s | %s\n",
                   position,
                   username,
                   is_og ? "Yes" : "No");
        }
        
        printf("\nTeam 2 (AWAY):\n");
        printf("Position | Username | OG\n");
        printf("-------------------------\n");
        
        for (int i = 4; i < 8; i++) {
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("%d | %s | %s\n",
                   position,
                   username,
                   is_og ? "Yes" : "No");
        }
    }
    
    PQclear(res);
}

/**
 * Finalize a game with the given scores
 */
void finalize_game(PGconn *conn, int game_id, int team1_score, int team2_score) {
    char query[256];
    
    // Start a transaction
    PGresult *res = PQexec(conn, "BEGIN");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    // Get game info
    sprintf(query, 
            "SELECT g.id, g.set_id, g.state "
            "FROM games g "
            "WHERE g.id = %d",
            game_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game not found: %d\n", game_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if game is active
    const char *state = PQgetvalue(res, 0, 2);
    if (strcmp(state, "active") != 0) {
        fprintf(stderr, "Game is not active (current state: %s)\n", state);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    PQclear(res);
    
    // Update game
    sprintf(query, 
            "UPDATE games "
            "SET team1_score = %d, team2_score = %d, state = 'completed' "
            "WHERE id = %d "
            "RETURNING id, set_id",
            team1_score, team2_score, game_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Error updating game: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Game %d finalized with score: %d-%d\n", game_id, team1_score, team2_score);
    
    PQclear(res);
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    PQclear(res);
}

/**
 * Run arbitrary SQL query
 */
void run_sql_query(PGconn *conn, const char *query) {
    PGresult *res = PQexec(conn, query);
    
    // Check if query execution was successful
    if (PQresultStatus(res) == PGRES_TUPLES_OK) {
        // Query that returns rows
        int rows = PQntuples(res);
        int cols = PQnfields(res);
        
        // Print column names
        for (int col = 0; col < cols; col++) {
            printf("%s%s", col > 0 ? " | " : "", PQfname(res, col));
        }
        printf("\n");
        
        // Print separator
        for (int col = 0; col < cols; col++) {
            printf("%s%s", col > 0 ? "-+-" : "", "----------");
        }
        printf("\n");
        
        // Print rows
        for (int row = 0; row < rows; row++) {
            for (int col = 0; col < cols; col++) {
                printf("%s%s", col > 0 ? " | " : "", PQgetvalue(res, row, col));
            }
            printf("\n");
        }
        
        printf("\n%d rows returned\n", rows);
    } else if (PQresultStatus(res) == PGRES_COMMAND_OK) {
        // Query that doesn't return rows (INSERT, UPDATE, DELETE, etc.)
        printf("Command completed successfully: %s\n", PQcmdStatus(res));
    } else {
        // Error
        fprintf(stderr, "Query execution failed: %s\n", PQerrorMessage(conn));
    }
    
    PQclear(res);
}

/**
 * Get comprehensive game set status including active games, next up players, and completed games
 */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format) {
    char query[4096];
    PGresult *res;
    
    // Get game set details
    sprintf(query, "SELECT id, created_by_id, club_index, court_count, max_consecutive_games, "
                  "current_queue_position, queue_next_up, created_at, is_active "
                  "FROM game_sets WHERE id = %d", game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
        return;
    }
    
    int current_position = atoi(PQgetvalue(res, 0, 5));
    int queue_next_up = atoi(PQgetvalue(res, 0, 6));
    bool is_active = strcmp(PQgetvalue(res, 0, 8), "t") == 0;
    int max_consecutive_games = atoi(PQgetvalue(res, 0, 4));
    
    PQclear(res);
    
    // Format output based on format parameter
    if (strcmp(format, "json") == 0) {
        printf("{\n  \"game_set\": {\n");
        printf("    \"id\": %d,\n", game_set_id);
        printf("    \"is_active\": %s,\n", is_active ? "true" : "false");
        printf("    \"current_position\": %d,\n", current_position);
        printf("    \"queue_next_up\": %d,\n", queue_next_up);
        printf("    \"max_consecutive_games\": %d\n", max_consecutive_games);
        printf("  },\n");
        
        // Get active games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.created_at "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'active' "
                "ORDER BY g.id",
                game_set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting active games: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int active_game_count = PQntuples(res);
        printf("  \"active_games\": [\n");
        
        for (int i = 0; i < active_game_count; i++) {
            int game_id = atoi(PQgetvalue(res, i, 0));
            printf("    {\n");
            printf("      \"id\": %d,\n", game_id);
            printf("      \"court\": \"%s\",\n", PQgetvalue(res, i, 1));
            printf("      \"team1_score\": %d,\n", atoi(PQgetvalue(res, i, 2)));
            printf("      \"team2_score\": %d,\n", atoi(PQgetvalue(res, i, 3)));
            printf("      \"created_at\": \"%s\",\n", PQgetvalue(res, i, 4));
            
            // Get players for this game
            char player_query[512];
            sprintf(player_query, 
                    "SELECT gp.team, u.id, u.username, u.birth_year, gp.relative_position "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = %d "
                    "ORDER BY gp.team, gp.relative_position",
                    game_id);
            
            PGresult *player_res = PQexec(conn, player_query);
            if (PQresultStatus(player_res) == PGRES_TUPLES_OK) {
                int player_count = PQntuples(player_res);
                
                printf("      \"players\": [\n");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    int position = atoi(PQgetvalue(player_res, j, 4));
                    
                    int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                    
                    printf("        {\n");
                    printf("          \"user_id\": %d,\n", user_id);
                    printf("          \"username\": \"%s\",\n", username);
                    printf("          \"team\": %d,\n", team);
                    printf("          \"position\": %d,\n", position);
                    if (birth_year > 0) {
                        printf("          \"birth_year\": %d,\n", birth_year);
                    } else {
                        printf("          \"birth_year\": null,\n");
                    }
                    printf("          \"is_og\": %s\n", is_og ? "true" : "false");
                    printf("        }%s\n", j < player_count - 1 ? "," : "");
                }
                printf("      ]\n");
            }
            PQclear(player_res);
            
            printf("    }%s\n", i < active_game_count - 1 ? "," : "");
        }
        
        printf("  ],\n");
        PQclear(res);
        
        // Get next-up players
        sprintf(query, 
                "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position, c.type AS checkin_type "
                "FROM checkins c "
                "JOIN users u ON c.user_id = u.id "
                "WHERE c.is_active = true "
                "AND c.queue_position >= %d "
                "ORDER BY c.queue_position",
                current_position);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting next-up players: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int next_up_count = PQntuples(res);
        printf("  \"next_up_players\": [\n");
        
        for (int i = 0; i < next_up_count; i++) {
            int user_id = atoi(PQgetvalue(res, i, 1));
            const char *username = PQgetvalue(res, i, 2);
            const char *birth_year_str = PQgetvalue(res, i, 3);
            int position = atoi(PQgetvalue(res, i, 4));
            const char *checkin_type = PQgetvalue(res, i, 5);
            
            int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"position\": %d,\n", position);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
            } else {
                printf("      \"birth_year\": null,\n");
            }
            printf("      \"is_og\": %s,\n", is_og ? "true" : "false");
            printf("      \"checkin_type\": \"%s\"\n", checkin_type);
            printf("    }%s\n", i < next_up_count - 1 ? "," : "");
        }
        
        printf("  ],\n");
        PQclear(res);
        
        // Get recent completed games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.created_at, g.updated_at "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'completed' "
                "ORDER BY g.updated_at DESC "
                "LIMIT 5",
                game_set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting completed games: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int completed_count = PQntuples(res);
        printf("  \"recent_completed_games\": [\n");
        
        for (int i = 0; i < completed_count; i++) {
            int game_id = atoi(PQgetvalue(res, i, 0));
            printf("    {\n");
            printf("      \"id\": %d,\n", game_id);
            printf("      \"court\": \"%s\",\n", PQgetvalue(res, i, 1));
            printf("      \"team1_score\": %d,\n", atoi(PQgetvalue(res, i, 2)));
            printf("      \"team2_score\": %d,\n", atoi(PQgetvalue(res, i, 3)));
            printf("      \"created_at\": \"%s\",\n", PQgetvalue(res, i, 4));
            printf("      \"completed_at\": \"%s\"\n", PQgetvalue(res, i, 5));
            printf("    }%s\n", i < completed_count - 1 ? "," : "");
        }
        
        printf("  ]\n");
        printf("}\n");
    } else {
        // Text format
        printf("==== Game Set %d Status ====\n", game_set_id);
        printf("Active: %s\n", is_active ? "Yes" : "No");
        printf("Current Position: %d\n", current_position);
        printf("Queue Next Up: %d\n", queue_next_up);
        printf("Max Consecutive Games: %d\n\n", max_consecutive_games);
        
        // Get active games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.created_at "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'active' "
                "ORDER BY g.id",
                game_set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting active games: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int active_game_count = PQntuples(res);
        printf("==== Active Games (%d) ====\n", active_game_count);
        
        for (int i = 0; i < active_game_count; i++) {
            int game_id = atoi(PQgetvalue(res, i, 0));
            const char *court = PQgetvalue(res, i, 1);
            int team1_score = atoi(PQgetvalue(res, i, 2));
            int team2_score = atoi(PQgetvalue(res, i, 3));
            
            printf("Game #%d on Court %s (Score: %d-%d)\n", 
                   game_id, court, team1_score, team2_score);
            
            // Get players for this game
            char player_query[512];
            sprintf(player_query, 
                    "SELECT gp.team, u.id, u.username, u.birth_year, gp.relative_position "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = %d "
                    "ORDER BY gp.team, gp.relative_position",
                    game_id);
            
            PGresult *player_res = PQexec(conn, player_query);
            if (PQresultStatus(player_res) == PGRES_TUPLES_OK) {
                printf("\n");
                printf("HOME TEAM:\n");
                printf("%-3s | %-20s | %-3s | %-3s | %-3s\n", "Pos", "Username", "UID", "OG", "Type");
                printf("------------------------------------------------\n");
                
                // Print Team 1 (HOME)
                for (int j = 0; j < PQntuples(player_res); j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    if (team != 1) continue;
                    
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    int position = atoi(PQgetvalue(player_res, j, 4));
                    
                    int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                    
                    printf("%-3d | %-20s | %-3d | %-3s | %-4s\n", 
                           position, username, user_id, 
                           is_og ? "Yes" : "No", 
                           team == 1 ? "HOME" : "AWAY");
                }
                
                printf("\nAWAY TEAM:\n");
                printf("%-3s | %-20s | %-3s | %-3s | %-3s\n", "Pos", "Username", "UID", "OG", "Type");
                printf("------------------------------------------------\n");
                
                // Print Team 2 (AWAY)
                for (int j = 0; j < PQntuples(player_res); j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    if (team != 2) continue;
                    
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    int position = atoi(PQgetvalue(player_res, j, 4));
                    
                    int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                    
                    printf("%-3d | %-20s | %-3d | %-3s | %-4s\n", 
                           position, username, user_id, 
                           is_og ? "Yes" : "No", 
                           team == 1 ? "HOME" : "AWAY");
                }
            }
            PQclear(player_res);
            
            printf("\n");
        }
        
        if (active_game_count == 0) {
            printf("No active games\n\n");
        }
        
        PQclear(res);
        
        // Get next-up players
        sprintf(query, 
                "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position, c.type AS checkin_type "
                "FROM checkins c "
                "JOIN users u ON c.user_id = u.id "
                "WHERE c.is_active = true "
                "AND c.queue_position >= %d "
                "ORDER BY c.queue_position",
                current_position);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting next-up players: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int next_up_count = PQntuples(res);
        printf("==== Next Up Players (%d) ====\n", next_up_count);
        
        if (next_up_count > 0) {
            printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
            printf("--------------------------------------------------\n");
            
            for (int i = 0; i < next_up_count; i++) {
                int user_id = atoi(PQgetvalue(res, i, 1));
                const char *username = PQgetvalue(res, i, 2);
                const char *birth_year_str = PQgetvalue(res, i, 3);
                int position = atoi(PQgetvalue(res, i, 4));
                const char *checkin_type = PQgetvalue(res, i, 5);
                
                int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                
                printf("%-3d | %-20s | %-3d | %-3s | %-10s\n", 
                       position, username, user_id, 
                       is_og ? "Yes" : "No", 
                       checkin_type);
            }
        } else {
            printf("No players in queue\n");
        }
        
        printf("\n");
        PQclear(res);
        
        // Get recent completed games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.created_at, g.updated_at "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'completed' "
                "ORDER BY g.updated_at DESC "
                "LIMIT 5",
                game_set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting completed games: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int completed_count = PQntuples(res);
        printf("==== Recently Completed Games (%d) ====\n", completed_count);
        
        if (completed_count > 0) {
            printf("%-4s | %-8s | %-10s | %-15s\n", "ID", "Court", "Score", "Completed At");
            printf("-------------------------------------------\n");
            
            for (int i = 0; i < completed_count; i++) {
                int game_id = atoi(PQgetvalue(res, i, 0));
                const char *court = PQgetvalue(res, i, 1);
                int team1_score = atoi(PQgetvalue(res, i, 2));
                int team2_score = atoi(PQgetvalue(res, i, 3));
                const char *completed_at = PQgetvalue(res, i, 5);
                
                printf("%-4d | %-8s | %-3d-%-6d | %-15s\n", 
                       game_id, court, team1_score, team2_score, completed_at);
            }
        } else {
            printf("No completed games\n");
        }
    }
    
    PQclear(res);
}

/**
 * End game and optionally auto-promote players
 */
void end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote) {
    char query[4096];
    PGresult *res;
    
    // Start a transaction
    res = PQexec(conn, "BEGIN");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    // Get game info
    sprintf(query, 
            "SELECT g.id, g.set_id, g.state, gs.max_consecutive_games, gs.current_queue_position, gs.queue_next_up "
            "FROM games g "
            "JOIN game_sets gs ON g.set_id = gs.id "
            "WHERE g.id = %d",
            game_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game not found: %d\n", game_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if game is active
    const char *state = PQgetvalue(res, 0, 2);
    if (strcmp(state, "active") != 0) {
        fprintf(stderr, "Game is not active (current state: %s)\n", state);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int set_id = atoi(PQgetvalue(res, 0, 1));
    int max_consecutive_games = atoi(PQgetvalue(res, 0, 3));
    int current_queue_position = atoi(PQgetvalue(res, 0, 4));
    int queue_next_up = atoi(PQgetvalue(res, 0, 5));
    
    PQclear(res);
    
    // Update game with scores and mark as completed
    sprintf(query, 
            "UPDATE games "
            "SET team1_score = %d, team2_score = %d, state = 'completed' "
            "WHERE id = %d "
            "RETURNING id",
            home_score, away_score, game_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Error updating game: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Game %d ended with score: %d-%d\n", game_id, home_score, away_score);
    
    PQclear(res);
    
    if (autopromote) {
        // Determine winning team (1 = HOME, 2 = AWAY)
        int winning_team = home_score > away_score ? 1 : 2;
        int losing_team = winning_team == 1 ? 2 : 1;
        
        // Count consecutive wins for winning team
        sprintf(query, 
                "WITH team_players AS ("
                "  SELECT array_agg(user_id) AS player_ids "
                "  FROM game_players "
                "  WHERE game_id = %d AND team = %d"
                ") "
                "SELECT COUNT(*) "
                "FROM games g "
                "JOIN game_players gp ON g.id = gp.game_id "
                "WHERE g.set_id = %d "
                "  AND g.state = 'completed' "
                "  AND g.id != %d "
                "GROUP BY g.id "
                "HAVING COUNT(CASE WHEN (SELECT player_ids FROM team_players) @> ARRAY[gp.user_id] THEN 1 END) >= %d "
                "ORDER BY g.id DESC",
                game_id, winning_team, set_id, game_id, PLAYERS_PER_TEAM - 1);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error checking team history: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int consecutive_wins = PQntuples(res);
        PQclear(res);
        
        // Determine which team to promote
        int team_to_promote;
        const char *promotion_type;
        
        if (consecutive_wins < max_consecutive_games) {
            team_to_promote = winning_team;
            promotion_type = "win_promoted";
            printf("Winning team has played %d consecutive games (max: %d) - promoting winners\n", 
                   consecutive_wins, max_consecutive_games);
        } else {
            team_to_promote = losing_team;
            promotion_type = "loss_promoted";
            printf("Winning team has reached max consecutive games (%d) - promoting losers\n", 
                   max_consecutive_games);
        }
        
        // Mark all players in the game as inactive in checkins
        sprintf(query, 
                "UPDATE checkins c "
                "SET is_active = false "
                "FROM game_players gp "
                "WHERE gp.game_id = %d "
                "AND gp.user_id = c.user_id "
                "AND c.is_active = true "
                "RETURNING gp.user_id",
                game_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error deactivating player check-ins: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int deactivated_count = PQntuples(res);
        printf("Deactivated %d player check-ins\n", deactivated_count);
        
        PQclear(res);
        
        // Increment existing next-up players' queue positions
        sprintf(query, 
                "UPDATE checkins "
                "SET queue_position = queue_position + %d "
                "WHERE is_active = true "
                "AND queue_position >= %d "
                "RETURNING id, queue_position",
                PLAYERS_PER_TEAM, current_queue_position);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error updating next-up positions: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int updated_positions = PQntuples(res);
        printf("Updated %d existing next-up player positions\n", updated_positions);
        
        PQclear(res);
        
        // Get players to promote
        sprintf(query, 
                "SELECT gp.user_id, u.username, gp.relative_position, u.autoup "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "WHERE gp.game_id = %d AND gp.team = %d "
                "ORDER BY gp.relative_position",
                game_id, team_to_promote);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting players to promote: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int player_count = PQntuples(res);
        printf("Promoting %d players from team %d:\n", player_count, team_to_promote);
        
        // Insert new check-ins for promoted players
        for (int i = 0; i < player_count; i++) {
            int user_id = atoi(PQgetvalue(res, i, 0));
            const char *username = PQgetvalue(res, i, 1);
            int relative_position = atoi(PQgetvalue(res, i, 2));
            
            // Calculate new queue position based on relative position
            int new_position = current_queue_position + relative_position - 1;
            
            char insert_query[512];
            sprintf(insert_query, 
                    "INSERT INTO checkins (user_id, club_index, queue_position, is_active, type) "
                    "VALUES (%d, (SELECT club_index FROM game_sets WHERE id = %d), %d, true, '%s') "
                    "RETURNING id",
                    user_id, set_id, new_position, promotion_type);
            
            PGresult *insert_res = PQexec(conn, insert_query);
            if (PQresultStatus(insert_res) != PGRES_TUPLES_OK) {
                fprintf(stderr, "Error creating check-in for %s: %s", 
                        username, PQerrorMessage(conn));
                PQclear(insert_res);
                continue;
            }
            
            printf("- %s promoted to position %d\n", username, new_position);
            
            PQclear(insert_res);
        }
        
        PQclear(res);
        
        // Get players from the non-promoted team who have autoup=true
        sprintf(query, 
                "SELECT gp.user_id, u.username "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "WHERE gp.game_id = %d AND gp.team = %d "
                "AND u.autoup = true "
                "ORDER BY gp.relative_position",
                game_id, team_to_promote == 1 ? 2 : 1);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting auto-up players: %s", PQerrorMessage(conn));
            PQclear(res);
        } else {
            int autoup_count = PQntuples(res);
            
            if (autoup_count > 0) {
                printf("Auto-checking in %d players with autoup=true:\n", autoup_count);
                
                // Update queue_next_up for each autoup player
                int current_next_up = queue_next_up + PLAYERS_PER_TEAM;
                
                for (int i = 0; i < autoup_count; i++) {
                    int user_id = atoi(PQgetvalue(res, i, 0));
                    const char *username = PQgetvalue(res, i, 1);
                    
                    char insert_query[512];
                    sprintf(insert_query, 
                            "INSERT INTO checkins (user_id, club_index, queue_position, is_active, type) "
                            "VALUES (%d, (SELECT club_index FROM game_sets WHERE id = %d), %d, true, 'autoup') "
                            "RETURNING id",
                            user_id, set_id, current_next_up);
                    
                    PGresult *insert_res = PQexec(conn, insert_query);
                    if (PQresultStatus(insert_res) != PGRES_TUPLES_OK) {
                        fprintf(stderr, "Error auto-checking in %s: %s", 
                                username, PQerrorMessage(conn));
                        PQclear(insert_res);
                        continue;
                    }
                    
                    printf("- %s auto-checked in at position %d\n", username, current_next_up);
                    current_next_up++;
                    
                    PQclear(insert_res);
                }
                
                // Update queue_next_up in game_sets
                sprintf(query, 
                        "UPDATE game_sets SET queue_next_up = %d "
                        "WHERE id = %d "
                        "RETURNING queue_next_up",
                        current_next_up, set_id);
                
                PGresult *update_res = PQexec(conn, query);
                if (PQresultStatus(update_res) == PGRES_TUPLES_OK) {
                    printf("Updated queue_next_up to %d\n", current_next_up);
                }
                PQclear(update_res);
            }
            
            PQclear(res);
        }
    } else {
        printf("Autopromote is disabled - no automatic promotions will be performed\n");
    }
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Game %d successfully ended\n", game_id);
    
    PQclear(res);
}

/**
 * Compare two teams to see if they are the same
 * Returns true if all players are the same on both teams
 */
bool team_compare(PGconn *conn, int game_id1, int game_id2) {
    char query[512];
    
    // Get team 1 from game 1
    sprintf(query, 
            "SELECT array_agg(user_id ORDER BY user_id) AS players "
            "FROM game_players "
            "WHERE game_id = %d AND team = 1",
            game_id1);
    
    PGresult *res1 = PQexec(conn, query);
    if (PQresultStatus(res1) != PGRES_TUPLES_OK || PQntuples(res1) == 0) {
        PQclear(res1);
        return false;
    }
    
    // Get team 1 from game 2
    sprintf(query, 
            "SELECT array_agg(user_id ORDER BY user_id) AS players "
            "FROM game_players "
            "WHERE game_id = %d AND team = 1",
            game_id2);
    
    PGresult *res2 = PQexec(conn, query);
    if (PQresultStatus(res2) != PGRES_TUPLES_OK || PQntuples(res2) == 0) {
        PQclear(res1);
        PQclear(res2);
        return false;
    }
    
    // Check if teams are the same
    bool same_team1 = (strcmp(PQgetvalue(res1, 0, 0), PQgetvalue(res2, 0, 0)) == 0);
    
    PQclear(res1);
    PQclear(res2);
    
    // Get team 2 from game 1
    sprintf(query, 
            "SELECT array_agg(user_id ORDER BY user_id) AS players "
            "FROM game_players "
            "WHERE game_id = %d AND team = 2",
            game_id1);
    
    res1 = PQexec(conn, query);
    if (PQresultStatus(res1) != PGRES_TUPLES_OK || PQntuples(res1) == 0) {
        PQclear(res1);
        return false;
    }
    
    // Get team 2 from game 2
    sprintf(query, 
            "SELECT array_agg(user_id ORDER BY user_id) AS players "
            "FROM game_players "
            "WHERE game_id = %d AND team = 2",
            game_id2);
    
    res2 = PQexec(conn, query);
    if (PQresultStatus(res2) != PGRES_TUPLES_OK || PQntuples(res2) == 0) {
        PQclear(res1);
        PQclear(res2);
        return false;
    }
    
    // Check if teams are the same
    bool same_team2 = (strcmp(PQgetvalue(res1, 0, 0), PQgetvalue(res2, 0, 0)) == 0);
    
    PQclear(res1);
    PQclear(res2);
    
    // Teams are the same if both team 1 and team 2 are the same
    return same_team1 && same_team2;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Successfully connected to the database\n");
        printf("Usage: %s <command> [args...]\n", argv[0]);
        printf("Available commands:\n");
        printf("  users - List all users\n");
        printf("  active-checkins - List active checkins with usernames\n");
        printf("  active-games - List active games\n");
        printf("  active-game-set - Show active game set details\n");
        printf("  checkout <position1> [position2] [position3] ... - Check out player(s) at queue position(s)\n");
        printf("  player <username> [format] - Show detailed information about a player (format: text|json, default: text)\n");
        printf("  promote <game_id> <win|loss> - Promote winners or losers of the specified game\n");
        printf("  next-up [game_set_id] [format] - List next-up players for game set (format: text|json, default: text)\n");
        printf("  propose-game <game_set_id> <court> [format] - Propose a new game without creating it (format: text|json, default: text)\n");
        printf("  finalize <game_id> <team1_score> <team2_score> - Finalize a game with the given scores\n");
        printf("  game-set-status <game_set_id> [json|text] - Show the status of a game set, including active games, next-up players, and completed games\n");
        printf("  end-game <game_id> <home_score> <away_score> [autopromote] - End a game with the given scores and optionally auto-promote players (true/false, default is true)\n");
        printf("  sql \"<sql_query>\" - Run arbitrary SQL query\n");
        return 1;
    }
    
    const char *command = argv[1];
    
    // Connect to the database
    PGconn *conn = connect_to_db();
    if (conn == NULL) {
        fprintf(stderr, "Failed to connect to database\n");
        return STAT_ERROR_DB;
    }
    
    // Process commands
    if (strcmp(command, "users") == 0) {
        list_users(conn);
    } else if (strcmp(command, "active-checkins") == 0) {
        list_active_checkins(conn);
    } else if (strcmp(command, "active-games") == 0) {
        list_active_games(conn);
    } else if (strcmp(command, "active-game-set") == 0) {
        show_active_game_set(conn);
    } else if (strcmp(command, "checkout") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Usage: %s checkout <position1> [position2] [position3] ...\n", argv[0]);
        } else {
            checkout_players(conn, argc, argv);
        }
    } else if (strcmp(command, "player") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Usage: %s player <username> [format]\n", argv[0]);
        } else {
            const char *username = argv[2];
            const char *format = argc >= 4 ? argv[3] : "text";
            
            if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'json' or 'text')\n", format);
            } else {
                show_player_info(conn, username, format);
            }
        }
    } else if (strcmp(command, "promote") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Usage: %s promote <game_id> <win|loss>\n", argv[0]);
        } else {
            int game_id = atoi(argv[2]);
            if (game_id <= 0) {
                fprintf(stderr, "Invalid game_id: %s\n", argv[2]);
            } else {
                const char *type = argv[3];
                if (strcmp(type, "win") != 0 && strcmp(type, "loss") != 0) {
                    fprintf(stderr, "Invalid promotion type: %s (should be 'win' or 'loss')\n", type);
                } else {
                    promote_players(conn, game_id, strcmp(type, "win") == 0);
                }
            }
        }
    } else if (strcmp(command, "next-up") == 0) {
        int game_set_id = 0;
        const char *format = "text";
        
        if (argc >= 3) {
            game_set_id = atoi(argv[2]);
        }
        
        if (argc >= 4) {
            format = argv[3];
            if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'json' or 'text')\n", format);
                PQfinish(conn);
                return 1;
            }
        }
        
        list_next_up_players(conn, game_set_id, format);
    } else if (strcmp(command, "propose-game") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Usage: %s propose-game <game_set_id> <court> [format]\n", argv[0]);
        } else {
            int game_set_id = atoi(argv[2]);
            if (game_set_id <= 0) {
                fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            } else {
                const char *court = argv[3];
                const char *format = argc >= 5 ? argv[4] : "text";
                
                if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                    fprintf(stderr, "Invalid format: %s (should be 'json' or 'text')\n", format);
                } else {
                    propose_game(conn, game_set_id, court, format);
                }
            }
        }
    } else if (strcmp(command, "finalize") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s finalize <game_id> <team1_score> <team2_score>\n", argv[0]);
        } else {
            int game_id = atoi(argv[2]);
            int team1_score = atoi(argv[3]);
            int team2_score = atoi(argv[4]);
            
            if (game_id <= 0) {
                fprintf(stderr, "Invalid game_id: %s\n", argv[2]);
            } else if (team1_score < 0 || team2_score < 0) {
                fprintf(stderr, "Invalid scores: %s-%s\n", argv[3], argv[4]);
            } else {
                finalize_game(conn, game_id, team1_score, team2_score);
            }
        }
    } else if (strcmp(command, "sql") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Usage: %s sql \"<sql_query>\"\n", argv[0]);
        } else {
            run_sql_query(conn, argv[2]);
        }
    } else if (strcmp(command, "game-set-status") == 0) {
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
    } else if (strcmp(command, "end-game") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s end-game <game_id> <home_score> <away_score> [autopromote]\n", argv[0]);
            fprintf(stderr, "  autopromote: true|false (default: true)\n");
            PQfinish(conn);
            return 1;
        }
        
        int game_id = atoi(argv[2]);
        if (game_id <= 0) {
            fprintf(stderr, "Invalid game_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        int home_score = atoi(argv[3]);
        int away_score = atoi(argv[4]);
        
        if (home_score < 0 || away_score < 0) {
            fprintf(stderr, "Invalid scores: %s-%s\n", argv[3], argv[4]);
            PQfinish(conn);
            return 1;
        }
        
        // Get autopromote flag (default is true)
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
        
        end_game(conn, game_id, home_score, away_score, autopromote);
    } else {
        fprintf(stderr, "Unknown command: %s\n", command);
    }
    
    PQfinish(conn);
    return 0;
}