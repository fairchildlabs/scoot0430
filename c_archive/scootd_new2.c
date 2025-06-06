/**
 * scootd.c - Scoot Database Daemon/Client
 * 
 * Connects to PostgreSQL database and performs queries
 * Returns structures with column names matching the database schema
 */

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
void get_next_up_players(PGconn *conn, int game_set_id, const char *format);
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate);
void get_game_set_status(PGconn *conn, int game_set_id, const char *format);

/* Error handling helper */
void handle_error(const char *message, PGconn *conn) 
{
    fprintf(stderr, "ERROR: %s\n", message);
    if (conn) 
    {
        fprintf(stderr, "DB says: %s\n", PQerrorMessage(conn));
        PQfinish(conn);
    }
    exit(1);
}

/* Result set printing helper */
void print_result(PGresult *result) 
{
    int rows = PQntuples(result);
    int cols = PQnfields(result);
    
    /* Print column headers */
    printf("Result set (%d rows):\n", rows);
    for (int c = 0; c < cols; c++) 
    {
        printf("%-15s", PQfname(result, c));
    }
    printf("\n");
    
    /* Print separator line */
    for (int c = 0; c < cols; c++) 
    {
        printf("--------------- ");
    }
    printf("\n");
    
    /* Print data rows */
    for (int r = 0; r < rows; r++) 
    {
        for (int c = 0; c < cols; c++) 
        {
            printf("%-15s", PQgetvalue(result, r, c));
        }
        printf("\n");
    }
    printf("\n");
}

/**
 * Define structures for all entities in the database schema
 * These match the column names from the database tables
 */

/* User structure */
typedef struct {
    int id;
    char *username;
    char *password;        /* Hashed in database */
    char *first_name;      /* Using exact database column names */
    char *last_name;
    char *email;
    char *phone;
    int birth_year;
    int birth_month;
    int birth_day;
    int is_player;
    int is_bank;
    int is_book;
    int is_engineer;
    int is_root;
    int autoup;
} User;

/* Game Set structure */
typedef struct {
    int id;
    int user_id;
    char *gym;
    char *created_at;
    char *start_time;
    char *end_time;
    int is_active;
    int club_index;
    int queue_next_up;
    int current_queue_position;
    int players_per_team;
    char *point_system;
} GameSet;

/* Game structure */
typedef struct {
    int id;
    int set_id;
    char *start_time;
    char *end_time;
    int team1_score;
    int team2_score;
    int club_index;
    char *court;
    char *state;
} Game;

/* Check-in structure */
typedef struct {
    int id;
    int user_id;
    char *check_in_time;
    char *check_in_date;
    int is_active;
    int club_index;
    int game_set_id;
    int queue_position;
    int game_id;
    char *type;
    int team;
} Checkin;

/* Game Player structure */
typedef struct {
    int id;
    int game_id;
    int user_id;
    int team;
} GamePlayer;

/* Memory management for structures */

/* Free memory for User structure */
void free_user(User *user) {
    if (!user) return;
    free(user->username);
    free(user->password);
    free(user->first_name);
    free(user->last_name);
    free(user->email);
    free(user->phone);
    free(user);
}

/* Free memory for GameSet structure */
void free_game_set(GameSet *gameSet) {
    if (!gameSet) return;
    free(gameSet->created_at);
    free(gameSet->gym);
    free(gameSet->point_system);
    free(gameSet);
}

/* Free memory for Game structure */
void free_game(Game *game) {
    if (!game) return;
    free(game->start_time);
    free(game->end_time);
    free(game->court);
    free(game->state);
    free(game);
}

/* Free memory for Checkin structure */
void free_checkin(Checkin *checkin) {
    if (!checkin) return;
    free(checkin->check_in_time);
    free(checkin->check_in_date);
    free(checkin->type);
    free(checkin);
}

/* Free memory for GamePlayer structure */
void free_game_player(GamePlayer *gamePlayer) {
    if (!gamePlayer) return;
    free(gamePlayer);
}

/**
 * Database access functions
 */

/* Connect to the database using environment variables */
PGconn *connect_to_db() {
    char conninfo[MAX_CONN_INFO_LEN];
    
    /* Use environment variables for connection info */
    const char *dburl = getenv("DATABASE_URL");
    if (dburl) {
        /* Use the full URL if available */
        snprintf(conninfo, MAX_CONN_INFO_LEN, "%s", dburl);
    } else {
        /* Fallback to individual parameters */
        const char *dbhost = getenv("PGHOST") ? getenv("PGHOST") : "localhost";
        const char *dbport = getenv("PGPORT") ? getenv("PGPORT") : "5432";
        const char *dbname = getenv("PGDATABASE") ? getenv("PGDATABASE") : "postgres";
        const char *dbuser = getenv("PGUSER") ? getenv("PGUSER") : "postgres";
        const char *dbpass = getenv("PGPASSWORD") ? getenv("PGPASSWORD") : "";
        
        snprintf(conninfo, MAX_CONN_INFO_LEN, 
                "host=%s port=%s dbname=%s user=%s password=%s", 
                dbhost, dbport, dbname, dbuser, dbpass);
    }
    
    /* Connect to the database */
    PGconn *conn = PQconnectdb(conninfo);
    
    /* Check connection status */
    if (PQstatus(conn) != CONNECTION_OK) {
        handle_error("Connection to database failed", conn);
    }
    
    printf("Successfully connected to the database\n");
    return conn;
}

/* Execute a query and check for errors */
PGresult *exec_query(PGconn *conn, const char *query) {
    /* Execute the query */
    PGresult *result = PQexec(conn, query);
    
    /* Check for errors */
    ExecStatusType status = PQresultStatus(result);
    if (status != PGRES_TUPLES_OK && status != PGRES_COMMAND_OK) {
        fprintf(stderr, "Query failed: %s\n", PQerrorMessage(conn));
        PQclear(result);
        return NULL;
    }
    
    return result;
}

/* Get users from the database */
User **get_users(PGconn *conn, int *count) {
    const char *query = "SELECT * FROM users ORDER BY id";
    PGresult *result = exec_query(conn, query);
    
    if (!result) {
        *count = 0;
        return NULL;
    }
    
    *count = PQntuples(result);
    if (*count == 0) {
        PQclear(result);
        return NULL;
    }
    
    User **users = (User **)malloc(sizeof(User *) * (*count));
    if (!users) {
        PQclear(result);
        *count = 0;
        return NULL;
    }
    
    for (int i = 0; i < *count; i++) {
        users[i] = (User *)malloc(sizeof(User));
        if (!users[i]) {
            /* Clean up on error */
            for (int j = 0; j < i; j++) {
                free_user(users[j]);
            }
            free(users);
            PQclear(result);
            *count = 0;
            return NULL;
        }
        
        users[i]->id = atoi(PQgetvalue(result, i, 0));
        users[i]->username = strdup(PQgetvalue(result, i, 1));
        users[i]->password = strdup(PQgetvalue(result, i, 2));
        users[i]->first_name = strdup(PQgetvalue(result, i, 3));
        users[i]->last_name = strdup(PQgetvalue(result, i, 4));
        users[i]->email = strdup(PQgetvalue(result, i, 5));
        users[i]->phone = strdup(PQgetvalue(result, i, 6));
        users[i]->birth_year = atoi(PQgetvalue(result, i, 7));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 8)) {
            users[i]->birth_month = 0;
        } else {
            users[i]->birth_month = atoi(PQgetvalue(result, i, 8));
        }
        
        if (PQgetisnull(result, i, 9)) {
            users[i]->birth_day = 0;
        } else {
            users[i]->birth_day = atoi(PQgetvalue(result, i, 9));
        }
        
        users[i]->is_player = atoi(PQgetvalue(result, i, 10));
        users[i]->is_bank = atoi(PQgetvalue(result, i, 11));
        users[i]->is_book = atoi(PQgetvalue(result, i, 12));
        users[i]->is_engineer = atoi(PQgetvalue(result, i, 13));
        users[i]->is_root = atoi(PQgetvalue(result, i, 14));
        users[i]->autoup = atoi(PQgetvalue(result, i, 15));
    }
    
    PQclear(result);
    return users;
}

/* Get active checkins with username from the database */
Checkin **get_active_checkins_with_username(PGconn *conn, int *count) {
    const char *query = 
        "SELECT c.*, u.username "
        "FROM checkins c "
        "JOIN users u ON c.\"user_id\" = u.id "
        "WHERE c.\"is_active\" = true "
        "ORDER BY c.\"queue_position\" ASC";
    
    PGresult *result = exec_query(conn, query);
    
    if (!result) {
        *count = 0;
        return NULL;
    }
    
    *count = PQntuples(result);
    if (*count == 0) {
        PQclear(result);
        return NULL;
    }
    
    Checkin **checkins = (Checkin **)malloc(sizeof(Checkin *) * (*count));
    if (!checkins) {
        PQclear(result);
        *count = 0;
        return NULL;
    }
    
    for (int i = 0; i < *count; i++) {
        checkins[i] = (Checkin *)malloc(sizeof(Checkin));
        if (!checkins[i]) {
            /* Clean up on error */
            for (int j = 0; j < i; j++) {
                free_checkin(checkins[j]);
            }
            free(checkins);
            PQclear(result);
            *count = 0;
            return NULL;
        }
        
        checkins[i]->id = atoi(PQgetvalue(result, i, 0));
        checkins[i]->user_id = atoi(PQgetvalue(result, i, 1));
        checkins[i]->check_in_time = strdup(PQgetvalue(result, i, 2));
        checkins[i]->check_in_date = strdup(PQgetvalue(result, i, 3));
        checkins[i]->is_active = atoi(PQgetvalue(result, i, 4));
        checkins[i]->game_set_id = atoi(PQgetvalue(result, i, 5));
        checkins[i]->club_index = atoi(PQgetvalue(result, i, 6));
        checkins[i]->queue_position = atoi(PQgetvalue(result, i, 7));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 8)) {
            checkins[i]->game_id = 0;
        } else {
            checkins[i]->game_id = atoi(PQgetvalue(result, i, 8));
        }
        
        checkins[i]->type = strdup(PQgetvalue(result, i, 9));
        
        if (PQgetisnull(result, i, 10)) {
            checkins[i]->team = 0;
        } else {
            checkins[i]->team = atoi(PQgetvalue(result, i, 10));
        }
        
        /* Username is added at column 11 in the query */
        printf("User %s at position %d (team: %d, type: %s)\n",
               PQgetvalue(result, i, 11),
               checkins[i]->queue_position,
               checkins[i]->team,
               checkins[i]->type);
    }
    
    PQclear(result);
    return checkins;
}

