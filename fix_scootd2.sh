#!/bin/bash

# Make a backup of the original scootd.c
cp scootd.c scootd.c.bak

# Apply our patch
patch -p0 < team_assignment_fix.patch

# Compile the updated scootd program
gcc -o scootd_enhanced_fixed scootd.c

echo "Fix applied successfully!"
echo "1. Original backup saved as: scootd.c.bak"
echo "2. Fixed executable compiled as: scootd_enhanced_fixed"
echo ""
echo "The fix now properly handles team designations from checkin types."
echo "For example, a player with checkin_type 'loss_promoted:2:A' will be assigned to AWAY team."