#define _XOPEN_SOURCE
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
// void list_active_checkins(PGconn *conn); // Removed as requested
void list_active_games(PGconn *conn);
void show_active_game_set(PGconn *conn);
void checkout_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void bump_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void bottom_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void show_player_info(PGconn *conn, const char *username, const char *format);
// void promote_players(PGconn *conn, int game_id, bool promote_winners); // Removed as requested
void list_next_up_players(PGconn *conn, int game_set_id, const char *format);
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate, const char *status_format);
// void finalize_game(PGconn *conn, int game_id, int team1_score, int team2_score); // Removed as requested
// Removed direct SQL query function as requested

/* Function prototypes - from enhanced scootd */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format);
void end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote, const char *status_format);
void bump_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void bottom_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
bool team_compare_specific(PGconn *conn, int game1_id, int team1, int game2_id, int team2);
bool compare_player_arrays(PGconn *conn, int team1_players[], int team1_size, int team2_players[], int team2_size);
void checkin_player(PGconn *conn, int game_set_id, int user_id, const char *status_format);
void checkin_player_by_username(PGconn *conn, int game_set_id, const char *username, const char *status_format);

/**
 * Check in a player to a game set by username
 * 
 * @param conn Database connection
 * @param game_set_id The ID of the game set to check into
 * @param username The username of the user to check in
 * @param status_format Format to display game set status after checkin (none|text|json)
 */