/* Get active games with their players */
Game **get_active_games(PGconn *conn, int *count) {
    const char *query = 
        "SELECT * FROM games "
        "WHERE state IN ('started', 'pending') "
        "ORDER BY id";
    
    PGresult *result = exec_query(conn, query);
    
    if (!result) {
        *count = 0;
        return NULL;
    }
    
    *count = PQntuples(result);
    if (*count == 0) {
        PQclear(result);
        return NULL;
    }
    
    Game **games = (Game **)malloc(sizeof(Game *) * (*count));
    if (!games) {
        PQclear(result);
        *count = 0;
        return NULL;
    }
    
    for (int i = 0; i < *count; i++) {
        games[i] = (Game *)malloc(sizeof(Game));
        if (!games[i]) {
            /* Clean up on error */
            for (int j = 0; j < i; j++) {
                free_game(games[j]);
            }
            free(games);
            PQclear(result);
            *count = 0;
            return NULL;
        }
        
        games[i]->id = atoi(PQgetvalue(result, i, 0));
        games[i]->set_id = atoi(PQgetvalue(result, i, 1));
        games[i]->start_time = strdup(PQgetvalue(result, i, 2));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 3)) {
            games[i]->end_time = strdup("");
        } else {
            games[i]->end_time = strdup(PQgetvalue(result, i, 3));
        }
        
        games[i]->team1_score = atoi(PQgetvalue(result, i, 4));
        games[i]->team2_score = atoi(PQgetvalue(result, i, 5));
        games[i]->club_index = atoi(PQgetvalue(result, i, 6));
        games[i]->court = strdup(PQgetvalue(result, i, 7));
        games[i]->state = strdup(PQgetvalue(result, i, 8));
        
        printf("Game #%d: Court %s, State: %s, Score: %d-%d\n",
               games[i]->id,
               games[i]->court,
               games[i]->state,
               games[i]->team1_score,
               games[i]->team2_score);
    }
    
    PQclear(result);
    return games;
}

/* Get active game set details */
GameSet *get_active_game_set(PGconn *conn) {
    const char *query = "SELECT * FROM game_sets WHERE \"is_active\" = true LIMIT 1";
    PGresult *result = exec_query(conn, query);
    
    if (!result) {
        return NULL;
    }
    
    int rows = PQntuples(result);
    if (rows == 0) {
        PQclear(result);
        return NULL;
    }
    
    GameSet *gameSet = (GameSet *)malloc(sizeof(GameSet));
    if (!gameSet) {
        PQclear(result);
        return NULL;
    }
    
    gameSet->id = atoi(PQgetvalue(result, 0, 0));
    gameSet->user_id = atoi(PQgetvalue(result, 0, 1));
    gameSet->gym = strdup(PQgetvalue(result, 0, 2));
    gameSet->created_at = strdup(PQgetvalue(result, 0, 3));
    
    /* Handle nullable columns properly */
    if (PQgetisnull(result, 0, 4)) {
        gameSet->start_time = strdup("");
    } else {
        gameSet->start_time = strdup(PQgetvalue(result, 0, 4));
    }
    
    if (PQgetisnull(result, 0, 5)) {
        gameSet->end_time = strdup("");
    } else {
        gameSet->end_time = strdup(PQgetvalue(result, 0, 5));
    }
    
    gameSet->is_active = atoi(PQgetvalue(result, 0, 6));
    gameSet->club_index = atoi(PQgetvalue(result, 0, 7));
    gameSet->queue_next_up = atoi(PQgetvalue(result, 0, 8));
    gameSet->current_queue_position = atoi(PQgetvalue(result, 0, 9));
    gameSet->players_per_team = atoi(PQgetvalue(result, 0, 10));
    
    printf("Active GameSet: %s (ID: %d)\n", gameSet->gym, gameSet->id);
    printf("Queue Position: %d, Next Up: %d, Players Per Team: %d\n",
           gameSet->current_queue_position,
           gameSet->queue_next_up,
           gameSet->players_per_team);
    
    PQclear(result);
    return gameSet;
}

/* Run arbitrary SQL and display results */
void run_sql(PGconn *conn, const char *sql) {
    printf("Executing SQL: %s\n", sql);
    
    PGresult *result = exec_query(conn, sql);
    if (!result) {
        printf("Query failed.\n");
        return;
    }
    
    ExecStatusType status = PQresultStatus(result);
    if (status == PGRES_TUPLES_OK) {
        /* Query returned data */
        print_result(result);
    } else if (status == PGRES_COMMAND_OK) {
        /* Command executed successfully (no data returned) */
        printf("Command executed successfully.\n");
        if (strstr(sql, "UPDATE") || strstr(sql, "DELETE") || strstr(sql, "INSERT")) {
            printf("Affected rows: %s\n", PQcmdTuples(result));
        }
    }
    
    PQclear(result);
}

/* Get the active game set ID */
int get_active_game_set_id(PGconn *conn) {
    const char *query = 
        "SELECT id FROM game_sets WHERE is_active = true LIMIT 1";
    
    PGresult *result = PQexec(conn, query);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to get active game set: %s\n", PQerrorMessage(conn));
        PQclear(result);
        return 0;
    }
    
    int rows = PQntuples(result);
    if (rows == 0) {
        printf("No active game set found\n");
        PQclear(result);
        return 0;
    }
    
    int game_set_id = atoi(PQgetvalue(result, 0, 0));
    PQclear(result);
    return game_set_id;
}

/* Function to get next-up players for a given game set */
void get_next_up_players(PGconn *conn, int game_set_id, const char *format) {
    // First check if the game set exists
    const char *check_query = 
        "SELECT 1 FROM game_sets WHERE id = $1";
    
    char set_id_str[16];
    sprintf(set_id_str, "%d", game_set_id);
    const char *check_params[1] = { set_id_str };
    
    PGresult *check_result = PQexecParams(conn, check_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(check_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game set check query failed: %s\n", PQerrorMessage(conn));
        PQclear(check_result);
        
        if (format && strcmp(format, "json") == 0) {
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
        
        if (format && strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Invalid game_set_id: %d\"\n", game_set_id);
            printf("}\n");
        } else {
            printf("Invalid game_set_id: %d\n", game_set_id);
        }
        return;
    }
    
    PQclear(check_result);
    
    // If we got here, the game set exists, so continue with the original query
    const char *query = 
        "SELECT c.queue_position, u.username, u.id, c.type, c.team, u.birth_year "
        "FROM checkins c "
        "JOIN users u ON c.user_id = u.id "
        "WHERE c.is_active = true AND c.game_set_id = $1 AND c.game_id IS NULL "
        "ORDER BY c.queue_position";
    
    const char *params[1] = { set_id_str };
    
    PGresult *result = PQexecParams(conn, query, 1, NULL, params, NULL, NULL, 0);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Next-up players query failed: %s\n", PQerrorMessage(conn));
        PQclear(result);
        
        if (format && strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when fetching players\"\n");
            printf("}\n");
        } else {
            printf("Error fetching players: Database error\n");
        }
        return;
    }
    
    int rows = PQntuples(result);
    
    if (format && strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"SUCCESS\",\n");
        printf("  \"game_set_id\": %d,\n", game_set_id);
        printf("  \"next_up_players\": [\n");
        
        for (int i = 0; i < rows; i++) {
            int position = atoi(PQgetvalue(result, i, 0));
            const char *username = PQgetvalue(result, i, 1);
            int userId = atoi(PQgetvalue(result, i, 2));
            const char *type = PQgetvalue(result, i, 3);
            
            // Handle team which might be NULL
            const char *team_str = "null";
            if (!PQgetisnull(result, i, 4)) {
                team_str = PQgetvalue(result, i, 4);
            }
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(result, i, 5)) {
                int birth_year = atoi(PQgetvalue(result, i, 5));
                is_og = birth_year <= 1980;  // players born in 1980 or earlier are OGs
            }
            
            printf("    {\n");
            printf("      \"position\": %d,\n", position);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"user_id\": %d,\n", userId);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"team\": %s,\n", team_str);
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", (i < rows - 1) ? "," : "");
        }
        
        printf("  ],\n");
        printf("  \"count\": %d\n", rows);
        printf("}\n");
    } else {
        printf("Next-up players for game set #%d: %d found\n", game_set_id, rows);
        printf("------------------------------------------\n");
        printf("%-8s | %-20s | %-10s | %-15s | %-5s | %-5s\n", 
               "Position", "Username", "User ID", "Type", "Team", "OG");
        printf("------------------------------------------\n");
        
        for (int i = 0; i < rows; i++) {
            int position = atoi(PQgetvalue(result, i, 0));
            const char *username = PQgetvalue(result, i, 1);
            int userId = atoi(PQgetvalue(result, i, 2));
            const char *type = PQgetvalue(result, i, 3);
            
            const char *team_str = "none";
            if (!PQgetisnull(result, i, 4)) {
                team_str = PQgetvalue(result, i, 4);
            }
            
            // Check if player is OG based on birth year
            const char *og_str = "No";
            if (!PQgetisnull(result, i, 5)) {
                int birth_year = atoi(PQgetvalue(result, i, 5));
                if (birth_year <= 1980) {  // players born in 1980 or earlier are OGs
                    og_str = "Yes";
                }
            }
            
            printf("%-8d | %-20s | %-10d | %-15s | %-5s | %-5s\n", 
                   position, username, userId, type, team_str, og_str);
        }
        
        if (rows == 0) {
            printf("No next-up players found for this game set.\n");
        }
    }
    
    PQclear(result);
}

