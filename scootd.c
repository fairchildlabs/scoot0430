/**
 * scootd.c - Scoot Database Daemon/Client
 * 
 * Connects to PostgreSQL database and performs queries
 * Returns structures with column names matching the database schema
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libpq-fe.h>

/* Database connection string */
#define MAX_CONN_INFO_LEN 256

/* Error handling helper */
void handle_error(const char *message, PGconn *conn) {
    fprintf(stderr, "ERROR: %s\n", message);
    if (conn) {
        fprintf(stderr, "DB says: %s\n", PQerrorMessage(conn));
        PQfinish(conn);
    }
    exit(1);
}

/* Result set printing helper */
void print_result(PGresult *result) {
    int rows = PQntuples(result);
    int cols = PQnfields(result);
    
    /* Print column headers */
    printf("Result set (%d rows):\n", rows);
    for (int c = 0; c < cols; c++) {
        printf("%-15s", PQfname(result, c));
    }
    printf("\n");
    
    /* Print separator line */
    for (int c = 0; c < cols; c++) {
        printf("--------------- ");
    }
    printf("\n");
    
    /* Print data rows */
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
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

/* Simple command line option parser */
void process_command(PGconn *conn, int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage: %s <command> [args...]\n", argv[0]);
        printf("Available commands:\n");
        printf("  users - List all users\n");
        printf("  active-checkins - List active checkins with usernames\n");
        printf("  active-games - List active games\n");
        printf("  active-game-set - Show active game set details\n");
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