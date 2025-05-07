#!/bin/bash

# This script will manually apply the team designation fix to scootd.c

# 1. Make a backup of the original file
cp scootd.c scootd.c.original

# 2. Add the get_team_designation function after #include <time.h>
cat > temp_includes.c << 'EOL'
/* Helper function to extract team designation from checkin type */
char get_team_designation(const char* checkin_type) {
    /* Find the last ":" character in the type string */
    const char *last_colon = strrchr(checkin_type, ':');
    if (last_colon != NULL && (last_colon[1] == 'H' || last_colon[1] == 'A')) {
        return last_colon[1];
    }
    return '\0';
}

EOL

# Insert the function after #include <time.h>
sed -i '/#include <time.h>/r temp_includes.c' scootd.c

# Now compile our test program to confirm it works with the proper strrchr function
gcc -o test_team_designation test_team_designation.c
./test_team_designation

echo "Function added to scootd.c"
echo "The original file is saved as scootd.c.original"
echo "You can now manually update the two team assignment code blocks using"
echo "the implementation in team_assignment_fix_implementation.c"