/* Get detailed player information */
void get_player_info(PGconn *conn, const char *username, const char *format) {
    /* First get user details */
    const char *user_query = 
        "SELECT id, username, is_player, is_engineer, autoup, birth_year "
        "FROM users WHERE username = $1";
    
    const char *user_params[1] = { username };
    PGresult *user_result = PQexecParams(conn, user_query, 1, NULL, user_params, NULL, NULL, 0);
    
    if (PQresultStatus(user_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to get user info: %s\n", PQerrorMessage(conn));
        PQclear(user_result);
        return;
    }
    
    int user_rows = PQntuples(user_result);
    if (user_rows == 0) {
        printf("No user found with username '%s'\n", username);
        PQclear(user_result);
        return;
    }
    
    int user_id = atoi(PQgetvalue(user_result, 0, 0));
    const char *user_name = PQgetvalue(user_result, 0, 1);
    int is_player = atoi(PQgetvalue(user_result, 0, 2));
    int is_engineer = atoi(PQgetvalue(user_result, 0, 3));
    int autoup = atoi(PQgetvalue(user_result, 0, 4));
    
    char *birth_year = NULL;
    if (!PQgetisnull(user_result, 0, 5)) {
        birth_year = PQgetvalue(user_result, 0, 5);
    }
    
    /* Handle different output formats */
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"player\": {\n");
        printf("    \"id\": %d,\n", user_id);
        printf("    \"username\": \"%s\",\n", user_name);
        printf("    \"is_player\": %s,\n", is_player ? "true" : "false");
        printf("    \"is_engineer\": %s,\n", is_engineer ? "true" : "false");
        printf("    \"autoup\": %s,\n", autoup ? "true" : "false");
        if (birth_year) {
            printf("    \"birth_year\": %s,\n", birth_year);
        } else {
            printf("    \"birth_year\": null,\n");
        }
    } else {
        printf("=== Player Information: %s (ID: %d) ===\n", user_name, user_id);
        printf("Status: %s%s%s\n", 
               is_player ? "Player " : "",
               is_engineer ? "Engineer " : "",
               autoup ? "Auto-Up" : "");
        if (birth_year) {
            printf("Birth Year: %s\n", birth_year);
        }
    }
    
    /* Get active checkins for this user */
    const char *checkin_query = 
        "SELECT id, queue_position, game_id, team, type, check_in_time "
        "FROM checkins "
        "WHERE user_id = $1 AND is_active = true "
        "ORDER BY queue_position";
    
    char user_id_str[16];
    sprintf(user_id_str, "%d", user_id);
    const char *checkin_params[1] = { user_id_str };
    
    PGresult *checkin_result = PQexecParams(conn, checkin_query, 1, NULL, checkin_params, NULL, NULL, 0);
    
    if (PQresultStatus(checkin_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to get checkin info: %s\n", PQerrorMessage(conn));
        PQclear(user_result);
        PQclear(checkin_result);
        return;
    }
    
    int checkin_rows = PQntuples(checkin_result);
    
    if (strcmp(format, "json") == 0) {
        printf("    \"active_checkins\": [\n");
        for (int i = 0; i < checkin_rows; i++) {
            int checkin_id = atoi(PQgetvalue(checkin_result, i, 0));
            int position = atoi(PQgetvalue(checkin_result, i, 1));
            
            const char *game_id_str = "null";
            if (!PQgetisnull(checkin_result, i, 2)) {
                game_id_str = PQgetvalue(checkin_result, i, 2);
            }
            
            const char *team_str = "null"; 
            if (!PQgetisnull(checkin_result, i, 3)) {
                team_str = PQgetvalue(checkin_result, i, 3);
            }
            
            const char *type = PQgetvalue(checkin_result, i, 4);
            const char *checkin_time = PQgetvalue(checkin_result, i, 5);
            
            printf("      {\n");
            printf("        \"id\": %d,\n", checkin_id);
            printf("        \"position\": %d,\n", position);
            printf("        \"game_id\": %s,\n", game_id_str);
            printf("        \"team\": %s,\n", team_str);
            printf("        \"type\": \"%s\",\n", type);
            printf("        \"check_in_time\": \"%s\"%s\n", 
                   checkin_time,
                   (i < checkin_rows - 1) ? "," : "");
            printf("      }%s\n", (i < checkin_rows - 1) ? "," : "");
        }
        printf("    ],\n");
    } else {
        printf("\nActive Checkins: %d\n", checkin_rows);
        
        for (int i = 0; i < checkin_rows; i++) {
            int checkin_id = atoi(PQgetvalue(checkin_result, i, 0));
            int position = atoi(PQgetvalue(checkin_result, i, 1));
            
            const char *game_id_str = "none";
            if (!PQgetisnull(checkin_result, i, 2)) {
                game_id_str = PQgetvalue(checkin_result, i, 2);
            }
            
            const char *team_str = "none"; 
            if (!PQgetisnull(checkin_result, i, 3)) {
                team_str = PQgetvalue(checkin_result, i, 3);
            }
            
            const char *type = PQgetvalue(checkin_result, i, 4);
            const char *checkin_time = PQgetvalue(checkin_result, i, 5);
            
            printf("  Position %d (ID: %d)\n", position, checkin_id);
            printf("    Game: %s, Team: %s, Type: %s\n", game_id_str, team_str, type);
            printf("    Check-in Time: %s\n", checkin_time);
        }
    }
    
    /* Get player's game history */
    const char *history_query = 
        "SELECT g.id, g.state, g.court, gp.team, g.team1_score, g.team2_score, "
        "       g.start_time, g.end_time "
        "FROM game_players gp "
        "JOIN games g ON gp.game_id = g.id "
        "WHERE gp.user_id = $1 "
        "ORDER BY g.start_time DESC LIMIT 5";
    
    PGresult *history_result = PQexecParams(conn, history_query, 1, NULL, checkin_params, NULL, NULL, 0);
    
    if (PQresultStatus(history_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Failed to get game history: %s\n", PQerrorMessage(conn));
        PQclear(user_result);
        PQclear(checkin_result);
        PQclear(history_result);
        return;
    }
    
    int history_rows = PQntuples(history_result);
    
    if (strcmp(format, "json") == 0) {
        printf("    \"recent_games\": [\n");
        for (int i = 0; i < history_rows; i++) {
            int game_id = atoi(PQgetvalue(history_result, i, 0));
            const char *state = PQgetvalue(history_result, i, 1);
            const char *court = PQgetvalue(history_result, i, 2);
            int team = atoi(PQgetvalue(history_result, i, 3));
            int team1_score = atoi(PQgetvalue(history_result, i, 4));
            int team2_score = atoi(PQgetvalue(history_result, i, 5));
            const char *start_time = PQgetvalue(history_result, i, 6);
            
            const char *end_time = NULL;
            if (!PQgetisnull(history_result, i, 7)) {
                end_time = PQgetvalue(history_result, i, 7);
            }
            
            printf("      {\n");
            printf("        \"id\": %d,\n", game_id);
            printf("        \"state\": \"%s\",\n", state);
            printf("        \"court\": \"%s\",\n", court);
            printf("        \"team\": %d,\n", team);
            printf("        \"team1_score\": %d,\n", team1_score);
            printf("        \"team2_score\": %d,\n", team2_score);
            printf("        \"start_time\": \"%s\",\n", start_time);
            if (end_time) {
                printf("        \"end_time\": \"%s\"\n", end_time);
            } else {
                printf("        \"end_time\": null\n");
            }
            printf("      }%s\n", (i < history_rows - 1) ? "," : "");
        }
        printf("    ]\n");
        printf("  }\n");
        printf("}\n");
    } else {
        printf("\nRecent Games: %d\n", history_rows);
        
        for (int i = 0; i < history_rows; i++) {
            int game_id = atoi(PQgetvalue(history_result, i, 0));
            const char *state = PQgetvalue(history_result, i, 1);
            const char *court = PQgetvalue(history_result, i, 2);
            int team = atoi(PQgetvalue(history_result, i, 3));
            int team1_score = atoi(PQgetvalue(history_result, i, 4));
            int team2_score = atoi(PQgetvalue(history_result, i, 5));
            const char *start_time = PQgetvalue(history_result, i, 6);
            
            const char *end_time = "In progress";
            if (!PQgetisnull(history_result, i, 7)) {
                end_time = PQgetvalue(history_result, i, 7);
            }
            
            printf("  Game #%d on Court %s (State: %s)\n", game_id, court, state);
            printf("    Team: %d, Score: %d-%d\n", team, team1_score, team2_score);
            printf("    Started: %s\n", start_time);
            if (strcmp(end_time, "In progress") != 0) {
                printf("    Ended: %s\n", end_time);
            }
        }
    }
    
    PQclear(user_result);
    PQclear(checkin_result);
    PQclear(history_result);
}

/* Finalize a game with scores */
int finalize_game(PGconn *conn, int game_id, int home_score, int away_score) {
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
    
    printf("\nNext Steps:\n");
    printf("1. Use 'promote %d win' to move winning team to Next Up queue\n", game_id);
    printf("2. Use 'promote %d loss' to move losing team to Next Up queue\n", game_id);
    printf("3. Use 'checkout' to remove players who don't want to continue\n");
    
    PQclear(game_result);
    PQclear(update_result);
    
    return updated_id;
}

/* Handle game promotion (winners or losers) */
int promote_game_players(PGconn *conn, int game_id, const char *promotion_type) {
    if (strcmp(promotion_type, "win") != 0 && strcmp(promotion_type, "loss") != 0) {
        fprintf(stderr, "Invalid promotion type: %s (must be 'win' or 'loss')\n", promotion_type);
        return 0;
    }
    
    /* First, get the game to verify it exists and is in final state */
    const char *game_query = 
        "SELECT id, state, team1_score, team2_score, set_id "
        "FROM games WHERE id = $1";
    
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
    if (strcmp(state, "final") != 0) {
        printf("Game #%d is not in 'final' state (current state: %s)\n", game_id, state);
        printf("Only finalized games can be used for promotion\n");
        PQclear(game_result);
        return 0;
    }
    
    int team1_score = atoi(PQgetvalue(game_result, 0, 2));
    int team2_score = atoi(PQgetvalue(game_result, 0, 3));
    int set_id = atoi(PQgetvalue(game_result, 0, 4));
    
    /* Determine which team won */
    int winning_team = 0;
    if (team1_score > team2_score) {
        winning_team = 1;
    } else if (team2_score > team1_score) {
        winning_team = 2;
    } else {
        printf("Game #%d ended in a tie (%d-%d). Cannot determine promotion.\n", 
               game_id, team1_score, team2_score);
        PQclear(game_result);
        return 0;
    }
    
    /* Determine the team to promote based on promotion type */
    int team_to_promote;
    const char *type_str;
    
    if (strcmp(promotion_type, "win") == 0) {
        team_to_promote = winning_team;
        type_str = "win_promoted";
        printf("Promoting winning team %d (score %d-%d)\n", 
               winning_team, team1_score, team2_score);
    } else {
        team_to_promote = (winning_team == 1) ? 2 : 1;
        type_str = "loss_promoted";
        printf("Promoting losing team %d (score %d-%d)\n", 
               team_to_promote, team1_score, team2_score);
    }
    
    /* Get players from the selected team */
    const char *players_query =
        "SELECT gp.user_id, u.username "
        "FROM game_players gp "
        "JOIN users u ON gp.user_id = u.id "
        "WHERE gp.game_id = $1 AND gp.team = $2";
    
    char team_str[2];
    sprintf(team_str, "%d", team_to_promote);
    const char *players_params[2] = { game_id_str, team_str };
    
    PGresult *players_result = PQexecParams(conn, players_query, 2, NULL, players_params, NULL, NULL, 0);
    
    if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Players query failed: %s\n", PQerrorMessage(conn));
        PQclear(game_result);
        PQclear(players_result);
        return 0;
    }
    
    int player_rows = PQntuples(players_result);
    if (player_rows == 0) {
        printf("No players found for team %d in game #%d\n", team_to_promote, game_id);
        PQclear(game_result);
        PQclear(players_result);
        return 0;
    }
    
    /* Get the current queue position from the game set */
    const char *queue_query = 
        "SELECT current_queue_position FROM game_sets WHERE id = $1";
    
    char set_id_str[16];
    sprintf(set_id_str, "%d", set_id);
    const char *queue_params[1] = { set_id_str };
    
    PGresult *queue_result = PQexecParams(conn, queue_query, 1, NULL, queue_params, NULL, NULL, 0);
    
    if (PQresultStatus(queue_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Queue position query failed: %s\n", PQerrorMessage(conn));
        PQclear(game_result);
        PQclear(players_result);
        PQclear(queue_result);
        return 0;
    }
    
    int queue_position = atoi(PQgetvalue(queue_result, 0, 0));
    
    /* Create new checkins for each player in the next-up queue */
    int successful_promotions = 0;
    
    printf("Promoting %d players to positions starting at %d:\n", player_rows, queue_position);
    
    for (int i = 0; i < player_rows; i++) {
        int user_id = atoi(PQgetvalue(players_result, i, 0));
        const char *username = PQgetvalue(players_result, i, 1);
        
        /* Insert new checkin */
        const char *insert_query = 
            "INSERT INTO checkins "
            "(user_id, game_set_id, club_index, check_in_time, check_in_date, "
            "is_active, queue_position, type, team) "
            "VALUES ($1, $2, "
            "(SELECT club_index FROM games WHERE id = $3), "
            "NOW(), CURRENT_DATE, true, $4, $5, $6) "
            "RETURNING id";
        
        char user_id_str[16];
        char position_str[16];
        
        sprintf(user_id_str, "%d", user_id);
        sprintf(position_str, "%d", queue_position + i);
        
        const char *insert_params[6] = { 
            user_id_str, set_id_str, game_id_str, 
            position_str, type_str, team_str 
        };
        
        PGresult *insert_result = PQexecParams(conn, insert_query, 6, NULL, insert_params, NULL, NULL, 0);
        
        if (PQresultStatus(insert_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Failed to create checkin for %s: %s\n", 
                   username, PQerrorMessage(conn));
            PQclear(insert_result);
            continue;
        }
        
        int checkin_id = atoi(PQgetvalue(insert_result, 0, 0));
        printf("  %s promoted to position %d (checkin ID: %d)\n", 
               username, queue_position + i, checkin_id);
        
        successful_promotions++;
        PQclear(insert_result);
    }
    
    /* If we promoted any players, update the game set's queue position */
    if (successful_promotions > 0) {
        int new_queue_position = queue_position + successful_promotions;
        
        const char *update_query = 
            "UPDATE game_sets SET current_queue_position = $1 "
            "WHERE id = $2 RETURNING id";
        
        char new_pos_str[16];
        sprintf(new_pos_str, "%d", new_queue_position);
        
        const char *update_params[2] = { new_pos_str, set_id_str };
        
        PGresult *update_result = PQexecParams(conn, update_query, 2, NULL, update_params, NULL, NULL, 0);
        
        if (PQresultStatus(update_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Failed to update game set queue position: %s\n", 
                   PQerrorMessage(conn));
        } else {
            printf("Updated game set #%d queue position to %d\n", 
                   set_id, new_queue_position);
        }
        
        PQclear(update_result);
    }
    
    PQclear(game_result);
    PQclear(players_result);
    PQclear(queue_result);
    
    return successful_promotions;
}

/* Handle player checkout */
int checkout_player(PGconn *conn, int queue_position) {
    // First get information about the player's position
    const char *query = 
        "SELECT c.id, c.user_id, c.game_id, c.team, c.queue_position, c.type, "
        "u.username, "
        "(SELECT COUNT(*) FROM checkins WHERE game_id = c.game_id AND team = c.team AND is_active = true) as team_count "
        "FROM checkins c "
        "JOIN users u ON c.user_id = u.id "
        "WHERE c.queue_position = $1 AND c.is_active = true";
    
    const char *paramValues[1];
    char pos_str[16];
    sprintf(pos_str, "%d", queue_position);
    paramValues[0] = pos_str;
    
    PGresult *result = PQexecParams(conn, query, 1, NULL, paramValues, NULL, NULL, 0);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Checkout query failed: %s\n", PQerrorMessage(conn));
        PQclear(result);
        return 0;
    }
    
    int rows = PQntuples(result);
    if (rows == 0) {
        printf("No active player found at position %d\n", queue_position);
        PQclear(result);
        return 0;
    }
    
    int checkin_id = atoi(PQgetvalue(result, 0, 0));
    int user_id = atoi(PQgetvalue(result, 0, 1));
    int game_id = 0;
    if (!PQgetisnull(result, 0, 2)) {
        game_id = atoi(PQgetvalue(result, 0, 2));
    }
    int team = 0;
    if (!PQgetisnull(result, 0, 3)) {
        team = atoi(PQgetvalue(result, 0, 3));
    }
    int pos = atoi(PQgetvalue(result, 0, 4));
    const char *type = PQgetvalue(result, 0, 5);
    const char *username = PQgetvalue(result, 0, 6);
    int team_count = atoi(PQgetvalue(result, 0, 7));
    
    // Now perform the actual checkout
    const char *update_query = 
        "UPDATE checkins SET is_active = false "
        "WHERE id = $1 RETURNING id";
    
    char id_str[16];
    sprintf(id_str, "%d", checkin_id);
    const char *update_params[1] = { id_str };
    
    PGresult *update_result = PQexecParams(conn, update_query, 1, NULL, update_params, NULL, NULL, 0);
    
    if (PQresultStatus(update_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Player checkout failed: %s\n", PQerrorMessage(conn));
        PQclear(result);
        PQclear(update_result);
        return 0;
    }
    
    printf("Checked out player %s (user ID: %d) from position %d\n", 
           username, user_id, pos);
    
    if (game_id > 0) {
        printf("Player was in active game #%d on team %d (%d players remaining on team)\n", 
               game_id, team, team_count - 1);
        
        // If this was the last player on a team, we could handle game ending logic here
        if (team_count <= 1) {
            printf("WARNING: Team %d now has no active players in game #%d\n", team, game_id);
        }
    } else {
        printf("Player was in the next-up queue (type: %s)\n", type);
    }
    
    PQclear(result);
    PQclear(update_result);
    return checkin_id;
}

/* Function to get comprehensive game set status */
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
        "ORDER BY c.queue_position";
    
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
    
    // 3. Get COMPLETED GAMES
    const char *completed_games_query = 
        "SELECT g.id, g.court, g.start_time, g.end_time, g.team1_score, g.team2_score "
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
    
    // Calculate elapsed time if we have both start and end times
    char elapsed_time_str[100] = "N/A";
    if (first_game_time != NULL && last_game_time != NULL) {
        // Parse the timestamps
        struct tm start_tm = {0};
        struct tm end_tm = {0};
        char start_date[20], start_time[20];
        char end_date[20], end_time[20];
        
        // Parse start time: 2025-03-23 12:13:39.074
        sscanf(first_game_time, "%s %s", start_date, start_time);
        sscanf(start_date, "%d-%d-%d", &start_tm.tm_year, &start_tm.tm_mon, &start_tm.tm_mday);
        sscanf(start_time, "%d:%d:%d", &start_tm.tm_hour, &start_tm.tm_min, &start_tm.tm_sec);
        start_tm.tm_year -= 1900; // Adjust year
        start_tm.tm_mon -= 1;    // Adjust month (0-based)
        
        // Parse end time: 2025-03-23 12:15:59.590
        sscanf(last_game_time, "%s %s", end_date, end_time);
        sscanf(end_date, "%d-%d-%d", &end_tm.tm_year, &end_tm.tm_mon, &end_tm.tm_mday);
        sscanf(end_time, "%d:%d:%d", &end_tm.tm_hour, &end_tm.tm_min, &end_tm.tm_sec);
        end_tm.tm_year -= 1900;  // Adjust year
        end_tm.tm_mon -= 1;     // Adjust month (0-based)
        
        // Convert to time_t for easier calculation
        time_t start_time_t = mktime(&start_tm);
        time_t end_time_t = mktime(&end_tm);
        
        // Calculate difference in seconds
        double diff_seconds = difftime(end_time_t, start_time_t);
        
        // Format elapsed time as hours:minutes:seconds
        int hours = (int)diff_seconds / 3600;
        int minutes = ((int)diff_seconds % 3600) / 60;
        int seconds = (int)diff_seconds % 60;
        
        sprintf(elapsed_time_str, "%02d:%02d:%02d", hours, minutes, seconds);
    }
    
    // Output the results
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"SUCCESS\",\n");
        printf("  \"game_set\": {\n");
        printf("    \"id\": %d,\n", game_set_id);
        printf("    \"name\": \"%s\",\n", game_set_name);
        printf("    \"state\": \"%s\",\n", game_set_state);
        printf("    \"create_date\": \"%s\",\n", create_date);
        printf("    \"current_queue_position\": %d,\n", current_queue_position);
        printf("    \"players_per_team\": %d,\n", players_per_team);
        printf("    \"total_games\": %d,\n", total_games);
        printf("    \"unique_players\": %d,\n", unique_players);
        
        if (first_game_time != NULL) {
            printf("    \"start_time\": \"%s\",\n", first_game_time);
        } else {
            printf("    \"start_time\": null,\n");
        }
        
        if (last_game_time != NULL) {
            printf("    \"end_time\": \"%s\",\n", last_game_time);
        } else {
            printf("    \"end_time\": null,\n");
        }
        
        printf("    \"elapsed_time\": \"%s\"\n", elapsed_time_str);
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
            
            // Get players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_params[1] = { game_id_str };
            
            const char *players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "JOIN checkins c ON u.id = c.user_id AND c.game_id = gp.game_id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            PGresult *players_result = PQexecParams(conn, players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) == PGRES_TUPLES_OK) {
                int player_count = PQntuples(players_result);
                
                printf("      \"players\": [\n");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    
                    printf("        {\n");
                    printf("          \"username\": \"%s\",\n", username);
                    printf("          \"team\": %d,\n", team);
                    printf("          \"relative_position\": %d,\n", relative_position);
                    printf("          \"queue_position\": %d\n", queue_position);
                    if (j < player_count - 1) {
                        printf("        },\n");
                    } else {
                        printf("        }\n");
                    }
                }
                printf("      ]\n");
                
                PQclear(players_result);
            } else {
                printf("      \"players\": []\n");
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
            const char *team = PQgetvalue(next_up_result, i, 4);
            const char *birth_year = PQgetvalue(next_up_result, i, 5);
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(next_up_result, i, 5) && birth_year && *birth_year) {
                int birth_year_int = atoi(birth_year);
                is_og = birth_year_int <= 1980;  // players born in 1980 or earlier are OGs
            }
            
            printf("    {\n");
            printf("      \"queue_position\": %d,\n", queue_position);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"user_id\": %d,\n", user_id);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"team\": %s,\n", team && *team ? team : "null");
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
            const char *start_time = PQgetvalue(completed_games_result, i, 2);
            const char *end_time = PQgetvalue(completed_games_result, i, 3);
            int team1_score = atoi(PQgetvalue(completed_games_result, i, 4));
            int team2_score = atoi(PQgetvalue(completed_games_result, i, 5));
            
            printf("    {\n");
            printf("      \"id\": %d,\n", game_id);
            printf("      \"court\": \"%s\",\n", court);
            printf("      \"start_time\": \"%s\",\n", start_time);
            printf("      \"end_time\": \"%s\",\n", end_time);
            printf("      \"team1_score\": %d,\n", team1_score);
            printf("      \"team2_score\": %d,\n", team2_score);
            printf("      \"result\": \"%s\",\n", 
                  team1_score == team2_score ? "Tie" : 
                  team1_score > team2_score ? "Team 1 won" : "Team 2 won");
            
            // Get players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_params[1] = { game_id_str };
            
            const char *players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "JOIN checkins c ON u.id = c.user_id AND c.game_id = gp.game_id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            PGresult *players_result = PQexecParams(conn, players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) == PGRES_TUPLES_OK) {
                int player_count = PQntuples(players_result);
                
                printf("      \"players\": [\n");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    
                    printf("        {\n");
                    printf("          \"username\": \"%s\",\n", username);
                    printf("          \"team\": %d,\n", team);
                    printf("          \"relative_position\": %d,\n", relative_position);
                    printf("          \"queue_position\": %d\n", queue_position);
                    if (j < player_count - 1) {
                        printf("        },\n");
                    } else {
                        printf("        }\n");
                    }
                }
                printf("      ]\n");
                
                PQclear(players_result);
            } else {
                printf("      \"players\": []\n");
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
        printf("\n===== GAME SET #%d STATUS =====\n\n", game_set_id);
        printf("Name: %s\n", game_set_name);
        printf("State: %s\n", game_set_state);
        printf("Create Date: %s\n", create_date);
        printf("Current Queue Position: %d\n", current_queue_position);
        printf("Players Per Team: %d\n", players_per_team);
        printf("Total Games: %d\n", total_games);
        printf("Unique Players: %d\n\n", unique_players);
        
        printf("Start Time: %s\n", first_game_time ? first_game_time : "N/A");
        printf("End Time: %s\n", last_game_time ? last_game_time : "N/A");
        printf("Elapsed Time: %s\n\n", elapsed_time_str);
        
        // Active games
        printf("----- ACTIVE GAMES (%d) -----\n\n", active_games_count);
        for (int i = 0; i < active_games_count; i++) {
            int game_id = atoi(PQgetvalue(active_games_result, i, 0));
            const char *court = PQgetvalue(active_games_result, i, 1);
            const char *start_time = PQgetvalue(active_games_result, i, 3);
            int team1_score = atoi(PQgetvalue(active_games_result, i, 4));
            int team2_score = atoi(PQgetvalue(active_games_result, i, 5));
            
            printf("Game #%d (Court %s):\n", game_id, court);
            printf("  Started: %s\n", start_time);
            printf("  Current Score: %d-%d\n\n", team1_score, team2_score);
            
            // Get players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_params[1] = { game_id_str };
            
            const char *players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "JOIN checkins c ON u.id = c.user_id AND c.game_id = gp.game_id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            PGresult *players_result = PQexecParams(conn, players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) == PGRES_TUPLES_OK) {
                int player_count = PQntuples(players_result);
                
                printf("  Players:\n");
                printf("  Team 1:\n");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    
                    if (team == 1) {
                        printf("    %d. %s (Pos %d)\n", relative_position, username, queue_position);
                    }
                }
                
                printf("  Team 2:\n");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    
                    if (team == 2) {
                        printf("    %d. %s (Pos %d)\n", relative_position, username, queue_position);
                    }
                }
                
                PQclear(players_result);
            }
            printf("\n");
        }
        
        if (active_games_count == 0) {
            printf("No active games found.\n\n");
        }
        
        // Next up players
        printf("----- NEXT UP QUEUE (%d) -----\n\n", next_up_count);
        if (next_up_count > 0) {
            printf("%-8s | %-20s | %-10s | %-15s | %-5s | %-5s\n", 
                   "Position", "Username", "User ID", "Type", "Team", "OG");
            printf("------------------------------------------------------------------\n");
            
            for (int i = 0; i < next_up_count; i++) {
                int queue_position = atoi(PQgetvalue(next_up_result, i, 0));
                const char *username = PQgetvalue(next_up_result, i, 1);
                int user_id = atoi(PQgetvalue(next_up_result, i, 2));
                const char *type = PQgetvalue(next_up_result, i, 3);
                const char *team = PQgetvalue(next_up_result, i, 4);
                const char *birth_year = PQgetvalue(next_up_result, i, 5);
                
                // Check if player is OG based on birth year
                const char *og_str = "No";
                if (!PQgetisnull(next_up_result, i, 5)) {
                    int birth_year_int = atoi(birth_year);
                    if (birth_year_int <= 1980) {  // players born in 1980 or earlier are OGs
                        og_str = "Yes";
                    }
                }
                
                printf("%-8d | %-20s | %-10d | %-15s | %-5s | %-5s\n", 
                       queue_position, username, user_id, type, team ? team : "N/A", og_str);
            }
            printf("\n");
        } else {
            printf("No players in the next-up queue.\n\n");
        }
        
        // Completed games
        printf("----- COMPLETED GAMES (%d) -----\n\n", completed_games_count);
        for (int i = 0; i < completed_games_count; i++) {
            int game_id = atoi(PQgetvalue(completed_games_result, i, 0));
            const char *court = PQgetvalue(completed_games_result, i, 1);
            const char *start_time = PQgetvalue(completed_games_result, i, 2);
            const char *end_time = PQgetvalue(completed_games_result, i, 3);
            int team1_score = atoi(PQgetvalue(completed_games_result, i, 4));
            int team2_score = atoi(PQgetvalue(completed_games_result, i, 5));
            
            printf("Game #%d (Court %s):\n", game_id, court);
            printf("  Started: %s\n", start_time);
            printf("  Ended: %s\n", end_time);
            printf("  Final Score: %d-%d (%s)\n\n", 
                  team1_score, team2_score,
                  team1_score == team2_score ? "Tie" : 
                  team1_score > team2_score ? "Team 1 won" : "Team 2 won");
            
            // Get players for this game
            char game_id_str[16];
            sprintf(game_id_str, "%d", game_id);
            const char *game_params[1] = { game_id_str };
            
            const char *players_query = 
                "SELECT gp.team, gp.relative_position, c.queue_position, u.username, u.id, u.birth_year "
                "FROM game_players gp "
                "JOIN users u ON gp.user_id = u.id "
                "JOIN checkins c ON u.id = c.user_id AND c.game_id = gp.game_id "
                "WHERE gp.game_id = $1 "
                "ORDER BY gp.team, gp.relative_position";
            
            PGresult *players_result = PQexecParams(conn, players_query, 1, NULL, game_params, NULL, NULL, 0);
            
            if (PQresultStatus(players_result) == PGRES_TUPLES_OK) {
                int player_count = PQntuples(players_result);
                
                printf("  Players:\n");
                printf("  Team 1 (%s):\n", team1_score > team2_score ? "WINNER" : 
                                           team1_score < team2_score ? "LOSER" : "TIE");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    int user_id = atoi(PQgetvalue(players_result, j, 4));
                    const char *birth_year = PQgetvalue(players_result, j, 5);
                    int is_og = (birth_year && *birth_year) ? (atoi(birth_year) < 1980) : 0;
                    
                    if (team == 1) {
                        printf("    #%d (%d): %s [ID: %d]%s\n", queue_position, relative_position, username, user_id, is_og ? " OG" : "");
                    }
                }
                
                printf("  Team 2 (%s):\n", team2_score > team1_score ? "WINNER" : 
                                           team2_score < team1_score ? "LOSER" : "TIE");
                for (int j = 0; j < player_count; j++) {
                    int team = atoi(PQgetvalue(players_result, j, 0));
                    int relative_position = atoi(PQgetvalue(players_result, j, 1));
                    int queue_position = atoi(PQgetvalue(players_result, j, 2));
                    const char *username = PQgetvalue(players_result, j, 3);
                    int user_id = atoi(PQgetvalue(players_result, j, 4));
                    const char *birth_year = PQgetvalue(players_result, j, 5);
                    int is_og = (birth_year && *birth_year) ? (atoi(birth_year) < 1980) : 0;
                    
                    if (team == 2) {
                        printf("    #%d (%d): %s [ID: %d]%s\n", queue_position, relative_position, username, user_id, is_og ? " OG" : "");
                    }
                }
                
                PQclear(players_result);
            }
            printf("\n");
        }
        
        if (completed_games_count == 0) {
            printf("No completed games found.\n\n");
        }
    }
    
    // Clean up
    PQclear(check_result);
    PQclear(active_games_result);
    PQclear(next_up_result);
    PQclear(completed_games_result);
    PQclear(game_set_time_result);
}

