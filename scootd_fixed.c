#define _XOPEN_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <time.h>
#include <libpq-fe.h>
#include <ctype.h>

// Definitions
#define OG_BIRTH_YEAR 1975
#define MAX_STREAK_FOR_AUTOUP 2
#define STAT_SUCCESS 0
#define STAT_ERROR_DB 1
#define STAT_ERROR_ARGS 2
#define STAT_ERROR_NOT_FOUND 3
#define STAT_ERROR_ACTIVE_GAME 4
#define STAT_ERROR_NOT_ENOUGH_PLAYERS 5
#define STAT_ERROR_AUTHORIZATION 6

// Function prototypes
PGconn *connect_to_db();
void list_users(PGconn *conn, const char *filter);
void checkout_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void bump_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void bottom_player(PGconn *conn, int game_set_id, int queue_position, int user_id, const char *status_format);
void show_player_info(PGconn *conn, const char *username, const char *format);
// void promote_players(PGconn *conn, int game_id, bool promote_winners); // Removed as requested
void list_next_up_players(PGconn *conn, int game_set_id, const char *format);
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate, const char *status_format, bool swap);
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
    bool is_player = strcmp(PQgetvalue(res, 0, 2), "t") == 0;
    PQclear(res);
    
    if (!is_player) {
        fprintf(stderr, "User '%s' is not marked as a player\n", username);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User is not a player\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User is not a player\n");
        }
        
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if user already has an active check-in
    snprintf(query, sizeof(query), 
        "SELECT id FROM checkins WHERE user_id = %d AND is_active = true", 
        user_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to check existing checkins: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) > 0) {
        fprintf(stderr, "User '%s' already has an active check-in\n", username);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User already has an active check-in\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User already has an active check-in\n");
        }
        
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Get current queue position for the game set
    snprintf(query, sizeof(query), 
        "SELECT current_queue_position, queue_next_up FROM game_sets WHERE id = %d", 
        game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Failed to get current queue position: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int queue_next_up = atoi(PQgetvalue(res, 0, 1));
    PQclear(res);
    
    // Create a check-in for this user
    snprintf(query, sizeof(query), 
        "INSERT INTO checkins (user_id, game_set_id, queue_position, is_active, club_index, check_in_time, check_in_date, type) "
        "VALUES (%d, %d, %d, true, 34, NOW(), TO_CHAR(NOW(), 'YYYY-MM-DD'), 'manual') "
        "RETURNING id",
        user_id, game_set_id, queue_next_up);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Failed to check in user: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int checkin_id = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    
    // Update the queue_next_up value in the game set
    snprintf(query, sizeof(query), 
        "UPDATE game_sets SET queue_next_up = %d + 1 WHERE id = %d",
        queue_next_up, game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Failed to update queue_next_up: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Success message
    if (strcmp(status_format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"SUCCESS\",\n");
        printf("  \"message\": \"User checked in successfully\",\n");
        printf("  \"checkin_id\": %d,\n", checkin_id);
        printf("  \"user_id\": %d,\n", user_id);
        printf("  \"username\": \"%s\",\n", username);
        printf("  \"queue_position\": %d\n", queue_next_up);
        printf("}\n");
    } else if (strcmp(status_format, "text") == 0) {
        printf("User '%s' checked in successfully (queue position: %d)\n", username, queue_next_up);
    } else {
        printf("Successfully checked in %s at queue position %d\n", username, queue_next_up);
    }
    
    // Display game set status if requested
    if (strcmp(status_format, "json") == 0 || strcmp(status_format, "text") == 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
}

/**
 * Check in a player to a game set by user_id
 * 
 * @param conn Database connection
 * @param game_set_id The ID of the game set to check into
 * @param user_id The ID of the user to check in
 * @param status_format Format to display game set status after checkin (none|text|json)
 */
void checkin_player(PGconn *conn, int game_set_id, int user_id, const char *status_format) {
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
    
    // Lookup user by ID
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
    
    const char *username = PQgetvalue(res, 0, 1);
    bool is_player = strcmp(PQgetvalue(res, 0, 2), "t") == 0;
    PQclear(res);
    
    if (!is_player) {
        fprintf(stderr, "User '%s' (ID: %d) is not marked as a player\n", username, user_id);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User is not a player\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User is not a player\n");
        }
        
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    // Check if user already has an active check-in
    snprintf(query, sizeof(query), 
        "SELECT id FROM checkins WHERE user_id = %d AND is_active = true", 
        user_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to check existing checkins: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    if (PQntuples(res) > 0) {
        fprintf(stderr, "User '%s' (ID: %d) already has an active check-in\n", username, user_id);
        
        if (strcmp(status_format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"User already has an active check-in\"\n");
            printf("}\n");
        } else if (strcmp(status_format, "text") == 0) {
            printf("Error: User already has an active check-in\n");
        }
        
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Get current queue position for the game set
    snprintf(query, sizeof(query), 
        "SELECT current_queue_position, queue_next_up FROM game_sets WHERE id = %d", 
        game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Failed to get current queue position: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int queue_next_up = atoi(PQgetvalue(res, 0, 1));
    PQclear(res);
    
    // Create a check-in for this user
    snprintf(query, sizeof(query), 
        "INSERT INTO checkins (user_id, game_set_id, queue_position, is_active, club_index, check_in_time, check_in_date, type) "
        "VALUES (%d, %d, %d, true, 34, NOW(), TO_CHAR(NOW(), 'YYYY-MM-DD'), 'manual') "
        "RETURNING id",
        user_id, game_set_id, queue_next_up);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
        fprintf(stderr, "Failed to check in user: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    
    int checkin_id = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    
    // Update the queue_next_up value in the game set
    snprintf(query, sizeof(query), 
        "UPDATE game_sets SET queue_next_up = %d + 1 WHERE id = %d",
        queue_next_up, game_set_id);
    res = PQexec(conn, query);
    
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Failed to update queue_next_up: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Commit the transaction
    res = PQexec(conn, "COMMIT");
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "COMMIT failed: %s", PQerrorMessage(conn));
        PQclear(res);
        PQexec(conn, "ROLLBACK");
        return;
    }
    PQclear(res);
    
    // Success message
    if (strcmp(status_format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"SUCCESS\",\n");
        printf("  \"message\": \"User checked in successfully\",\n");
        printf("  \"checkin_id\": %d,\n", checkin_id);
        printf("  \"user_id\": %d,\n", user_id);
        printf("  \"username\": \"%s\",\n", username);
        printf("  \"queue_position\": %d\n", queue_next_up);
        printf("}\n");
    } else if (strcmp(status_format, "text") == 0) {
        printf("User '%s' (ID: %d) checked in successfully (queue position: %d)\n", username, user_id, queue_next_up);
    } else {
        printf("Successfully checked in %s at queue position %d\n", username, queue_next_up);
    }
    
    // Display game set status if requested
    if (strcmp(status_format, "json") == 0 || strcmp(status_format, "text") == 0) {
        get_game_set_status(conn, game_set_id, status_format);
    }
}

/**
 * List next-up players for a game set
 * 
 * @param conn Database connection
 * @param game_set_id The ID of the game set
 * @param format Output format: json or text
 */
void list_next_up_players(PGconn *conn, int game_set_id, const char *format) {
    char query[4096];
    PGresult *res;
    
    // Check if game_set_id is provided, otherwise use active game set
    if (game_set_id <= 0) {
        // Find active game set
        res = PQexec(conn, "SELECT id FROM game_sets WHERE is_active = true ORDER BY id DESC LIMIT 1");
        
        if (PQresultStatus(res) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Error finding active game set: %s", PQerrorMessage(conn));
            PQclear(res);
            return;
        }
        
        if (PQntuples(res) == 0) {
            fprintf(stderr, "No active game set found\n");
            PQclear(res);
            return;
        }
        
        game_set_id = atoi(PQgetvalue(res, 0, 0));
        PQclear(res);
    }
    
    // Get game set details (current queue position)
    sprintf(query, 
            "SELECT id, current_queue_position FROM game_sets WHERE id = %d", 
            game_set_id);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting game set details: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
        return;
    }
    
    int current_position = atoi(PQgetvalue(res, 0, 1));
    PQclear(res);
    
    // Get next-up players
    sprintf(query, 
            "SELECT c.id, c.user_id, u.username, u.birth_year, c.queue_position, c.type as checkin_type "
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
            const char *checkin_type = PQgetvalue(res, i, 5);
            
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
                const char *checkin_type = PQgetvalue(res, i, 5);
                
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
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate, const char *status_format, bool swap) {
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
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error getting game set details: %s", PQerrorMessage(conn));
        PQclear(res);
        return;
    }
    
    if (PQntuples(res) == 0) {
        fprintf(stderr, "Game set %d not found\n", game_set_id);
        PQclear(res);
        return;
    }
    
    int current_position = atoi(PQgetvalue(res, 0, 1));
    PQclear(res);
    
    // Check if court is already being used for an active game
    sprintf(query, 
            "SELECT g.id "
            "FROM games g "
            "WHERE g.set_id = %d AND g.court = '%s' AND g.state = 'started'", 
            game_set_id, court);
    
    res = PQexec(conn, query);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error checking active games: %s", PQerrorMessage(conn));
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
    "AND c.queue_position >= %d AND c.queue_position <= %d "
    "ORDER BY c.team NULLS LAST, c.queue_position ASC "
    "LIMIT 8",
    current_position, current_position + 8);

    
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
                // Parse checkin type for team designation
                const char *type = players[i].checkin_type;
                char team_designation = '\0';
                
                // Find the last ':' character in the type string
                const char *last_colon = strrchr(type, ':');
                if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
                    team_designation = last_colon[1];
                }
                
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
        
        // If swap is true, we need to recount the teams after swapping
        if (swap) {
            home_team_count = 0;
            away_team_count = 0;
            for (int i = 0; i < 8; i++) {
                if (players[i].team == 1) {
                    home_team_count++;
                } else if (players[i].team == 2) {
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
                // Parse checkin type for team designation
                const char *type = players[i].checkin_type;
                char team_designation = '\0';
                
                // Find the last ':' character in the type string
                const char *last_colon = strrchr(type, ':');
                if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
                    team_designation = last_colon[1];
                }
                
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
                printf("  \"message\": \"Database error when starting transaction\"\n");
                printf("}\n");
            } else {
                printf("Error starting transaction: Database error\n");
            }
            return;
        }
        PQclear(res);
        
        // Create the game
        sprintf(query, 
                "INSERT INTO games (set_id, court, start_time, state, club_index) "
                "VALUES (%d, '%s', NOW(), 'started', 34) "
                "RETURNING id", 
                game_set_id, court);
        
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) == 0) {
            fprintf(stderr, "Error creating game: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error when creating game\"\n");
                printf("}\n");
            } else {
                printf("Error creating game: Database error\n");
            }
            return;
        }
        
        int game_id = atoi(PQgetvalue(res, 0, 0));
        PQclear(res);
        
        // Get selected players again
        sprintf(query, 
                "SELECT c.id, c.user_id, u.username, c.queue_position, c.team "
                "FROM checkins c "
                "JOIN users u ON c.user_id = u.id "
                "WHERE c.is_active = true "
                "AND c.game_id IS NULL "
                "AND c.queue_position >= %d AND c.queue_position <= %d " 
                "ORDER BY c.team NULLS LAST, c.queue_position ASC "
                "LIMIT 8",
                current_position, current_position + 8);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_TUPLES_OK || PQntuples(res) < 8) {
            fprintf(stderr, "Error finding available players: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Not enough players available for a game\"\n");
                printf("}\n");
            } else {
                printf("Error: Not enough players available for a game\n");
            }
            return;
        }
        
        // Assign players to the game with team designations
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
        
        // Collect player info and existing team assignments
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
                // Keep existing team assignment, but swap if needed
                team_to_assign = swap ? (players[i].team == 1 ? 2 : 1) : players[i].team;
            } else {
                // Assign to team with fewer players, but swap if needed
                if (home_team_count < 4) {
                    team_to_assign = swap ? 2 : 1;
                    home_team_count++;
                } else {
                    team_to_assign = swap ? 1 : 2;
                    away_team_count++;
                }
            }
            
            // Assign player to game with the determined team
            char update_query[256];
            sprintf(update_query, 
                    "UPDATE checkins SET game_id = %d, team = %d "
                    "WHERE id = %d", 
                    game_id, team_to_assign, players[i].checkin_id);
                    
            PGresult *update_res = PQexec(conn, update_query);
            if (PQresultStatus(update_res) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Error assigning player %s to game: %s", players[i].username, PQerrorMessage(conn));
                PQclear(update_res);
                PQclear(res);
                PQexec(conn, "ROLLBACK");
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error when assigning players to game\"\n");
                    printf("}\n");
                } else {
                    printf("Error assigning players to game: Database error\n");
                }
                return;
            }
            PQclear(update_res);
            
            // Create game_player record
            sprintf(update_query, 
                    "INSERT INTO game_players (game_id, user_id, team) "
                    "VALUES (%d, %d, %d)", 
                    game_id, players[i].user_id, team_to_assign);
                    
            update_res = PQexec(conn, update_query);
            if (PQresultStatus(update_res) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Error creating game_player record for %s: %s", players[i].username, PQerrorMessage(conn));
                PQclear(update_res);
                PQclear(res);
                PQexec(conn, "ROLLBACK");
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error when creating game_player records\"\n");
                    printf("}\n");
                } else {
                    printf("Error creating game_player records: Database error\n");
                }
                return;
            }
            PQclear(update_res);
        }
        
        // Update current_queue_position in the game set (if 8 players were assigned to this game)
        int new_position = current_position + 8;
        sprintf(query, 
                "UPDATE game_sets SET current_queue_position = %d "
                "WHERE id = %d", 
                new_position, game_set_id);
                
        res = PQexec(conn, query);
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "Error updating current_queue_position: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error when updating queue position\"\n");
                printf("}\n");
            } else {
                printf("Error updating queue position: Database error\n");
            }
            return;
        }
        PQclear(res);
        
        // Commit the transaction
        res = PQexec(conn, "COMMIT");
        if (PQresultStatus(res) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT failed: %s", PQerrorMessage(conn));
            PQclear(res);
            PQexec(conn, "ROLLBACK");
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error when committing transaction\"\n");
                printf("}\n");
            } else {
                printf("Error committing transaction: Database error\n");
            }
            return;
        }
        PQclear(res);
        
        // Report success
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"SUCCESS\",\n");
            printf("  \"message\": \"Game created successfully\",\n");
            printf("  \"game_id\": %d,\n", game_id);
            printf("  \"court\": \"%s\",\n", court);
            printf("  \"game_set_id\": %d\n", game_set_id);
            printf("}\n");
        } else {
            printf("\nGame created successfully (ID: %d, Court: %s)\n", game_id, court);
        }
        
        // Display game set status if requested
        if (strcmp(status_format, "json") == 0 || strcmp(status_format, "text") == 0) {
            get_game_set_status(conn, game_set_id, status_format);
        }
    }
    
    PQclear(res);
}

// Main function and other code would go here...