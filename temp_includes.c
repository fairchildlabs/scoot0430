/* Helper function to extract team designation from checkin type */
char get_team_designation(const char* checkin_type) {
    /* Find the last ":" character in the type string */
    const char *last_colon = strrchr(checkin_type, ':');
    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
        return last_colon[1];
    }
    return '\0';
}