/* Function to propose a game without creating it */
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format, bool bCreate) {
    // First check if the game set exists
    const char *check_game_set_query = "SELECT id, players_per_team FROM game_sets WHERE id = $1";
    
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
    
    // Get players_per_team value
    int players_per_team = atoi(PQgetvalue(check_result, 0, 1));
    PQclear(check_result);
    
    // Check if there are active games on this court for this game set
    const char *check_game_query = 
        "SELECT id FROM games "
        "WHERE set_id = $1 AND court = $2 AND state IN ('started', 'pending')";
    
    const char *game_params[2] = { set_id_str, court };
    PGresult *game_result = PQexecParams(conn, check_game_query, 2, NULL, game_params, NULL, NULL, 0);
    
    if (PQresultStatus(game_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Game check query failed: %s\n", PQerrorMessage(conn));
        PQclear(game_result);
        
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
    
    if (PQntuples(game_result) > 0) {
        int game_id = atoi(PQgetvalue(game_result, 0, 0));
        PQclear(game_result);
        
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
    
    PQclear(game_result);
    
    // Get available players (not assigned to a game)
    const char *players_query = 
        "SELECT c.queue_position, u.username, u.id, c.type, u.birth_year "
        "FROM checkins c "
        "JOIN users u ON c.user_id = u.id "
        "WHERE c.is_active = true AND c.game_set_id = $1 AND c.game_id IS NULL "
        "ORDER BY c.queue_position";
    
    PGresult *players_result = PQexecParams(conn, players_query, 1, NULL, check_params, NULL, NULL, 0);
    
    if (PQresultStatus(players_result) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Players query failed: %s\n", PQerrorMessage(conn));
        PQclear(players_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"ERROR\",\n");
            printf("  \"message\": \"Database error when fetching available players\"\n");
            printf("}\n");
        } else {
            printf("Error fetching available players: Database error\n");
        }
        return;
    }
    
    int available_players = PQntuples(players_result);
    int required_players = players_per_team * 2;
    
    if (available_players < required_players) {
        PQclear(players_result);
        
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"NEED_MORE_PLAYERS\",\n");
            printf("  \"message\": \"Not enough players available\",\n");
            printf("  \"available\": %d,\n", available_players);
            printf("  \"required\": %d\n", required_players);
            printf("}\n");
        } else {
            printf("Not enough players available. Need %d, have %d.\n", 
                   required_players, available_players);
        }
        return;
    }
    
    // We have enough players, let's create the proposed team assignments
    if (strcmp(format, "json") == 0) {
        printf("{\n");
        printf("  \"status\": \"SUCCESS\",\n");
        printf("  \"message\": \"Game can be created\",\n");
        printf("  \"game_set_id\": %d,\n", game_set_id);
        printf("  \"court\": \"%s\",\n", court);
        printf("  \"players_per_team\": %d,\n", players_per_team);
        printf("  \"home_team\": [\n");
        
        for (int i = 0; i < players_per_team; i++) {
            int position = atoi(PQgetvalue(players_result, i, 0));
            const char *username = PQgetvalue(players_result, i, 1);
            int userId = atoi(PQgetvalue(players_result, i, 2));
            const char *type = PQgetvalue(players_result, i, 3);
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(players_result, i, 4)) {
                int birth_year = atoi(PQgetvalue(players_result, i, 4));
                is_og = birth_year <= 1980;  // players born in 1980 or earlier are OGs
            }
            
            printf("    {\n");
            printf("      \"position\": %d,\n", position);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"user_id\": %d,\n", userId);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"team\": 1,\n");
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", (i < players_per_team - 1) ? "," : "");
        }
        
        printf("  ],\n");
        printf("  \"away_team\": [\n");
        
        for (int i = players_per_team; i < players_per_team * 2; i++) {
            int position = atoi(PQgetvalue(players_result, i, 0));
            const char *username = PQgetvalue(players_result, i, 1);
            int userId = atoi(PQgetvalue(players_result, i, 2));
            const char *type = PQgetvalue(players_result, i, 3);
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(players_result, i, 4)) {
                int birth_year = atoi(PQgetvalue(players_result, i, 4));
                is_og = birth_year <= 1980;  // players born in 1980 or earlier are OGs
            }
            
            printf("    {\n");
            printf("      \"position\": %d,\n", position);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"user_id\": %d,\n", userId);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"team\": 2,\n");
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", (i < players_per_team * 2 - 1) ? "," : "");
        }
        
        printf("  ],\n");
        printf("  \"next_up\": [\n");
        
        for (int i = players_per_team * 2; i < available_players; i++) {
            int position = atoi(PQgetvalue(players_result, i, 0));
            const char *username = PQgetvalue(players_result, i, 1);
            int userId = atoi(PQgetvalue(players_result, i, 2));
            const char *type = PQgetvalue(players_result, i, 3);
            
            // Check if player is OG based on birth year
            bool is_og = false;
            if (!PQgetisnull(players_result, i, 4)) {
                int birth_year = atoi(PQgetvalue(players_result, i, 4));
                is_og = birth_year <= 1980;  // players born in 1980 or earlier are OGs
            }
            
            printf("    {\n");
            printf("      \"position\": %d,\n", position);
            printf("      \"username\": \"%s\",\n", username);
            printf("      \"user_id\": %d,\n", userId);
            printf("      \"type\": \"%s\",\n", type);
            printf("      \"team\": null,\n");
            printf("      \"is_og\": %s\n", is_og ? "true" : "false");
            printf("    }%s\n", (i < available_players - 1) ? "," : "");
        }
        
        if (bCreate) {
            printf("  ]");
        } else {
            // In propose-game mode (not bCreate), we need to leave space to add game_id and stat
            printf("  ]");
        }
    } else {
        printf("Game proposal for game set #%d on court '%s':\n", game_set_id, court);
        printf("------------------------------------------\n");
        printf("HOME TEAM (Team 1):\n");
        printf("%-8s | %-20s | %-10s | %-15s | %-5s\n", 
               "Position", "Username", "User ID", "Type", "OG");
        printf("------------------------------------------\n");
        
        for (int i = 0; i < players_per_team; i++) {
            int position = atoi(PQgetvalue(players_result, i, 0));
            const char *username = PQgetvalue(players_result, i, 1);
            int userId = atoi(PQgetvalue(players_result, i, 2));
            const char *type = PQgetvalue(players_result, i, 3);
            
            // Check if player is OG based on birth year
            const char *og_str = "No";
            if (!PQgetisnull(players_result, i, 4)) {
                int birth_year = atoi(PQgetvalue(players_result, i, 4));
                if (birth_year <= 1980) {  // players born in 1980 or earlier are OGs
                    og_str = "Yes";
                }
            }
            
            printf("%-8d | %-20s | %-10d | %-15s | %-5s\n", 
                   position, username, userId, type, og_str);
        }
        
        printf("\nAWAY TEAM (Team 2):\n");
        printf("%-8s | %-20s | %-10s | %-15s | %-5s\n", 
               "Position", "Username", "User ID", "Type", "OG");
        printf("------------------------------------------\n");
        
        for (int i = players_per_team; i < players_per_team * 2; i++) {
            int position = atoi(PQgetvalue(players_result, i, 0));
            const char *username = PQgetvalue(players_result, i, 1);
            int userId = atoi(PQgetvalue(players_result, i, 2));
            const char *type = PQgetvalue(players_result, i, 3);
            
            // Check if player is OG based on birth year
            const char *og_str = "No";
            if (!PQgetisnull(players_result, i, 4)) {
                int birth_year = atoi(PQgetvalue(players_result, i, 4));
                if (birth_year <= 1980) {  // players born in 1980 or earlier are OGs
                    og_str = "Yes";
                }
            }
            
            printf("%-8d | %-20s | %-10d | %-15s | %-5s\n", 
                   position, username, userId, type, og_str);
        }
        
        if (available_players > players_per_team * 2) {
            printf("\nNEXT UP PLAYERS:\n");
            printf("%-8s | %-20s | %-10s | %-15s | %-5s\n", 
                   "Position", "Username", "User ID", "Type", "OG");
            printf("------------------------------------------\n");
            
            for (int i = players_per_team * 2; i < available_players; i++) {
                int position = atoi(PQgetvalue(players_result, i, 0));
                const char *username = PQgetvalue(players_result, i, 1);
                int userId = atoi(PQgetvalue(players_result, i, 2));
                const char *type = PQgetvalue(players_result, i, 3);
                
                // Check if player is OG based on birth year
                const char *og_str = "No";
                if (!PQgetisnull(players_result, i, 4)) {
                    int birth_year = atoi(PQgetvalue(players_result, i, 4));
                    if (birth_year <= 1980) {  // players born in 1980 or earlier are OGs
                        og_str = "Yes";
                    }
                }
                
                printf("%-8d | %-20s | %-10d | %-15s | %-5s\n", 
                       position, username, userId, type, og_str);
            }
        }
    }
    
    // Create the game if requested
    int game_id = 0;
    
    if (bCreate) {
        // Begin a transaction
        PGresult *tx_result = PQexec(conn, "BEGIN");
        if (PQresultStatus(tx_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "BEGIN command failed: %s\n", PQerrorMessage(conn));
            PQclear(tx_result);
            PQclear(players_result);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error starting transaction\",\n");
                printf("  \"game_id\": -1,\n");
                printf("  \"stat\": %d\n", STAT_ERROR_DB);
                printf("}\n");
            } else {
                printf("Error starting transaction for game creation\n");
            }
            return;
        }
        PQclear(tx_result);

        // First get the club_index from the game_set
        const char *get_club_index_query = "SELECT club_index FROM checkins WHERE game_set_id = $1 LIMIT 1";
        
        const char *club_index_params[1] = { set_id_str };
        PGresult *club_index_result = PQexecParams(conn, get_club_index_query, 1, NULL, club_index_params, NULL, NULL, 0);
        
        if (PQresultStatus(club_index_result) != PGRES_TUPLES_OK || PQntuples(club_index_result) == 0) {
            fprintf(stderr, "Failed to get club_index: %s\n", PQerrorMessage(conn));
            PQclear(club_index_result);
            
            // Roll back the transaction
            PGresult *rollback_result = PQexec(conn, "ROLLBACK");
            PQclear(rollback_result);
            
            PQclear(players_result);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Failed to get club_index\",\n");
                printf("  \"game_id\": -1,\n");
                printf("  \"stat\": %d\n", STAT_ERROR_DB);
                printf("}\n");
            } else {
                printf("Error: Failed to get club_index\n");
            }
            return;
        }
        
        const char *club_index_str = PQgetvalue(club_index_result, 0, 0);
        
        // Create the game
        const char *create_game_query = 
            "INSERT INTO games (set_id, start_time, court, state, club_index) "
            "VALUES ($1, NOW(), $2, 'started', $3) "
            "RETURNING id";
            
        const char *game_params[3] = { set_id_str, court, club_index_str };
        
        PGresult *game_create_result = PQexecParams(conn, create_game_query, 3, NULL, game_params, NULL, NULL, 0);
        
        if (PQresultStatus(game_create_result) != PGRES_TUPLES_OK) {
            fprintf(stderr, "Game creation failed: %s\n", PQerrorMessage(conn));
            PQclear(game_create_result);
            
            // Roll back the transaction
            PGresult *rollback_result = PQexec(conn, "ROLLBACK");
            PQclear(rollback_result);
            
            PQclear(players_result);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error creating game\",\n");
                printf("  \"game_id\": -1,\n");
                printf("  \"stat\": %d\n", STAT_ERROR_DB);
                printf("}\n");
            } else {
                printf("Error creating game: Database error\n");
            }
            return;
        }
        
        // Get the created game ID
        game_id = atoi(PQgetvalue(game_create_result, 0, 0));
        PQclear(game_create_result);
        
        // Add players to the game
        for (int i = 0; i < players_per_team * 2; i++) {
            int user_id = atoi(PQgetvalue(players_result, i, 2));
            int team = (i < players_per_team) ? 1 : 2;
            int relative_position = (i < players_per_team) ? (i + 1) : (i - players_per_team + 1);
            
            char user_id_str[16];
            char team_str[2];
            char game_id_str[16];
            char relative_pos_str[16];
            
            sprintf(user_id_str, "%d", user_id);
            sprintf(team_str, "%d", team);
            sprintf(game_id_str, "%d", game_id);
            sprintf(relative_pos_str, "%d", relative_position);
            
            const char *player_params[4] = { game_id_str, user_id_str, team_str, relative_pos_str };
            
            const char *add_player_query = 
                "INSERT INTO game_players (game_id, user_id, team, relative_position) "
                "VALUES ($1, $2, $3, $4)";
            
            PGresult *player_add_result = PQexecParams(conn, add_player_query, 4, NULL, player_params, NULL, NULL, 0);
            
            if (PQresultStatus(player_add_result) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Player addition failed: %s\n", PQerrorMessage(conn));
                PQclear(player_add_result);
                
                // Roll back the transaction
                PGresult *rollback_result = PQexec(conn, "ROLLBACK");
                PQclear(rollback_result);
                
                PQclear(players_result);
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error adding players to game\",\n");
                    printf("  \"game_id\": -1,\n");
                    printf("  \"stat\": %d\n", STAT_ERROR_DB);
                    printf("}\n");
                } else {
                    printf("Error adding players to game: Database error\n");
                }
                return;
            }
            PQclear(player_add_result);
            
            // Update the checkin's game_id and team
            const char *update_checkin_query = 
                "UPDATE checkins "
                "SET game_id = $1, team = $2 "
                "WHERE user_id = $3 AND is_active = true AND game_set_id = $4";
            
            const char *checkin_params[4] = { game_id_str, team_str, user_id_str, set_id_str };
            
            PGresult *checkin_update_result = PQexecParams(conn, update_checkin_query, 4, NULL, 
                                                        checkin_params, NULL, NULL, 0);
            
            if (PQresultStatus(checkin_update_result) != PGRES_COMMAND_OK) {
                fprintf(stderr, "Checkin update failed: %s\n", PQerrorMessage(conn));
                PQclear(checkin_update_result);
                
                // Roll back the transaction
                PGresult *rollback_result = PQexec(conn, "ROLLBACK");
                PQclear(rollback_result);
                
                PQclear(players_result);
                
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"Database error updating checkins\",\n");
                    printf("  \"game_id\": -1,\n");
                    printf("  \"stat\": %d\n", STAT_ERROR_DB);
                    printf("}\n");
                } else {
                    printf("Error updating checkins: Database error\n");
                }
                return;
            }
            PQclear(checkin_update_result);
        }
        
        // Update the current_queue_position in game_sets
        int new_queue_position = atoi(PQgetvalue(players_result, (players_per_team * 2) - 1, 0)) + 1;
        
        char new_pos_str[16];
        sprintf(new_pos_str, "%d", new_queue_position);
        
        const char *update_game_set_query = 
            "UPDATE game_sets "
            "SET current_queue_position = $1 "
            "WHERE id = $2";
        
        const char *pos_params[2] = { new_pos_str, set_id_str };
        
        PGresult *pos_update_result = PQexecParams(conn, update_game_set_query, 2, NULL, pos_params, NULL, NULL, 0);
        
        if (PQresultStatus(pos_update_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "Game set update failed: %s\n", PQerrorMessage(conn));
            PQclear(pos_update_result);
            
            // Roll back the transaction
            PGresult *rollback_result = PQexec(conn, "ROLLBACK");
            PQclear(rollback_result);
            
            PQclear(players_result);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error updating game set\",\n");
                printf("  \"game_id\": -1,\n");
                printf("  \"stat\": %d\n", STAT_ERROR_DB);
                printf("}\n");
            } else {
                printf("Error updating game set: Database error\n");
            }
            return;
        }
        PQclear(pos_update_result);
        
        // Commit the transaction
        PGresult *commit_result = PQexec(conn, "COMMIT");
        if (PQresultStatus(commit_result) != PGRES_COMMAND_OK) {
            fprintf(stderr, "COMMIT command failed: %s\n", PQerrorMessage(conn));
            PQclear(commit_result);
            
            // Roll back the transaction
            PGresult *rollback_result = PQexec(conn, "ROLLBACK");
            PQclear(rollback_result);
            
            PQclear(players_result);
            
            if (strcmp(format, "json") == 0) {
                printf("{\n");
                printf("  \"status\": \"ERROR\",\n");
                printf("  \"message\": \"Database error committing transaction\",\n");
                printf("  \"game_id\": -1,\n");
                printf("  \"stat\": %d\n", STAT_ERROR_DB);
                printf("}\n");
            } else {
                printf("Error committing transaction: Database error\n");
            }
            return;
        }
        PQclear(commit_result);
        
        // Show success message with created game ID
        if (strcmp(format, "json") == 0) {
            printf("{\n");
            printf("  \"status\": \"SUCCESS\",\n");
            printf("  \"message\": \"Game created successfully\",\n");
            printf("  \"game_id\": %d,\n", game_id);
            printf("  \"game_set_id\": %d,\n", game_set_id);
            printf("  \"court\": \"%s\",\n", court);
            printf("  \"players_per_team\": %d,\n", players_per_team);
            printf("  \"new_queue_position\": %d,\n", new_queue_position);
            printf("  \"stat\": %d\n", STAT_SUCCESS);
            printf("}\n");
        } else {
            printf("\nGame created successfully!\n");
            printf("Game ID: %d\n", game_id);
            printf("Court: %s\n", court);
            printf("New queue position: %d\n", new_queue_position);
        }
    } 
    // Update the JSON output for propose-game to include the stat and game_id fields
    else if (strcmp(format, "json") == 0) {
        // After printing the "next_up" array, add game_id and stat fields before closing the main JSON object
        printf(",\n");
        printf("  \"game_id\": 0,\n");
        printf("  \"stat\": %d\n", STAT_SUCCESS);
        printf("}\n");
    }
    
    PQclear(players_result);
}

