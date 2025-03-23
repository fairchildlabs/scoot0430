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

/* Database connection string */
#define MAX_CONN_INFO_LEN 256

/* Function prototypes */
void get_next_up_players(PGconn *conn, int game_set_id, const char *format);
void propose_game(PGconn *conn, int game_set_id, const char *court, const char *format);

/* Error handling helper */
void handle_error(const char *message, PGconn *conn) {
    fprintf(stderr, "ERROR: %s\n", message);
    if (conn) {
        fprintf(stderr, "DB says: %s\n", PQerrorMessage(conn));
        PQfinish(conn);
    }
    exit(1);
}