void checkin_player_by_username(PGconn *conn, int game_set_id, const char *username, const char *status_format) {
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
    
    // Verify game set exists and is active
    snprintf(query, sizeof(query), 
        "SELECT id, is_active FROM game_sets WHERE id = %d", 
        game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query game set: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d does not exist\n", game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    bool is_active = strcmp(PQgetvalue(res, 0, 1), "t") == 0;
    if (!is_active) {
        fprintf(stderr, "Game set %d is not active\n", game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Lookup user ID by username
    snprintf(query, sizeof(query), 
        "SELECT id, username, is_player FROM users WHERE username = '%s'", 
        username);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query user: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "User with username '%s' does not exist\n", username);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User not found\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User not found\n");
        }
        
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int user_id = atoi(PQgetvalue(res, 0, 0));
    
    // Check if user has is_player permission
    bool is_player = strcmp(PQgetvalue(res, 0, 2), "t") == 0;
    if (!is_player) {
        fprintf(stderr, "User '%s' does not have player permission\n", username);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User is not a player (missing is_player permission)\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User is not a player (missing is_player permission)\n");
        }
        
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Now call the original function with the user ID
    PQexec(conn, "ROLLBACK"); // Rollback the current transaction
    checkin_player(conn, game_set_id, user_id, status_format);
}

/**
 * Check in a player to a game set
 * 
 * @param conn Database connection
 * @param game_set_id The ID of the game set to check into
 * @param user_id The ID of the user to check in
 * @param status_format Format to display game set status after checkin (none|text|json)
 */
void checkin_player(PGconn *conn, int game_set_id, int user_id, const char *status_format) {
    char query[4096];
    PGresult *res;
    int club_index = 34; // Fixed club index for now
    
    // Start a transaction
    res = PQexec(conn, "BEGIN");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    // Verify game set exists and is active
    snprintf(query, sizeof(query), 
        "SELECT id, is_active FROM game_sets WHERE id = %d", 
        game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query game set: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d does not exist\n", game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    bool is_active = strcmp(PQgetvalue(res, 0, 1), "t") == 0;
    if (!is_active) {
        fprintf(stderr, "Game set %d is not active\n", game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Check if user exists and has is_player=true
    snprintf(query, sizeof(query), 
        "SELECT id, username, is_player FROM users WHERE id = %d", 
        user_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query user: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "User with ID %d does not exist\n", user_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if user has is_player permission
    bool is_player = strcmp(PQgetvalue(res, 0, 2), "t") == 0;
    if (!is_player) {
        fprintf(stderr, "User with ID %d does not have player permission\n", user_id);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User is not a player (missing is_player permission)\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User is not a player (missing is_player permission)\n");
        }
        
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    char username[256];
    strncpy(username, PQgetvalue(res, 0, 1), sizeof(username) - 1);
    username[sizeof(username) - 1] = '\0';
    PQclear(res);
    
    // Check if user already has an active checkin in this game set
    snprintf(query, sizeof(query), 
        "SELECT id, queue_position FROM checkins "
        "WHERE user_id = %d AND game_set_id = %d AND is_active = true", 
        user_id, game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query existing checkins: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) > 0) {
        int existing_position = atoi(PQgetvalue(res, 0, 1));
        printf("User %s is already checked in at position %d\n", username, existing_position);
        PQclear(res);
        
        // Commit the transaction
        res = PQexec(conn, "COMMIT");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        PQclear(res);
        
        // Show game set status if requested
        if (status_format && strcmp(status_format, "none") != 0) {
            get_game_set_status(conn, game_set_id, status_format);
        }
        
        return;
    }
    PQclear(res);
    
    // Find the highest queue position currently in use
    snprintf(query, sizeof(query), 
        "SELECT COALESCE(MAX(queue_position), 0) FROM checkins "
        "WHERE game_set_id = %d AND is_active = true", 
        game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to query highest position: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int next_position = atoi(PQgetvalue(res, 0, 0)) + 1;
    PQclear(res);
    
    // Get current time in the required format
    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    char check_in_time[30];
    char check_in_date[11];
    
    strftime(check_in_time, sizeof(check_in_time), "%Y-%m-%d %H:%M:%S", tm_info);
    strftime(check_in_date, sizeof(check_in_date), "%Y-%m-%d", tm_info);
    
    // Create the new checkin
    snprintf(query, sizeof(query), 
        "INSERT INTO checkins "
        "(user_id, club_index, check_in_time, is_active, check_in_date, "
        "game_set_id, queue_position, type, game_id, team) "
        "VALUES (%d, %d, '%s', true, '%s', %d, %d, 'manual', NULL, NULL) "
        "RETURNING id", 
        user_id, club_index, check_in_time, check_in_date, 
        game_set_id, next_position);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to create checkin: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // We retrieve the ID but don't need to use it for anything
    PQclear(res);
    
    // Update the game set's queue tracking
    snprintf(query, sizeof(query), 
        "UPDATE game_sets "
        "SET current_queue_position = 1, queue_next_up = %d "
        "WHERE id = %d",
        next_position + 1, game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Failed to update game set queue tracking: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    PQclear(res);
    
    printf("Player %s successfully checked in to game set %d at position %d\n", 
        username, game_set_id, next_position);
    
    // Show game set status if requested
    if (status_format && strcmp(status_format, "none") != 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
}

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
// list_active_checkins removed as requested

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
        "SELECT id, created_by, gym, number_of_courts, max_consecutive_games, "
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
    printf("Gym: %s\n", PQgetvalue(res, 0, 2));
    printf("Number of courts: %s\n", PQgetvalue(res, 0, 3));
    printf("Max consecutive games: %s\n", PQgetvalue(res, 0, 4));
    printf("Current queue position: %s\n", PQgetvalue(res, 0, 5));
    printf("Queue next up: %s\n", PQgetvalue(res, 0, 6));
    printf("Created at: %s\n", PQgetvalue(res, 0, 7));
    
    PQclear(res);
}

/**
 * Check out a player from a game set with specific queue position and user ID
 * This function also adjusts the queue positions of players below the checked out player
 */
void checkout_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format) {
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
    
    // First, verify the player at the specified position has the correct user_id
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, c.queue_position "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.game_set_id = %d AND c.is_active = true "
            "AND c.queue_position = %d AND c.user_id = %d",
            game_set_id, queue_position, user_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error verifying player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "No active check-in found for user ID %d at position %d in game set %d\n", 
                user_id, queue_position, game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int checkin_id = atoi(PQgetvalue(res, 0, 0)); // We need this ID for the update below
    const char *username = PQgetvalue(res, 0, 2);
    PQclear(res);
    
    // Now check out the player by setting is_active to false
    sprintf(query, 
            "UPDATE checkins SET is_active = false "
            "WHERE id = %d "
            "RETURNING id, user_id, queue_position", 
            checkin_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error checking out player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "Failed to check out player with ID %d\n", checkin_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    printf("Successfully checked out player %s (ID: %d) from position %d\n", 
           username, user_id, queue_position);
    
    PQclear(res);
    
    // Now adjust the queue positions of all players below the checked out player
    sprintf(query, 
            "UPDATE checkins "
            "SET queue_position = queue_position - 1 "
            "WHERE game_set_id = %d AND is_active = true "
            "AND queue_position > %d",
            game_set_id, queue_position);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error adjusting queue positions: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int rows_affected = atoi(PQcmdTuples(res));
    printf("Adjusted queue positions for %d player(s)\n", rows_affected);
    
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
    
    // Output additional status information based on format
    if (strcmp(status_format, "text") == 0 || strcmp(status_format, "json") == 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
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
                "g.start_time "
                "FROM games g "
                "JOIN game_players gp ON g.id = gp.game_id "
                "WHERE gp.user_id = $1 "
                "ORDER BY g.start_time DESC "
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
// promote_players removed as requested

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
        printf("\nNEXT UP:\n");
        printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
        printf("--------------------------------------------------\n");
        
        if (player_count == 0) {
            printf("No players in queue\n");
        } else {
            for (int i = 0; i < player_count; i++) {
                int user_id = atoi(PQgetvalue(res, i, 1));
                const char *username = PQgetvalue(res, i, 2);
                const char *birth_year_str = PQgetvalue(res, i, 3);
                int position = atoi(PQgetvalue(res, i, 4));
                const char *checkin_type = PQgetvalue(res, i, 6);
                
                int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                
                // Check if this is an autoup player with win count
                char display_type[32];
                strncpy(display_type, checkin_type, sizeof(display_type) - 1);
                display_type[sizeof(display_type) - 1] = '\0';
                
                // If the type starts with "autoup:" format it as "autoup (win streak: X)"
                if (strncmp(checkin_type, "autoup:", 7) == 0) {
                    int win_count = atoi(checkin_type + 7);
                    sprintf(display_type, "autoup (%d win%s)", 
                            win_count, 
                            win_count == 1 ? "" : "s");
                }
                
                printf("%-3d | %-20s | %-3d | %-3s | %-20s\n", 
                       position, 
                       username, 
                       user_id,
                       is_og ? "Yes" : "No",
                       display_type);
            }
        }
    }
    
    PQclear(res);
}

/**
 * Propose a new game without creating it
 */
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate, const char *status_format) {
    char query[4096];
    PGresult *res;
    
    // Set default status_format to "none" if not provided
    if (status_format == NULL) {
        status_format = "none";
    }
    
    // Get game set details
    sprintf(query, 
            "SELECT id, current_queue_position FROM game_sets WHERE id = %d",
            game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
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
    
    int current_position = atoi(PQgetvalue(res, 0, 1));
    PQclear(res);
    
    // Check if there are active games on this court for this game set
    sprintf(query, 
            "SELECT id FROM games "
            "WHERE set_id = %d AND court = '%s' AND state IN ('started', 'active')",
            game_set_id, court);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game check query failed: %s\n", PQerrorMessage(conn));
        PQclear(res);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when checking active games\"\n");
            printf("}\n");
        } else {
            printf("Error checking active games: Database error\n");
        }
        return;
    }
    
    if (PQntuples(res) > 0) {
        int game_id = atoi(PQgetvalue(res, 0, 0));
        PQclear(res);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"GAME_IN_PROGRESS\",\n");
            printf("  \"message\": \"Game already in progress on court %s (Game ID: %d)\",\n", court, game_id);
            printf("  \"game_id\": %d\n", game_id);
            printf("}\n");
        } else {
            printf("Game already in progress on court %s (Game ID: %d)\n", court, game_id);
        }
        return;
    }
    
    PQclear(res);
    
    // Get available players (not assigned to a game)
    // Include team information to respect previous assignments
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position, c.type, c.team "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.is_active = true "
            "AND c.game_id IS NULL "
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
    if (player_count < 8) {
        fprintf(stderr, "Not enough players for a game (need 8, have %d)\n", player_count);
        PQclear(res);
        return;
    }
    
    // Format: json or text
    if (strcmp(format, "json") == 0) {
        // First, collect all players and identify those with pre-assigned teams
        typedef struct {
            int user_id;
            const char *username;
            const char *birth_year_str;
            int position;
            const char *checkin_type;
            int team; // 0 = unassigned, 1 = HOME, 2 = AWAY
        } PlayerInfo;
        
        PlayerInfo players[8];
        int home_team_count = 0;
        int away_team_count = 0;
        
        // Collect player info and determine team assignments
        for (int i = 0; i < 8; i++) {
            players[i].user_id = atoi(PQgetvalue(res, i, 1));
            players[i].username = PQgetvalue(res, i, 2);
            players[i].birth_year_str = PQgetvalue(res, i, 3);
            players[i].position = atoi(PQgetvalue(res, i, 4));
            players[i].checkin_type = PQgetvalue(res, i, 5);
            
            // Check if team is already assigned from previous game
            if (PQgetisnull(res, i, 6) == 0) {
                players[i].team = atoi(PQgetvalue(res, i, 6));
                
                // Count players per team
                if (players[i].team == 1) {
                    home_team_count++;
                } else if (players[i].team == 2) {
                    away_team_count++;
                }
            } else {
                players[i].team = 0; // No team assignment yet
            }
        }
        
        // Assign teams to players without a team assignment
        for (int i = 0; i < 8; i++) {
            if (players[i].team == 0) {
                // Assign to team with fewer players
                if (home_team_count < 4) {
                    players[i].team = 1; // HOME
                    home_team_count++;
                } else {
                    players[i].team = 2; // AWAY
                    away_team_count++;
                }
            }
        }
        
        printf("{\n");
        printf("  \"game_set_id\": %d,\n", game_set_id);
        printf("  \"court\": \"%s\",\n", court);
        
        // Output home team (team 1)
        printf("  \"team2\": [\n"); // Team 2 in JSON corresponds to HOME team
        int home_displayed = 0;
        for (int i = 0; i < 8; i++) {
            if (players[i].team != 1) continue;
            
            int birth_year = players[i].birth_year_str[0] != '\0' ? atoi(players[i].birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", players[i].user_id);
            printf("      \"username\": \"%s\",\n", players[i].username);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
            } else {
                printf("      \"birth_year\": null,\n");
            }
            printf("      \"position\": %d,\n", players[i].position);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", home_displayed < home_team_count - 1 ? "," : "");
            
            home_displayed++;
        }
        
        printf("  ],\n");
        
        // Output away team (team 2)
        printf("  \"team1\": [\n"); // Team 1 in JSON corresponds to AWAY team
        int away_displayed = 0;
        for (int i = 0; i < 8; i++) {
            if (players[i].team != 2) continue;
            
            int birth_year = players[i].birth_year_str[0] != '\0' ? atoi(players[i].birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            printf("    {\n");
            printf("      \"user_id\": %d,\n", players[i].user_id);
            printf("      \"username\": \"%s\",\n", players[i].username);
            if (birth_year > 0) {
                printf("      \"birth_year\": %d,\n", birth_year);
            } else {
                printf("      \"birth_year\": null,\n");
            }
            printf("      \"position\": %d,\n", players[i].position);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", away_displayed < away_team_count - 1 ? "," : "");
            
            away_displayed++;
        }
        
        printf("  ]\n");
        printf("}\n");
    } else {
        printf("=== Proposed Game (Game Set %d, Court: %s) ===\n\n", game_set_id, court);
        
        // First, collect all players and identify those with pre-assigned teams
        typedef struct {
            int user_id;
            const char *username;
            const char *birth_year_str;
            int position;
            const char *checkin_type;
            int team; // 0 = unassigned, 1 = HOME, 2 = AWAY
        } PlayerInfo;
        
        PlayerInfo players[8];
        int home_team_count = 0;
        int away_team_count = 0;
        
        // Collect player info and determine team assignments
        for (int i = 0; i < 8; i++) {
            players[i].user_id = atoi(PQgetvalue(res, i, 1));
            players[i].username = PQgetvalue(res, i, 2);
            players[i].birth_year_str = PQgetvalue(res, i, 3);
            players[i].position = atoi(PQgetvalue(res, i, 4));
            players[i].checkin_type = PQgetvalue(res, i, 5);
            
            // Check if team is already assigned from previous game
            if (PQgetisnull(res, i, 6) == 0) {
                players[i].team = atoi(PQgetvalue(res, i, 6));
                
                // Count players per team
                if (players[i].team == 1) {
                    home_team_count++;
                } else if (players[i].team == 2) {
                    away_team_count++;
                }
            } else {
                players[i].team = 0; // No team assignment yet
            }
        }
        
        // Assign teams to players without a team assignment
        for (int i = 0; i < 8; i++) {
            if (players[i].team == 0) {
                // Assign to team with fewer players
                if (home_team_count < 4) {
                    players[i].team = 1;
                    home_team_count++;
                } else {
                    players[i].team = 2;
                    away_team_count++;
                }
            }
        }
        
        // Display HOME team
        printf("HOME TEAM:\n");
        printf("%-3s | %-20s | %-3s | %-3s | %-20s\n", "Pos", "Username", "UID", "OG", "Type");
        printf("---------------------------------------------------------\n");
        
        int home_displayed = 0;
        for (int i = 0; i < 8; i++) {
            if (players[i].team != 1) continue;
            
            int birth_year = players[i].birth_year_str[0] != '\0' ? atoi(players[i].birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            // Check if this is an autoup player with win count
            char display_type[32];
            strncpy(display_type, players[i].checkin_type, sizeof(display_type) - 1);
            display_type[sizeof(display_type) - 1] = '\0';
            
            // If the type starts with "autoup:" format it as "autoup (win streak: X)"
            if (strncmp(players[i].checkin_type, "autoup:", 7) == 0) {
                int win_count = atoi(players[i].checkin_type + 7);
                sprintf(display_type, "autoup (%d win%s)", 
                        win_count, 
                        win_count == 1 ? "" : "s");
            }
            
            printf("%-3d | %-20s | %-3d | %-3s | %-20s\n", 
                   players[i].position,
                   players[i].username,
                   players[i].user_id,
                   is_og ? "Yes" : "No",
                   display_type);
            
            home_displayed++;
        }
        
        if (home_displayed == 0) {
            printf("No HOME team players found\n");
        }
        
        // Display AWAY team
        printf("\nAWAY TEAM:\n");
        printf("%-3s | %-20s | %-3s | %-3s | %-20s\n", "Pos", "Username", "UID", "OG", "Type");
        printf("---------------------------------------------------------\n");
        
        int away_displayed = 0;
        for (int i = 0; i < 8; i++) {
            if (players[i].team != 2) continue;
            
            int birth_year = players[i].birth_year_str[0] != '\0' ? atoi(players[i].birth_year_str) : 0;
            bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
            
            // Check if this is an autoup player with win count
            char display_type[32];
            strncpy(display_type, players[i].checkin_type, sizeof(display_type) - 1);
            display_type[sizeof(display_type) - 1] = '\0';
            
            // If the type starts with "autoup:" format it as "autoup (win streak: X)"
            if (strncmp(players[i].checkin_type, "autoup:", 7) == 0) {
                int win_count = atoi(players[i].checkin_type + 7);
                sprintf(display_type, "autoup (%d win%s)", 
                        win_count, 
                        win_count == 1 ? "" : "s");
            }
            
            printf("%-3d | %-20s | %-3d | %-3s | %-20s\n", 
                   players[i].position,
                   players[i].username,
                   players[i].user_id,
                   is_og ? "Yes" : "No",
                   display_type);
            
            away_displayed++;
        }
        
        if (away_displayed == 0) {
            printf("No AWAY team players found\n");
        }
    }
    
    // Create the game if bCreate is true
    if (bCreate) {
        // Start a transaction
        PQclear(res);
        res = PQexec(conn, "BEGIN");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "BEGIN command failed: %s", PQerrorMessage(conn));
            PQclear(res);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error: Could not start transaction\"\n");
                printf("}\n");
            } else {
                printf("Error: Could not start transaction\n");
            }
            return;
        }
        PQclear(res);
        
        // Create the game
        sprintf(query, 
                "INSERT INTO games (set_id, court, team1_score, team2_score, state, start_time) "
                "VALUES (%d, '%s', 0, 0, 'active', NOW()) RETURNING id", 
                game_set_id, court);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
            fprintf(stderr, "Error creating game: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error: Could not create game\"\n");
                printf("}\n");
            } else {
                printf("Error: Could not create game\n");
            }
            return;
        }
        
        int game_id = atoi(PQgetvalue(res, 0, 0));
        PQclear(res);
        
        // Get available players (not assigned to a game)
        // First get players with team assignments (from previous promotion)
        // then fill the rest in position order
        sprintf(query, 
                "SELECT c.id, c.user_id, u.username, c.queue_position, c.team "
                "FROM checkins c "
                "JOIN users u ON c.user_id = u.id "
                "WHERE c.is_active = true "
                "AND c.game_id IS NULL "
                "AND c.queue_position >= %d "
                "ORDER BY c.team NULLS LAST, c.queue_position ASC "
                "LIMIT 8",
                current_position);
                       printf("bCreate : player query (%s)\n", query);
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) < 8) {
            fprintf(stderr, "Error finding available players: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Not enough available players\"\n");
                printf("}\n");
            } else {
                printf("Error: Not enough available players\n");
            }
            return;
        }
        
        // Sort players based on their team assignment from previous games
        typedef struct {
            int checkin_id;
            int user_id;
            const char *username;
            int queue_position;
            int team;
        } Player;
        
        Player players[8];
        int home_team_count = 0;
        int away_team_count = 0;
        
        // First, collect all players and identify those with pre-assigned teams
        for (int i = 0; i < 8; i++) {
            players[i].checkin_id = atoi(PQgetvalue(res, i, 0));
            players[i].user_id = atoi(PQgetvalue(res, i, 1));
            players[i].username = PQgetvalue(res, i, 2);
            players[i].queue_position = atoi(PQgetvalue(res, i, 3));
            
            // Check if team is assigned (not NULL) from previous game
            if (PQgetisnull(res, i, 4) == 0) {
                players[i].team = atoi(PQgetvalue(res, i, 4));
                
                // Count players per team
                if (players[i].team == 1) {
                    home_team_count++;
                } else if (players[i].team == 2) {
                    away_team_count++;
                }
            } else {
                players[i].team = 0; // No team assignment yet
            }
        }
        
        // Assign teams to players respecting previous assignments
        for (int i = 0; i < 8; i++) {
            int team_to_assign;
            
            if (players[i].team != 0) {
                // Keep existing team assignment
                team_to_assign = players[i].team;
            } else {
                // Assign to team with fewer players
                if (home_team_count < 4) {
                    team_to_assign = 1;
                    home_team_count++;
                } else {
                    team_to_assign = 2;
                    away_team_count++;
                }
            }
            
            // Assign player to game with the determined team
            char update_query[256];
            sprintf(update_query, 
                    "UPDATE checkins SET game_id = %d, team = %d "
                    "WHERE id = %d", 
                    game_id, team_to_assign, players[i].checkin_id);
                    		printf("insert update checkins(%s)\n", update_query);
                    
      
            PGresult *update_res = PQexec(conn, update_query);
            if (PQresultStatus(update_res) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Error assigning player %s to game: %s", players[i].username, PQerrorMessage(conn));
                PQclear(update_res);
                PQclear(res);
                PQexec(conn, "ROLLBACK");
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error: Could not assign player to game\"\n");
                    printf("}\n");
                } else {
                    printf("Error: Could not assign player to game\n");
                }
                return;
            }
            PQclear(update_res);
            
            // Calculate relative position within team (1-4)
            int relative_pos = 1;
            for (int j = 0; j < i; j++) {
                if (players[j].team == team_to_assign) {
                    relative_pos++;
                }
            }
            
            // Insert into game_players
            char insert_query[256];
            sprintf(insert_query, 
                    "INSERT INTO game_players (game_id, user_id, team, relative_position) "
                    "VALUES (%d, %d, %d, %d)",
                    game_id, players[i].user_id, team_to_assign, relative_pos);
            printf("insert game_player(%s)\n", insert_query);
        
            PGresult *insert_res = PQexec(conn, insert_query);
            if (PQresultStatus(insert_res) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Error creating game_player record: %s", PQerrorMessage(conn));
                PQclear(insert_res);
                PQclear(res);
                PQexec(conn, "ROLLBACK");
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error: Could not create game_player record\"\n");
                    printf("}\n");
                } else {
                    printf("Error: Could not create game_player record\n");
                }
                return;
            }
            PQclear(insert_res);
        }
        
        // Set is_active = FALSE for players in the new game
        PQclear(res);
        sprintf(query, 
                "UPDATE checkins SET is_active = FALSE "
                "WHERE game_id = %d "
                "RETURNING id", 
                game_id);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error deactivating player check-ins: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error: Could not deactivate player check-ins\"\n");
                printf("}\n");
            } else {
                printf("Error: Could not deactivate player check-ins\n");
            }
            return;
        }
        
        // Get the players_per_team value from game_set
        int players_per_team = 4; // Default value
        PQclear(res);
        sprintf(query, 
                "SELECT players_per_team FROM game_sets WHERE id = %d", 
                game_set_id);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) > 0) {
            players_per_team = atoi(PQgetvalue(res, 0, 0));
        }
        
        // Update current_queue_position only - queue_next_up should not be changed by new-game
        // current_queue_position should be incremented by (2 * players_per_team) for the players used in this game
        // queue_next_up should remain unchanged as it's only affected by check-ins or end-game
        PQclear(res);
        sprintf(query, 
                "UPDATE game_sets SET "
                "current_queue_position = current_queue_position + %d "
                "WHERE id = %d "
                "RETURNING current_queue_position, queue_next_up", 
                2 * players_per_team, // Increment current_queue_position for both teams
                game_set_id);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error updating queue positions: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error: Could not update queue positions\"\n");
                printf("}\n");
            } else {
                printf("Error: Could not update queue positions\n");
            }
            return;
        }
        
        // Commit the transaction
        PQclear(res);
        res = PQexec(conn, "COMMIT");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error: Transaction failed\"\n");
                printf("}\n");
            } else {
                printf("Error: Transaction failed\n");
            }
            return;
        }
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"SUCCESS\",\n");
            printf("  \"message\": \"Game created successfully\",\n");
            printf("  \"game_id\": %d,\n", game_id);
            printf("  \"court\": \"%s\"\n", court);
            printf("}\n");
        } else {
            printf("Game created successfully (Game ID: %d, Court: %s)\n", game_id, court);
        }
    } else {
        PQclear(res);
    }
}