/* Simple command line option parser */
void process_command(PGconn *conn, int argc, char *argv[]) {
    if (argc < 2) {
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
        printf("  new-game <game_set_id> <court> [format] - Create a new game (format: text|json, default: text)\n");
        printf("  end-game <game_id> <home_score> <away_score> - End a game and record the final scores\n");
        printf("  game-set-status <game_set_id> [format] - Show detailed status of a game set (format: text|json|--json, default: text)\n");
        printf("  sql \"<sql_query>\" - Run arbitrary SQL query\n");
        return;
    }
    
    if (strcmp(argv[1], "users") == 0) {
        int count;
        User **users = get_users(conn, &count);
        
        printf("Found %d users\n", count);
        for (int i = 0; i < count; i++) {
            printf("User #%d: %s (is_player: %d, is_engineer: %d, autoup: %d)\n",
                   users[i]->id,
                   users[i]->username,
                   users[i]->is_player,
                   users[i]->is_engineer,
                   users[i]->autoup);
            
            /* Free memory for user */
            free_user(users[i]);
        }
        free(users);
    }
    else if (strcmp(argv[1], "active-checkins") == 0) {
        int count;
        Checkin **checkins = get_active_checkins_with_username(conn, &count);
        
        printf("Found %d active checkins\n", count);
        /* Clean up */
        for (int i = 0; i < count; i++) {
            free_checkin(checkins[i]);
        }
        free(checkins);
    }
    else if (strcmp(argv[1], "active-games") == 0) {
        int count;
        Game **games = get_active_games(conn, &count);
        
        printf("Found %d active games\n", count);
        /* Clean up */
        for (int i = 0; i < count; i++) {
            free_game(games[i]);
        }
        free(games);
    }
    else if (strcmp(argv[1], "active-game-set") == 0) {
        GameSet *gameSet = get_active_game_set(conn);
        
        if (gameSet) {
            /* Free memory */
            free_game_set(gameSet);
        } else {
            printf("No active game set found\n");
        }
    }
    else if (strcmp(argv[1], "checkout") == 0) {
        if (argc < 3) {
            printf("Usage: %s checkout <position1> [position2] [position3] ...\n", argv[0]);
            return;
        }
        
        // Process all positions provided
        for (int i = 2; i < argc; i++) {
            int position = atoi(argv[i]);
            if (position <= 0) {
                printf("Invalid position '%s'. Skipping.\n", argv[i]);
                continue;
            }
            
            printf("Processing position %d:\n", position);
            checkout_player(conn, position);
            printf("\n");
        }
    }
    else if (strcmp(argv[1], "player") == 0) {
        if (argc < 3) {
            printf("Usage: %s player <username> [format]\n", argv[0]);
            printf("  format: text (default) | json\n");
            return;
        }
        
        const char *format = "text";
        if (argc >= 4) {
            format = argv[3];
            if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                printf("Invalid format: %s (must be 'text' or 'json')\n", format);
                return;
            }
        }
        
        get_player_info(conn, argv[2], format);
    }
    else if (strcmp(argv[1], "promote") == 0) {
        if (argc < 4) {
            printf("Usage: %s promote <game_id> <win|loss>\n", argv[0]);
            return;
        }
        
        int game_id = atoi(argv[2]);
        if (game_id <= 0) {
            printf("Invalid game ID: %s\n", argv[2]);
            return;
        }
        
        if (strcmp(argv[3], "win") != 0 && strcmp(argv[3], "loss") != 0) {
            printf("Invalid promotion type: %s (must be 'win' or 'loss')\n", argv[3]);
            return;
        }
        
        int promoted = promote_game_players(conn, game_id, argv[3]);
        if (promoted > 0) {
            printf("Successfully promoted %d players\n", promoted);
        } else {
            printf("No players were promoted\n");
        }
    }
    else if (strcmp(argv[1], "end-game") == 0) {
        if (argc < 5) {
            printf("Usage: %s end-game <game_id> <home_score> <away_score>\n", argv[0]);
            return;
        }
        
        int game_id = atoi(argv[2]);
        if (game_id <= 0) {
            printf("Invalid game ID: %s\n", argv[2]);
            return;
        }
        
        int home_score = atoi(argv[3]);
        if (home_score < 0) {
            printf("Invalid home score: %s (must be non-negative)\n", argv[3]);
            return;
        }
        
        int away_score = atoi(argv[4]);
        if (away_score < 0) {
            printf("Invalid away score: %s (must be non-negative)\n", argv[4]);
            return;
        }
        
        finalize_game(conn, game_id, home_score, away_score);
    }
    /* Backwards compatibility for the old "finalize" command */
    else if (strcmp(argv[1], "finalize") == 0) {
        if (argc < 5) {
            printf("Usage: %s finalize <game_id> <home_score> <away_score>\n", argv[0]);
            printf("Note: 'finalize' command is deprecated. Please use 'end-game' instead.\n");
            return;
        }
        
        int game_id = atoi(argv[2]);
        if (game_id <= 0) {
            printf("Invalid game ID: %s\n", argv[2]);
            return;
        }
        
        int home_score = atoi(argv[3]);
        if (home_score < 0) {
            printf("Invalid home score: %s (must be non-negative)\n", argv[3]);
            return;
        }
        
        int away_score = atoi(argv[4]);
        if (away_score < 0) {
            printf("Invalid away score: %s (must be non-negative)\n", argv[4]);
            return;
        }
        
        printf("Note: 'finalize' command is deprecated. Please use 'end-game' instead.\n");
        finalize_game(conn, game_id, home_score, away_score);
    }
    else if (strcmp(argv[1], "next-up") == 0) {
        int game_set_id = 0;
        const char *format = "text";
        
        // If game_set_id is provided
        if (argc >= 3) {
            // Check if it's a format string first
            if (strcmp(argv[2], "json") == 0 || strcmp(argv[2], "text") == 0) {
                format = argv[2];
                game_set_id = get_active_game_set_id(conn);
                if (game_set_id <= 0) {
                    if (strcmp(format, "json") == 0) {
                        printf("{\n");
                        printf("  \"status\": \"ERROR\",\n");
                        printf("  \"message\": \"No active game set found\"\n");
                        printf("}\n");
                    } else {
                        printf("Error: No active game set found\n");
                    }
                    return;
                }
            } else {
                // It should be a game_set_id
                game_set_id = atoi(argv[2]);
                if (game_set_id <= 0) {
                    if (strcmp(format, "json") == 0) {
                        printf("{\n");
                        printf("  \"status\": \"ERROR\",\n");
                        printf("  \"message\": \"Invalid game_set_id: %s\"\n", argv[2]);
                        printf("}\n");
                    } else {
                        printf("Invalid game set ID: %s\n", argv[2]);
                    }
                    return;
                }
                
                // Check if format is provided
                if (argc >= 4) {
                    format = argv[3];
                    if (strcmp(format, "json") != 0 && strcmp(format, "text") != 0) {
                        if (strcmp(format, "json") == 0) {
                            printf("{\n");
                            printf("  \"status\": \"ERROR\",\n");
                            printf("  \"message\": \"Invalid format: %s (must be 'text' or 'json')\"\n", format);
                            printf("}\n");
                        } else {
                            printf("Invalid format: %s (must be 'text' or 'json')\n", format);
                        }
                        return;
                    }
                }
            }
        } else {
            // Use active game set if no ID provided
            game_set_id = get_active_game_set_id(conn);
            if (game_set_id <= 0) {
                if (strcmp(format, "json") == 0) {
                    printf("{\n");
                    printf("  \"status\": \"ERROR\",\n");
                    printf("  \"message\": \"No active game set found\"\n");
                    printf("}\n");
                } else {
                    printf("Error: No active game set found\n");
                }
                return;
            }
        }
        
        get_next_up_players(conn, game_set_id, format);
    }
    else if (strcmp(argv[1], "propose-game") == 0) {
        if (argc < 4) {
            printf("Usage: %s propose-game <game_set_id> <court> [format]\n", argv[0]);
            printf("       format: text|json (default: text)\n");
            return;
        }
        
        int game_set_id = atoi(argv[2]);
        const char *court = argv[3];
        const char *format = "text";
        
        // If format is provided
        if (argc >= 5) {
            if (strcmp(argv[4], "json") == 0 || strcmp(argv[4], "text") == 0) {
                format = argv[4];
            } else {
                printf("Error: Invalid format '%s'. Valid formats are 'text' or 'json'.\n", argv[4]);
                return;
            }
        }
        
        propose_game(conn, game_set_id, court, format, false);
    }
    else if (strcmp(argv[1], "new-game") == 0) {
        if (argc < 4) {
            printf("Usage: %s new-game <game_set_id> <court> [format]\n", argv[0]);
            printf("       format: text|json (default: text)\n");
            return;
        }
        
        int game_set_id = atoi(argv[2]);
        const char *court = argv[3];
        const char *format = "text";
        
        // If format is provided
        if (argc >= 5) {
            if (strcmp(argv[4], "json") == 0 || strcmp(argv[4], "text") == 0) {
                format = argv[4];
            } else {
                printf("Error: Invalid format '%s'. Valid formats are 'text' or 'json'.\n", argv[4]);
                return;
            }
        }
        
        // Call propose_game with bCreate=true to actually create the game
        propose_game(conn, game_set_id, court, format, true);
    }
    else if (strcmp(argv[1], "game-set-status") == 0) {
        if (argc < 3) {
            printf("Usage: %s game-set-status <game_set_id> [format]\n", argv[0]);
            printf("       format: text|json|--json (default: text)\n");
            return;
        }
        
        int game_set_id = atoi(argv[2]);
        if (game_set_id <= 0) {
            printf("Invalid game set ID: %s\n", argv[2]);
            return;
        }
        
        const char *format = "text";
        // If format is provided
        if (argc >= 4) {
            // Check for --json flag
            if (strcmp(argv[3], "--json") == 0) {
                format = "json";
            } else if (strcmp(argv[3], "json") == 0 || strcmp(argv[3], "text") == 0) {
                format = argv[3];
            } else {
                printf("Error: Invalid format '%s'. Valid formats are 'text' or 'json'.\n", argv[3]);
                return;
            }
        }
        
        get_game_set_status(conn, game_set_id, format);
    }
    else if (strcmp(argv[1], "sql") == 0) {
        if (argc < 3) {
            printf("Usage: %s sql \"<sql_query>\"\n", argv[0]);
            return;
        }
        
        run_sql(conn, argv[2]);
    }
    else {
        printf("Unknown command: %s\n", argv[1]);
    }
}

int main(int argc, char *argv[]) {
    /* Connect to the database */
    PGconn *conn = connect_to_db();
    
    /* Process command line arguments */
    process_command(conn, argc, argv);
    
    /* Clean up and exit */
    PQfinish(conn);
    return 0;
}