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
    char *firstName;
    char *lastName;
    char *email;
    char *phone;
    int birthYear;
    int birthMonth;
    int birthDay;
    int isPlayer;
    int isBank;
    int isBook;
    int isEngineer;
    int isRoot;
    int autoup;
} User;

/* Game Set structure */
typedef struct {
    int id;
    int userId;
    char *name;
    char *date;
    char *startTime;
    char *endTime;
    int isActive;
    int clubIndex;
    int queueNextUp;
    int currentQueuePosition;
    int playersPerTeam;
} GameSet;

/* Game structure */
typedef struct {
    int id;
    int setId;
    char *startTime;
    char *endTime;
    int team1Score;
    int team2Score;
    int clubIndex;
    char *court;
    char *state;
} Game;

/* Check-in structure */
typedef struct {
    int id;
    int userId;
    char *checkInTime;
    char *checkInDate;
    int isActive;
    int gameSetId;
    int clubIndex;
    int queuePosition;
    int gameId;
    char *type;
    int team;
} Checkin;

/* Game Player structure */
typedef struct {
    int id;
    int gameId;
    int userId;
    int team;
} GamePlayer;

/* Memory management for structures */

/* Free memory for User structure */
void free_user(User *user) {
    if (!user) return;
    free(user->username);
    free(user->password);
    free(user->firstName);
    free(user->lastName);
    free(user->email);
    free(user->phone);
    free(user);
}

/* Free memory for GameSet structure */
void free_game_set(GameSet *gameSet) {
    if (!gameSet) return;
    free(gameSet->name);
    free(gameSet->date);
    free(gameSet->startTime);
    free(gameSet->endTime);
    free(gameSet);
}

/* Free memory for Game structure */
void free_game(Game *game) {
    if (!game) return;
    free(game->startTime);
    free(game->endTime);
    free(game->court);
    free(game->state);
    free(game);
}

/* Free memory for Checkin structure */
void free_checkin(Checkin *checkin) {
    if (!checkin) return;
    free(checkin->checkInTime);
    free(checkin->checkInDate);
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
        users[i]->firstName = strdup(PQgetvalue(result, i, 3));
        users[i]->lastName = strdup(PQgetvalue(result, i, 4));
        users[i]->email = strdup(PQgetvalue(result, i, 5));
        users[i]->phone = strdup(PQgetvalue(result, i, 6));
        users[i]->birthYear = atoi(PQgetvalue(result, i, 7));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 8)) {
            users[i]->birthMonth = 0;
        } else {
            users[i]->birthMonth = atoi(PQgetvalue(result, i, 8));
        }
        
        if (PQgetisnull(result, i, 9)) {
            users[i]->birthDay = 0;
        } else {
            users[i]->birthDay = atoi(PQgetvalue(result, i, 9));
        }
        
        users[i]->isPlayer = atoi(PQgetvalue(result, i, 10));
        users[i]->isBank = atoi(PQgetvalue(result, i, 11));
        users[i]->isBook = atoi(PQgetvalue(result, i, 12));
        users[i]->isEngineer = atoi(PQgetvalue(result, i, 13));
        users[i]->isRoot = atoi(PQgetvalue(result, i, 14));
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
        "JOIN users u ON c.\"userId\" = u.id "
        "WHERE c.\"isActive\" = true "
        "ORDER BY c.\"queuePosition\" ASC";
    
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
        checkins[i]->userId = atoi(PQgetvalue(result, i, 1));
        checkins[i]->checkInTime = strdup(PQgetvalue(result, i, 2));
        checkins[i]->checkInDate = strdup(PQgetvalue(result, i, 3));
        checkins[i]->isActive = atoi(PQgetvalue(result, i, 4));
        checkins[i]->gameSetId = atoi(PQgetvalue(result, i, 5));
        checkins[i]->clubIndex = atoi(PQgetvalue(result, i, 6));
        checkins[i]->queuePosition = atoi(PQgetvalue(result, i, 7));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 8)) {
            checkins[i]->gameId = 0;
        } else {
            checkins[i]->gameId = atoi(PQgetvalue(result, i, 8));
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
               checkins[i]->queuePosition,
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
        games[i]->setId = atoi(PQgetvalue(result, i, 1));
        games[i]->startTime = strdup(PQgetvalue(result, i, 2));
        
        /* Handle nullable columns properly */
        if (PQgetisnull(result, i, 3)) {
            games[i]->endTime = strdup("");
        } else {
            games[i]->endTime = strdup(PQgetvalue(result, i, 3));
        }
        
        games[i]->team1Score = atoi(PQgetvalue(result, i, 4));
        games[i]->team2Score = atoi(PQgetvalue(result, i, 5));
        games[i]->clubIndex = atoi(PQgetvalue(result, i, 6));
        games[i]->court = strdup(PQgetvalue(result, i, 7));
        games[i]->state = strdup(PQgetvalue(result, i, 8));
        
        printf("Game #%d: Court %s, State: %s, Score: %d-%d\n",
               games[i]->id,
               games[i]->court,
               games[i]->state,
               games[i]->team1Score,
               games[i]->team2Score);
    }
    
    PQclear(result);
    return games;
}

/* Get active game set details */
GameSet *get_active_game_set(PGconn *conn) {
    const char *query = "SELECT * FROM game_sets WHERE \"isActive\" = true LIMIT 1";
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
    gameSet->userId = atoi(PQgetvalue(result, 0, 1));
    gameSet->name = strdup(PQgetvalue(result, 0, 2));
    gameSet->date = strdup(PQgetvalue(result, 0, 3));
    
    /* Handle nullable columns properly */
    if (PQgetisnull(result, 0, 4)) {
        gameSet->startTime = strdup("");
    } else {
        gameSet->startTime = strdup(PQgetvalue(result, 0, 4));
    }
    
    if (PQgetisnull(result, 0, 5)) {
        gameSet->endTime = strdup("");
    } else {
        gameSet->endTime = strdup(PQgetvalue(result, 0, 5));
    }
    
    gameSet->isActive = atoi(PQgetvalue(result, 0, 6));
    gameSet->clubIndex = atoi(PQgetvalue(result, 0, 7));
    gameSet->queueNextUp = atoi(PQgetvalue(result, 0, 8));
    gameSet->currentQueuePosition = atoi(PQgetvalue(result, 0, 9));
    gameSet->playersPerTeam = atoi(PQgetvalue(result, 0, 10));
    
    printf("Active GameSet: %s (ID: %d)\n", gameSet->name, gameSet->id);
    printf("Queue Position: %d, Next Up: %d, Players Per Team: %d\n",
           gameSet->currentQueuePosition,
           gameSet->queueNextUp,
           gameSet->playersPerTeam);
    
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
            printf("User #%d: %s (isPlayer: %d, isEngineer: %d, autoup: %d)\n",
                   users[i]->id,
                   users[i]->username,
                   users[i]->isPlayer,
                   users[i]->isEngineer,
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