/**
 * Finalize a game with the given scores
 */
// finalize_game removed as requested

/**
 * Run arbitrary SQL query - function removed as requested
 */
// run_sql_query removed as requested

/**
 * Get comprehensive game set status including active games, next up players, and completed games
 */
void get_game_set_status(PGconn *conn, int game_set_id, const char *format) {
    char query[4096];
    PGresult *res;
    
    // Get game set details
    sprintf(query, "SELECT id, created_by, gym, number_of_courts, max_consecutive_games, "
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
    
    // Store more game set details for info section
    char *creator = PQgetvalue(res, 0, 1);
    char *gym = PQgetvalue(res, 0, 2);
    char *number_of_courts = PQgetvalue(res, 0, 3);
    char *created_at = PQgetvalue(res, 0, 7);
    
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
        
        // Add game-set-info section with details from active-game-set
        printf("  \"game_set_info\": {\n");
        printf("    \"id\": %d,\n", game_set_id);
        printf("    \"created_by\": \"%s\",\n", creator);
        printf("    \"gym\": \"%s\",\n", gym);
        printf("    \"number_of_courts\": %s,\n", number_of_courts);
        printf("    \"max_consecutive_games\": %d,\n", max_consecutive_games);
        printf("    \"current_queue_position\": %d,\n", current_position);
        printf("    \"queue_next_up\": %d,\n", queue_next_up);
        printf("    \"created_at\": \"%s\",\n", created_at);
        printf("    \"is_active\": %s\n", is_active ? "true" : "false");
        printf("  },\n");
        
        // Get active games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.start_time "
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
            printf("      \"start_time\": \"%s\",\n", PQgetvalue(res, i, 4));
            
            // Get players for this game
            char player_query[1024];
            sprintf(player_query, 
                    "SELECT gp.team, u.id, u.username, u.birth_year, c.queue_position "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "JOIN checkins c ON c.user_id = gp.user_id AND c.game_id = gp.game_id "
                    "WHERE gp.game_id = %d "
                    "ORDER BY gp.team, c.queue_position",
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
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.start_time, g.end_time "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'completed' "
                "ORDER BY g.end_time DESC "
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
            printf("      \"start_time\": \"%s\",\n", PQgetvalue(res, i, 4));
            printf("      \"completed_at\": \"%s\",\n", PQgetvalue(res, i, 5));
            
            // Get players for this completed game
            char player_query[1024];
            sprintf(player_query, 
                    "SELECT gp.team, u.id, u.username, u.birth_year, c.queue_position, c.type "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "LEFT JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                    "WHERE gp.game_id = %d "
                    "ORDER BY gp.team, c.queue_position",
                    game_id);
            
            PGresult *player_res = PQexec(conn, player_query);
            if (PQresultStatus(player_res) == PGRES_TUPLES_OK) {
                printf("      \"players\": [\n");
                
                int player_count = PQntuples(player_res);
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    const char *queue_pos_str = PQgetvalue(player_res, j, 4);
                    const char *checkin_type = PQgetvalue(player_res, j, 5);
                    
                    int position = queue_pos_str[0] != '\0' ? atoi(queue_pos_str) : j + 1;
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
                    printf("          \"is_og\": %s", is_og ? "true" : "false");
                    if (checkin_type[0] != '\0') {
                        printf(",\n          \"checkin_type\": \"%s\"\n", checkin_type);
                    } else {
                        printf("\n");
                    }
                    printf("        }%s\n", j < player_count - 1 ? "," : "");
                }
                
                printf("      ]\n");
            } else {
                fprintf(stderr, "Error getting players for completed game %d: %s", 
                        game_id, PQerrorMessage(conn));
                printf("      \"players\": []\n");
            }
            PQclear(player_res);
            
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
        
        // Add game-set-info section with details from active-game-set
        printf("==== Game Set Info ====\n");
        printf("ID: %d\n", game_set_id);
        printf("Created by: %s\n", creator);
        printf("Gym: %s\n", gym);
        printf("Number of courts: %s\n", number_of_courts);
        printf("Max consecutive games: %d\n", max_consecutive_games);
        printf("Current queue position: %d\n", current_position);
        printf("Queue next up: %d\n", queue_next_up);
        printf("Created at: %s\n", created_at);
        printf("Active: %s\n\n", is_active ? "Yes" : "No");
        
        // Get active games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.start_time "
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
            char player_query[1024];
            sprintf(player_query, 
                    "SELECT gp.team, u.id, u.username, u.birth_year, c.queue_position, c.type "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                    "WHERE gp.game_id = %d "
                    "ORDER BY gp.team, c.queue_position",
                    game_id);
            
            PGresult *player_res = PQexec(conn, player_query);
            if (PQresultStatus(player_res) == PGRES_TUPLES_OK) {
                printf("\n");
                printf("HOME TEAM:\n");
                printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
                printf("--------------------------------------------------\n");
                
                // Print Team 1 (HOME)
                int found = 0;
                for (int j = 0; j < PQntuples(player_res); j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    if (team != 1) continue;
                    
                    found = 1;
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    const char *queue_pos_str = PQgetvalue(player_res, j, 4);
                    const char *checkin_type = PQgetvalue(player_res, j, 5);
                    
                    int queue_pos = queue_pos_str[0] != '\0' ? atoi(queue_pos_str) : 0;
                    int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                    
                    printf("%-3d | %-20s | %-3d | %-3s | %-10s\n", 
                           queue_pos, username, user_id, 
                           is_og ? "Yes" : "No", 
                           checkin_type != NULL && checkin_type[0] != '\0' ? checkin_type : "HOME");
                }
                
                if (!found) {
                    printf("No HOME team players found\n");
                }
                
                printf("\nAWAY TEAM:\n");
                printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
                printf("--------------------------------------------------\n");
                
                // Print Team 2 (AWAY)
                found = 0;
                for (int j = 0; j < PQntuples(player_res); j++) {
                    int team = atoi(PQgetvalue(player_res, j, 0));
                    if (team != 2) continue;
                    
                    found = 1;
                    int user_id = atoi(PQgetvalue(player_res, j, 1));
                    const char *username = PQgetvalue(player_res, j, 2);
                    const char *birth_year_str = PQgetvalue(player_res, j, 3);
                    const char *queue_pos_str = PQgetvalue(player_res, j, 4);
                    const char *checkin_type = PQgetvalue(player_res, j, 5);
                    
                    int queue_pos = queue_pos_str[0] != '\0' ? atoi(queue_pos_str) : 0;
                    int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                    bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                    
                    printf("%-3d | %-20s | %-3d | %-3s | %-10s\n", 
                           queue_pos, username, user_id, 
                           is_og ? "Yes" : "No", 
                           checkin_type != NULL && checkin_type[0] != '\0' ? checkin_type : "AWAY");
                }
                
                if (!found) {
                    printf("No AWAY team players found\n");
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
        
        // Get completed games
        sprintf(query, 
                "SELECT g.id, g.court, g.team1_score, g.team2_score, g.start_time, g.end_time "
                "FROM games g "
                "WHERE g.set_id = %d AND g.state = 'completed' "
                "ORDER BY g.end_time DESC "
                "LIMIT 5",
                game_set_id);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting completed games: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        int completed_count = PQntuples(res);
        printf("==== Completed Games (%d) ====\n", completed_count);
        
        if (completed_count > 0) {
            for (int i = 0; i < completed_count; i++) {
                int game_id = atoi(PQgetvalue(res, i, 0));
                const char *court = PQgetvalue(res, i, 1);
                int team1_score = atoi(PQgetvalue(res, i, 2));
                int team2_score = atoi(PQgetvalue(res, i, 3));
                const char *start_time = PQgetvalue(res, i, 4);
                const char *end_time = PQgetvalue(res, i, 5);
                
                // Calculate duration if both timestamps are valid
                char duration[64] = "Unknown";
                if (start_time[0] != '\0' && end_time[0] != '\0') {
                    struct tm tm_start = {0}, tm_end = {0};
                    time_t t_start, t_end;
                    
                    // Parse timestamps - strptime returns char* so we compare to NULL
                    char *start_res = strptime(start_time, "%Y-%m-%d %H:%M:%S", &tm_start);
                    char *end_res = strptime(end_time, "%Y-%m-%d %H:%M:%S", &tm_end);
                    if (start_res != NULL && end_res != NULL) {
                        t_start = mktime(&tm_start);
                        t_end = mktime(&tm_end);
                        int diff_seconds = (int)difftime(t_end, t_start);
                        
                        sprintf(duration, "%d:%02d", diff_seconds / 60, diff_seconds % 60);
                    }
                }
                
                printf("\nGame #%d on Court %s (Score: %d-%d, Duration: %s)\n", 
                       game_id, court, team1_score, team2_score, duration);
                
                // Get players for this game
                char player_query[1024];
                sprintf(player_query, 
                        "SELECT gp.team, u.id, u.username, u.birth_year, c.queue_position, c.type "
                        "FROM game_players gp "
                        "JOIN users u ON gp.user_id = u.id "
                        "JOIN checkins c ON gp.user_id = c.user_id AND c.game_id = gp.game_id "
                        "WHERE gp.game_id = %d "
                        "ORDER BY gp.team, c.queue_position",
                        game_id);
                
                PGresult *player_res = PQexec(conn, player_query);
                if (PQresultStatus(player_res) == PGRES_TUPLES_OK) {
                    // Print HOME team with win/loss/tie indicator
                    const char* homeResult;
                    if (team1_score > team2_score) 
                        homeResult = "(WIN)";
                    else if (team1_score < team2_score)
                        homeResult = "(LOSS)";
                    else
                        homeResult = "(TIE)";
                    printf("\nHOME TEAM: %s\n", homeResult);
                    printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
                    printf("--------------------------------------------------\n");
                    
                    // Print Team 1 (HOME)
                    int found = 0;
                    for (int j = 0; j < PQntuples(player_res); j++) {
                        int team = atoi(PQgetvalue(player_res, j, 0));
                        if (team != 1) continue;
                        
                        found = 1;
                        int user_id = atoi(PQgetvalue(player_res, j, 1));
                        const char *username = PQgetvalue(player_res, j, 2);
                        const char *birth_year_str = PQgetvalue(player_res, j, 3);
                        const char *queue_pos_str = PQgetvalue(player_res, j, 4);
                        const char *checkin_type = PQgetvalue(player_res, j, 5);
                        
                        int queue_pos = queue_pos_str[0] != '\0' ? atoi(queue_pos_str) : 0;
                        int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                        bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                        
                        printf("%-3d | %-20s | %-3d | %-3s | %-10s\n", 
                               queue_pos, username, user_id, 
                               is_og ? "Yes" : "No", 
                               checkin_type != NULL && checkin_type[0] != '\0' ? checkin_type : "HOME");
                    }
                    
                    if (!found) {
                        printf("No HOME team players found\n");
                    }
                    
                    // Print AWAY team with win/loss/tie indicator
                    const char* awayResult;
                    if (team1_score < team2_score) 
                        awayResult = "(WIN)";
                    else if (team1_score > team2_score)
                        awayResult = "(LOSS)";
                    else
                        awayResult = "(TIE)";
                    printf("\nAWAY TEAM: %s\n", awayResult);
                    printf("%-3s | %-20s | %-3s | %-3s | %-10s\n", "Pos", "Username", "UID", "OG", "Type");
                    printf("--------------------------------------------------\n");
                    
                    found = 0;
                    for (int j = 0; j < PQntuples(player_res); j++) {
                        int team = atoi(PQgetvalue(player_res, j, 0));
                        if (team != 2) continue;
                        
                        found = 1;
                        int user_id = atoi(PQgetvalue(player_res, j, 1));
                        const char *username = PQgetvalue(player_res, j, 2);
                        const char *birth_year_str = PQgetvalue(player_res, j, 3);
                        const char *queue_pos_str = PQgetvalue(player_res, j, 4);
                        const char *checkin_type = PQgetvalue(player_res, j, 5);
                        
                        int queue_pos = queue_pos_str[0] != '\0' ? atoi(queue_pos_str) : 0;
                        int birth_year = birth_year_str[0] != '\0' ? atoi(birth_year_str) : 0;
                        bool is_og = birth_year > 0 && birth_year <= OG_BIRTH_YEAR;
                        
                        printf("%-3d | %-20s | %-3d | %-3s | %-10s\n", 
                               queue_pos, username, user_id, 
                               is_og ? "Yes" : "No", 
                               checkin_type != NULL && checkin_type[0] != '\0' ? checkin_type : "AWAY");
                    }
                    
                    if (!found) {
                        printf("No AWAY team players found\n");
                    }
                }
                PQclear(player_res);
            }
        } else {
            printf("No completed games\n");
        }
    }
    
    PQclear(res);
}

/**
 * Compare two specific teams to see if they are the same
 * For now, teams are the same if all players are the same
 * Returns true if teams are the same, false otherwise
 */
bool team_compare_specific(PGconn *conn, int game1_id, int team1, int game2_id, int team2) {
    char query[4096];
    PGresult *res;
    
    // Get player IDs for both teams
    sprintf(query, 
            "WITH team1_players AS ( "
            "  SELECT array_agg(user_id ORDER BY user_id) AS player_ids "
            "  FROM game_players "
            "  WHERE game_id = %d AND team = %d "
            "), "
            "team2_players AS ( "
            "  SELECT array_agg(user_id ORDER BY user_id) AS player_ids "
            "  FROM game_players "
            "  WHERE game_id = %d AND team = %d "
            ") "
            "SELECT "
            "  team1_players.player_ids = team2_players.player_ids AS same_team "
            "FROM team1_players, team2_players",
            game1_id, team1, game2_id, team2);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        // In case of error, return false
        PQclear(res);
        return false;
    }
    
    // Get the result (true or false)
    bool same_team = strcmp(PQgetvalue(res, 0, 0), "t") == 0;
    PQclear(res);
    
    return same_team;
}



/**
 * End game and optionally auto-promote players
 */
void end_game(PGconn *conn, int game_id, int home_score, int away_score, bool autopromote, const char *status_format) {
    char query[4096];
    PGresult *res;
    
    // Set default status_format to "none" if not provided
    if (status_format == NULL) {
        status_format = "none";
    }
    
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
    
    // Update game with scores, end time, and mark as completed
    sprintf(query, 
            "UPDATE games "
            "SET team1_score = %d, team2_score = %d, state = 'completed', end_time = NOW() "
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
        // Determine winning team (1 = HOME, 2 = AWAY, 0 = TIE)
        int winning_team = 0;
        int losing_team = 0;
        
        if (home_score > away_score) {
            winning_team = 1;
            losing_team = 2;
        } else if (away_score > home_score) {
            winning_team = 2;
            losing_team = 1;
        } else {
            // In case of a tie, randomly select a team to be "winning" for promotion purposes
            // Using time as a simple randomizer
            winning_team = (time(NULL) % 2) + 1;
            losing_team = winning_team == 1 ? 2 : 1;
            printf("Game ended in a tie. Randomly selecting Team %d for promotion logic.\n", winning_team);
        }
        
        // Count consecutive wins for winning team
        // First, get the player IDs for the winning team
        sprintf(query, 
                "SELECT array_agg(user_id) AS player_ids "
                "FROM game_players "
                "WHERE game_id = %d AND team = %d",
                game_id, winning_team);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
            fprintf(stderr, "Error getting winning team players: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        // Get the player array
        const char *player_array = PQgetvalue(res, 0, 0);
        PQclear(res);
        
        // Get the previous games with the same team
        // Count number of times this exact team has played, win or lose
        // This is to enforce max_consecutive_games correctly
        sprintf(query, 
                "WITH game_teams AS ( "
                "  SELECT g.id, "
                "         array_agg(user_id) FILTER (WHERE team = 1) AS team1_players, "
                "         array_agg(user_id) FILTER (WHERE team = 2) AS team2_players, "
                "         (CASE "
                "           WHEN g.team1_score > g.team2_score THEN 1 "
                "           WHEN g.team2_score > g.team1_score THEN 2 "
                "           ELSE (CASE WHEN RANDOM() < 0.5 THEN 1 ELSE 2 END) "
                "         END) AS winning_team "
                "  FROM games g "
                "  JOIN game_players gp ON g.id = gp.game_id "
                "  WHERE g.set_id = %d "
                "  AND g.state = 'completed' "
                "  AND g.id < %d " // Only count games before this one
                "  GROUP BY g.id, g.team1_score, g.team2_score "
                "  ORDER BY g.id DESC "
                ") "
                "SELECT COUNT(*) "
                "FROM game_teams gt "
                "WHERE (gt.team1_players = '%s'::int[] OR gt.team2_players = '%s'::int[])",
                set_id, game_id, player_array, player_array);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error checking team history: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            return;
        }
        
        int consecutive_games = atoi(PQgetvalue(res, 0, 0)) + 1; // +1 for the current game
        printf("Team has played %d consecutive games (including current)\n", consecutive_games);
        PQclear(res);
        
        // Check if any players in the winning team were previously loss_promoted
        // This would indicate they should now go to autoup instead of being win_promoted again
        bool winning_team_was_previously_loss_promoted = false;
        
        // Get the player IDs for the winning team and their previous check-in types
        sprintf(query, 
                "SELECT COUNT(*) FROM checkins c "
                "JOIN game_players gp ON gp.user_id = c.user_id AND gp.game_id = %d "
                "WHERE gp.team = %d AND c.type LIKE 'loss_promoted%%' "
                "AND c.is_active = true",
                game_id, winning_team);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) > 0) {
            int match_count = atoi(PQgetvalue(res, 0, 0));
            if (match_count > 0) {
                winning_team_was_previously_loss_promoted = true;
                printf("Winning team was previously loss_promoted (found %d matching players)\n", match_count);
            }
        }
        PQclear(res);
        
        // Determine which team to promote
        int team_to_promote;
        char promotion_type[32]; // Use a buffer to store the promotion type with win count
        
        if (winning_team_was_previously_loss_promoted) {
            // If winning team was previously loss_promoted, now promote the losing team
            team_to_promote = losing_team;
            // Add team designation (H or A) based on the team being promoted
            sprintf(promotion_type, "loss_promoted:%d", consecutive_games);
            printf("Winning team was previously loss_promoted - now promoting losers\n");
        } else if (consecutive_games < max_consecutive_games) {
            team_to_promote = winning_team;
            // Store the consecutive game count in the promotion type
            sprintf(promotion_type, "win_promoted:%d", consecutive_games);
            printf("Team has played %d consecutive games (max: %d) - promoting winners\n", 
                   consecutive_games, max_consecutive_games);
        } else {
            team_to_promote = losing_team;
            // Store the consecutive game count in the promotion type
            sprintf(promotion_type, "loss_promoted:%d", consecutive_games);
            printf("Team has reached max consecutive games (%d) - promoting losers\n", 
                   max_consecutive_games);
        }
        
        // Mark all players in the game as inactive in checkins and reset game_id
        sprintf(query, 
                "UPDATE checkins c "
                "SET is_active = false, game_id = NULL "
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
                "SELECT gp.user_id, u.username, u.autoup, gp.team "
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
            int player_team = atoi(PQgetvalue(res, i, 3));
            // We don't need relative_position anymore since we're using sequential numbers
            
            // Calculate new queue position sequentially for all players, not just by relative position
            // This ensures promoted players get positions 9, 10, 11, 12 instead of all getting position 9
            int new_position = current_queue_position + i;
            
            // Create promotion type with team designation (H or A)
            char player_promotion_type[64];
            const char* team_designation = (player_team == 1) ? "H" : "A";
            
            // e.g., "win_promoted:1:H" or "loss_promoted:2:A"
            if (strncmp(promotion_type, "win_promoted", 12) == 0) {
                sprintf(player_promotion_type, "win_promoted:%d:%s", consecutive_games, team_designation);
            } else {
                sprintf(player_promotion_type, "loss_promoted:%d:%s", consecutive_games, team_designation);
            }
            
            // Store the team for promoted players so they can play on the same team next time
            // For loss-promoted players, we want to maintain their original team assignment
            char insert_query[512];
            sprintf(insert_query, 
                    "INSERT INTO checkins (user_id, game_set_id, club_index, queue_position, is_active, type, team, check_in_time, check_in_date) "
                    "VALUES (%d, %d, 34, %d, true, '%s', %d, NOW(), TO_CHAR(NOW(), 'YYYY-MM-DD')) "
                    "RETURNING id",
                    user_id, set_id, new_position, player_promotion_type, player_team);
            
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
        
        // First, update the game_sets.queue_next_up to correctly reflect the 
        // positions after win_promoted players have been added
        // Increment queue_next_up by the actual number of players promoted
        sprintf(query, 
                "UPDATE game_sets SET queue_next_up = queue_next_up + %d "
                "WHERE id = %d "
                "RETURNING queue_next_up",
                player_count, set_id);
        
        PGresult *update_next_up_res = PQexec(conn, query);
        if (PQresultStatus(update_next_up_res) == PGRES_TUPLES_OK) {
            // Get the updated queue_next_up
            queue_next_up = atoi(PQgetvalue(update_next_up_res, 0, 0));
            printf("Updated queue_next_up to %d after handling win_promoted players\n", queue_next_up);
        } else {
            fprintf(stderr, "Error updating queue_next_up: %s", PQerrorMessage(conn));
        }
        PQclear(update_next_up_res);
        
        // Get players from the non-promoted team who have autoup=true or were previously loss_promoted
        // This will be the winning team if we're doing loss promotion
        // or the losing team if we're doing win promotion
        // Special case: if winning team was previously loss_promoted, they should now autoup
        int team_with_autoup = (team_to_promote == losing_team) ? winning_team : losing_team;
        
        // If winning team was previously loss_promoted, they should all be auto-upped regardless of autoup setting
        bool force_autoup_winning_team = winning_team_was_previously_loss_promoted;
        
        // Modified query to include either:
        // 1. Players with autoup=true (normally)
        // 2. ALL players from winning team if they were previously loss_promoted
        if (force_autoup_winning_team && team_with_autoup == winning_team) {
            sprintf(query, 
                    "SELECT gp.user_id, u.username "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = %d AND gp.team = %d "
                    "ORDER BY gp.relative_position",
                    game_id, team_with_autoup);
            printf("Auto-checking ALL players from previously loss_promoted winning team\n");
        } else {
            sprintf(query, 
                    "SELECT gp.user_id, u.username "
                    "FROM game_players gp "
                    "JOIN users u ON gp.user_id = u.id "
                    "WHERE gp.game_id = %d AND gp.team = %d "
                    "AND u.autoup = true "
                    "ORDER BY gp.relative_position",
                    game_id, team_with_autoup);
        }
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error getting auto-up players: %s", PQerrorMessage(conn));
            PQclear(res);
        } else {
            int autoup_count = PQntuples(res);
            
            if (autoup_count > 0) {
                if (force_autoup_winning_team && team_with_autoup == winning_team) {
                    printf("Auto-checking in %d players from winning team (previously loss_promoted):\n", autoup_count);
                } else {
                    printf("Auto-checking in %d players with autoup=true:\n", autoup_count);
                }
                
                // Use the existing queue_next_up value that was already updated earlier
                // This ensures auto-checked in players come after both existing and promoted players
                printf("Using queue_next_up: %d for auto-checking in players\n", queue_next_up);
                
                for (int i = 0; i < autoup_count; i++) {
                    int user_id = atoi(PQgetvalue(res, i, 0));
                    const char *username = PQgetvalue(res, i, 1);
                    
                    // First, increment queue_next_up for each autoup player
                    sprintf(query, 
                            "UPDATE game_sets SET queue_next_up = queue_next_up + 1 "
                            "WHERE id = %d "
                            "RETURNING queue_next_up",
                            set_id);
                            
                    PGresult *update_next_up = PQexec(conn, query);
                    if (PQresultStatus(update_next_up) != PGRES_TUPLES_OK) {
                        fprintf(stderr, "Error updating queue_next_up: %s", PQerrorMessage(conn));
                        PQclear(update_next_up);
                        continue;
                    }
                    
                    // Get the updated queue_next_up to use for this player
                    int current_position = atoi(PQgetvalue(update_next_up, 0, 0)) - 1;
                    PQclear(update_next_up);
                    
                    char insert_query[512];
                    
                    // Create autoup type with consecutive game count, e.g., "autoup:2:H" for players from team Home with 2 games
                    char autoup_type[32];
                    const char* team_designation = (team_with_autoup == 1) ? "H" : "A";
                    sprintf(autoup_type, "autoup:%d:%s", consecutive_games, team_designation);
                    
                    sprintf(insert_query, 
                            "INSERT INTO checkins (user_id, game_set_id, club_index, queue_position, is_active, type, team, check_in_time, check_in_date) "
                            "VALUES (%d, %d, 34, %d, true, '%s', %d, NOW(), TO_CHAR(NOW(), 'YYYY-MM-DD')) "
                            "RETURNING id",
                            user_id, set_id, current_position, autoup_type, team_with_autoup);
                    
                    PGresult *insert_res = PQexec(conn, insert_query);
                    if (PQresultStatus(insert_res) != PGRES_TUPLES_OK) {
                        fprintf(stderr, "Error auto-checking in %s: %s", 
                                username, PQerrorMessage(conn));
                        PQclear(insert_res);
                        continue;
                    }
                    
                    printf("- %s auto-checked in at position %d\n", username, current_position);
                    
                    PQclear(insert_res);
                }
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
    
    // Output information based on format
    if (strcmp(status_format, "text") == 0 || strcmp(status_format, "json") == 0) {
        // Print basic game ending message
        printf("Game %d successfully ended with score: %d-%d\n", game_id, home_score, away_score);
        
        // Instead of our custom format, use the game-set-status function to provide 
        // consistent output with new-game command
        get_game_set_status(conn, set_id, status_format);
    } else {
        // For "none" format, just print the basic message
        printf("Game %d successfully ended\n", game_id);
    }
    
    PQclear(res);
}

/**
 * Bump a player to swap positions with the next player below in the queue
 * Takes game_set_id, queue_position, and user_id to verify the correct player
 * Returns status information in the specified format
 */
void bump_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format) {
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
    
    // First, verify that the player with the given user_id is at the specified queue_position
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, c.queue_position "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.game_set_id = %d AND c.is_active = true "
            "AND c.queue_position = %d AND c.user_id = %d",
            game_set_id, queue_position, user_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error verifying player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "No player with user ID %d found at position %d in game set %d\n", 
                user_id, queue_position, game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int current_checkin_id = atoi(PQgetvalue(res, 0, 0));
    const char *username = PQgetvalue(res, 0, 2);
    PQclear(res);
    
    // Check if there is a next player below in the queue to swap with
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, c.queue_position "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.game_set_id = %d AND c.is_active = true "
            "AND c.queue_position > %d "
            "ORDER BY c.queue_position ASC "
            "LIMIT 1",
            game_set_id, queue_position);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error finding next player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        printf("No player below position %d in the queue to swap with\n", queue_position);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int next_checkin_id = atoi(PQgetvalue(res, 0, 0));
    int next_user_id = atoi(PQgetvalue(res, 0, 1));
    const char *next_username = PQgetvalue(res, 0, 2);
    int next_position = atoi(PQgetvalue(res, 0, 3));
    PQclear(res);
    
    // Swap the queue positions of the two players
    sprintf(query, 
            "UPDATE checkins SET queue_position = %d WHERE id = %d",
            next_position, current_checkin_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error updating current player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    sprintf(query, 
            "UPDATE checkins SET queue_position = %d WHERE id = %d",
            queue_position, next_checkin_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error updating next player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
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
    
    printf("Successfully bumped player %s (ID: %d) from position %d to position %d, "
           "swapping with %s (ID: %d)\n", 
           username, user_id, queue_position, next_position, 
           next_username, next_user_id);
    
    // Output additional status information based on format
    if (strcmp(status_format, "text") == 0 || strcmp(status_format, "json") == 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
}

/**
 * Move a player to the bottom of the queue (end of the line)
 * This function verifies the player is at the specified position and has the correct user_id,
 * then moves that player to the end of the queue, decrementing all higher queue positions
 * 
 * @param conn Database connection
 * @param game_set_id Game set ID
 * @param queue_position Current queue position of the player
 * @param user_id User ID of the player to move
 * @param status_format Format to display game set status after moving (none|text|json)
 */
void bottom_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format) {
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
    
    // First, verify that the player with the given user_id is at the specified queue_position
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, c.queue_position "
            "FROM checkins c "
            "JOIN users u ON c.user_id = u.id "
            "WHERE c.game_set_id = %d AND c.is_active = true "
            "AND c.queue_position = %d AND c.user_id = %d",
            game_set_id, queue_position, user_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error verifying player: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "No player with user ID %d found at position %d in game set %d\n", 
                user_id, queue_position, game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int current_checkin_id = atoi(PQgetvalue(res, 0, 0));
    const char *username = PQgetvalue(res, 0, 2);
    PQclear(res);
    
    // Get the current queue_next_up value from the game set
    sprintf(query, 
            "SELECT queue_next_up "
            "FROM game_sets "
            "WHERE id = %d AND is_active = true",
            game_set_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting game set info: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "No active game set found with ID %d\n", game_set_id);
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int queue_next_up = atoi(PQgetvalue(res, 0, 0));
    int new_position = queue_next_up - 1; // Position at the end of the queue
    PQclear(res);
    
    // If player is already at the bottom, no need to rearrange
    if (queue_position == new_position) {
        printf("Player %s is already at the bottom of the queue (position %d)\n", 
               username, queue_position);
        PQexec(conn, "ROLLBACK");
        
        // Output additional status information based on format
        if (strcmp(status_format, "text") == 0 || strcmp(status_format, "json") == 0) {
            get_game_set_status(conn, game_set_id, status_format);
        }
        return;
    }
    
    // Decrement queue positions for players after the current player
    sprintf(query, 
            "UPDATE checkins "
            "SET queue_position = queue_position - 1 "
            "WHERE game_set_id = %d AND is_active = true "
            "AND queue_position > %d",
            game_set_id, queue_position);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error updating players' positions: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int adjusted_positions = atoi(PQcmdTuples(res));
    PQclear(res);
    
    // Now move the player to the bottom of the queue
    sprintf(query, 
            "UPDATE checkins "
            "SET queue_position = %d "
            "WHERE id = %d",
            new_position, current_checkin_id);
            
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error moving player to bottom: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT command failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    printf("Successfully moved player %s (ID: %d) from position %d to the bottom (position %d)\n"
           "Adjusted positions for %d other player(s)\n", 
           username, user_id, queue_position, new_position, adjusted_positions);
    
    // Output additional status information based on format
    if (strcmp(status_format, "text") == 0 || strcmp(status_format, "json") == 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
}

/**
 * Compare two teams to see if they are the same
 * Returns true if all players are the same on both teams
 */
// Legacy version that uses the more specific team_compare_specific function
bool team_compare(PGconn *conn, int game_id1, int game_id2) {
    // Compare both teams (team 1 to team 1 and team 2 to team 2)
    bool same_team1 = team_compare_specific(conn, game_id1, 1, game_id2, 1);
    bool same_team2 = team_compare_specific(conn, game_id1, 2, game_id2, 2);
    
    // Teams are the same if both team 1 and team 2 are the same
    return same_team1 && same_team2;
}

/**
 * New implementation of team_compare that compares player arrays
 * Returns true if the player arrays are identical
 * 
 * This implementation creates local copies of the arrays before sorting,
 * ensuring that the original arrays are not modified during comparison.
 */
bool compare_player_arrays(PGconn *conn, int team1_players[], int team1_size, int team2_players[], int team2_size) {
    // If team sizes are different, they can't be the same team
    if (team1_size != team2_size) {
        return false;
    }
    
    // Create copies of the arrays to sort without modifying originals
    int team1_sorted[team1_size];
    int team2_sorted[team2_size];
    
    for (int i = 0; i < team1_size; i++) {
        team1_sorted[i] = team1_players[i];
    }
    
    for (int i = 0; i < team2_size; i++) {
        team2_sorted[i] = team2_players[i];
    }
    
    // Sort player IDs for easy comparison
    for (int i = 0; i < team1_size - 1; i++) {
        for (int j = 0; j < team1_size - i - 1; j++) {
            if (team1_sorted[j] > team1_sorted[j + 1]) {
                int temp = team1_sorted[j];
                team1_sorted[j] = team1_sorted[j + 1];
                team1_sorted[j + 1] = temp;
            }
        }
    }
    
    for (int i = 0; i < team2_size - 1; i++) {
        for (int j = 0; j < team2_size - i - 1; j++) {
            if (team2_sorted[j] > team2_sorted[j + 1]) {
                int temp = team2_sorted[j];
                team2_sorted[j] = team2_sorted[j + 1];
                team2_sorted[j + 1] = temp;
            }
        }
    }
    
    // Compare each player ID
    for (int i = 0; i < team1_size; i++) {
        if (team1_sorted[i] != team2_sorted[i]) {
            return false;
        }
    }
    
    return true;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Successfully connected to the database\n");
        printf("Usage: %s <command> [args...]\n", argv[0]);
        printf("Available commands:\n");
        printf("  users - List all users\n");
        printf("  checkout <game_set_id> <queue_position> <user_id> [format] - Check out a player from the queue and adjust queue positions (format: none|text|json, default: none)\n");
        printf("  player <username> [format] - Show detailed information about a player (format: text|json, default: text)\n");
        printf("  next-up [game_set_id] [format] - List next-up players for game set (format: text|json, default: text)\n");
        printf("  propose-game <game_set_id> <court> [format] - Propose a new game without creating it (format: text|json, default: text)\n");
        printf("  new-game <game_set_id> <court> [format] - Create a new game with next available players (format: text|json, default: text)\n");
        printf("  game-set-status <game_set_id> [json|text] - Show the status of a game set, including game set info, active games, next-up players, and completed games\n");
        printf("  end-game <game_id> <home_score> <away_score> [autopromote] [format] - End a game with the given scores and return the game set status (autopromote: true/false, default is true; format: none|text|json, default is none)\n");
        printf("  bump-player <game_set_id> <queue_position> <user_id> [format] - Swap a player with the next player below in the queue (format: none|text|json, default is none)\n");
        printf("  bottom-player <game_set_id> <queue_position> <user_id> [format] - Move a player to the bottom of the queue (format: none|text|json, default is none)\n");
        printf("  checkin <game_set_id> <user_id> [format] - Check in a player to a game set by user ID (format: none|text|json, default: none)\n");
        printf("  checkin-by-username <game_set_id> <username> [format] - Check in a player to a game set by username (format: none|text|json, default: none)\n");
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
    } else if (strcmp(command, "checkout") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s checkout <game_set_id> <queue_position> <user_id> [format]\n", argv[0]);
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  Checks out a player from the queue and adjusts positions of players below\n");
        } else {
            int game_set_id = atoi(argv[2]);
            if (game_set_id <= 0) {
                fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
                PQfinish(conn);
                return 1;
            }
            
            int queue_position = atoi(argv[3]);
            if (queue_position <= 0) {
                fprintf(stderr, "Invalid queue_position: %s\n", argv[3]);
                PQfinish(conn);
                return 1;
            }
            
            int user_id = atoi(argv[4]);
            if (user_id < 0) {
                fprintf(stderr, "Invalid user_id: %s\n", argv[4]);
                PQfinish(conn);
                return 1;
            }
            
            // Get output format (default is none)
            const char *status_format = "none";
            if (argc >= 6) {
                status_format = argv[5];
                if (strcmp(status_format, "none") != 0 && strcmp(status_format, "text") != 0 && strcmp(status_format, "json") != 0) {
                    fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", status_format);
                    PQfinish(conn);
                    return 1;
                }
            }
            
            checkout_player(conn, game_set_id, queue_position, user_id, status_format);
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
                    propose_game(conn, game_set_id, court, format, false, format);
                }
            }
        }
    } else if (strcmp(command, "new-game") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Usage: %s new-game <game_set_id> <court> [format]\n", argv[0]);
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
                    propose_game(conn, game_set_id, court, format, true, format);
                }
            }
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
            fprintf(stderr, "Usage: %s end-game <game_id> <home_score> <away_score> [autopromote] [format]\n", argv[0]);
            fprintf(stderr, "  autopromote: true|false (default: true)\n");
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  When format is text or json, returns complete game set status info\n");
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
        const char *status_format = "none";
        
        // Check if we have an autopromote argument
        if (argc >= 6) {
            if (strcmp(argv[5], "false") == 0) {
                autopromote = false;
            } else if (strcmp(argv[5], "true") == 0) {
                autopromote = true;
            } else if (strcmp(argv[5], "none") == 0 || strcmp(argv[5], "text") == 0 || strcmp(argv[5], "json") == 0) {
                // This is actually the format parameter
                status_format = argv[5];
            } else {
                fprintf(stderr, "Invalid parameter: %s (expected 'true', 'false', 'none', 'text', or 'json')\n", argv[5]);
                PQfinish(conn);
                return 1;
            }
        }
        
        // Check if we have a format argument (after autopromote)
        if (argc >= 7) {
            if (strcmp(argv[6], "none") == 0 || strcmp(argv[6], "text") == 0 || strcmp(argv[6], "json") == 0) {
                status_format = argv[6];
            } else {
                fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", argv[6]);
                PQfinish(conn);
                return 1;
            }
        }
        
        end_game(conn, game_id, home_score, away_score, autopromote, status_format);
    } else if (strcmp(command, "bump-player") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s bump-player <game_set_id> <queue_position> <user_id> [format]\n", argv[0]);
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  Swaps a player with the next player below in the queue\n");
            PQfinish(conn);
            return 1;
        }
        
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        int queue_position = atoi(argv[3]);
        if (queue_position <= 0) {
            fprintf(stderr, "Invalid queue_position: %s\n", argv[3]);
            PQfinish(conn);
            return 1;
        }
        
        int user_id = atoi(argv[4]);
        if (user_id < 0) {
            fprintf(stderr, "Invalid user_id: %s\n", argv[4]);
            PQfinish(conn);
            return 1;
        }
        
        // Get output format (default is none)
        const char *status_format = "none";
        if (argc >= 6) {
            status_format = argv[5];
            if (strcmp(status_format, "none") != 0 && strcmp(status_format, "text") != 0 && strcmp(status_format, "json") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", status_format);
                PQfinish(conn);
                return 1;
            }
        }
        
        bump_player(conn, game_set_id, queue_position, user_id, status_format);
    } else if (strcmp(command, "bottom-player") == 0) {
        if (argc < 5) {
            fprintf(stderr, "Usage: %s bottom-player <game_set_id> <queue_position> <user_id> [format]\n", argv[0]);
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  Moves a player to the bottom of the queue (end of the line)\n");
            PQfinish(conn);
            return 1;
        }
        
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        int queue_position = atoi(argv[3]);
        if (queue_position <= 0) {
            fprintf(stderr, "Invalid queue_position: %s\n", argv[3]);
            PQfinish(conn);
            return 1;
        }
        
        int user_id = atoi(argv[4]);
        if (user_id < 0) {
            fprintf(stderr, "Invalid user_id: %s\n", argv[4]);
            PQfinish(conn);
            return 1;
        }
        
        // Get output format (default is none)
        const char *status_format = "none";
        if (argc >= 6) {
            status_format = argv[5];
            if (strcmp(status_format, "none") != 0 && strcmp(status_format, "text") != 0 && strcmp(status_format, "json") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", status_format);
                PQfinish(conn);
                return 1;
            }
        }
        
        bottom_player(conn, game_set_id, queue_position, user_id, status_format);
    } else if (strcmp(command, "checkin") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Usage: %s checkin <game_set_id> <user_id> [format]\n", argv[0]);
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  Check in a player to a game set\n");
            PQfinish(conn);
            return 1;
        }
        
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        int user_id = atoi(argv[3]);
        if (user_id < 0) {
            fprintf(stderr, "Invalid user_id: %s\n", argv[3]);
            PQfinish(conn);
            return 1;
        }
        
        // Get output format (default is none)
        const char *status_format = "none";
        if (argc >= 5) {
            status_format = argv[4];
            if (strcmp(status_format, "none") != 0 && strcmp(status_format, "text") != 0 && strcmp(status_format, "json") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", status_format);
                PQfinish(conn);
                return 1;
            }
        }
        
        checkin_player(conn, game_set_id, user_id, status_format);
    } else if (strcmp(command, "checkin-by-username") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Usage: %s checkin-by-username <game_set_id> <username> [format]\n", argv[0]);
            fprintf(stderr, "  format: none|text|json (default: none)\n");
            fprintf(stderr, "  Check in a player to a game set by username\n");
            PQfinish(conn);
            return 1;
        }
        
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            fprintf(stderr, "Invalid game_set_id: %s\n", argv[2]);
            PQfinish(conn);
            return 1;
        }
        
        const char *username = argv[3];
        
        // Get output format (default is none)
        const char *status_format = "none";
        if (argc >= 5) {
            status_format = argv[4];
            if (strcmp(status_format, "none") != 0 && strcmp(status_format, "text") != 0 && strcmp(status_format, "json") != 0) {
                fprintf(stderr, "Invalid format: %s (should be 'none', 'text', or 'json')\n", status_format);
                PQfinish(conn);
                return 1;
            }
        }
        
        checkin_player_by_username(conn, game_set_id, username, status_format);
    } else {
        fprintf(stderr, "Unknown command: %s\n", command);
    }
    
    PQfinish(conn);
    return 0;
}