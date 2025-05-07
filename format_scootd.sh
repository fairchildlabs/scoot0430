#!/bin/bash

# Create a diff file
diff -u scootd.c.original scootd.c > scootd_fix.diff

# Extract just the function we care about from both files
grep -A 20 "Assign teams to players without a team assignment" scootd.c.original > original_team_assignment.txt
grep -A 30 "Assign teams to players without a team assignment" scootd.c > fixed_team_assignment.txt

echo "Created scootd_fix.diff with all changes"
echo "Created original_team_assignment.txt and fixed_team_assignment.txt for comparison"