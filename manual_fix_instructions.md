# Manual Fix Instructions for scootd.c

The helper function `get_team_designation()` has already been added to the file. Now you need to manually update the team assignment logic in two places.

## Step 1: Find Team Assignment Block

Run this command to locate the team assignment block:
```bash
grep -n "Assign teams to players without a team assignment" scootd.c
```

This should show you line 1073.

## Step 2: Modify the Team Assignment Logic

1. **Open scootd.c in a text editor**
   ```
   nano scootd.c
   ```

2. **Go to around line 1073** (first team assignment block)
   You will see code like this:
   ```c
   // Assign teams to players without a team assignment
   for (int i = 0; i < 8; i++) {
       if (players[i].team == 0) {
           // Assign to team with fewer players
           if (home_team_count < 4) {
               // If swap is true, reverse the team assignment
               players[i].team = swap ? 2 : 1; // HOME or AWAY based on swap
               home_team_count++;
           } else {
               // If swap is true, reverse the team assignment
               players[i].team = swap ? 1 : 2; // AWAY or HOME based on swap
               away_team_count++;
           }
   ```

3. **Replace it with this enhanced code** (copy and paste from here):
   ```c
   // Assign teams to players without a team assignment
   for (int i = 0; i < 8; i++) {
       if (players[i].team == 0) {
           // Parse checkin type for team designation
           const char *type = players[i].checkin_type;
           char team_designation = get_team_designation(type);
           
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
   ```

4. **Find the second occurrence** (should be around line ~1200) and apply the same change.

## Step 3: Compile and Test

After making these changes:

```bash
gcc -o scootd scootd.c
```

If compilation is successful, your fix has been properly applied!

## What This Fix Does

The fix properly interprets team designations (H or A) from checkin types.
For example:
- A player with checkin_type "loss_promoted:2:A" will be assigned to AWAY team
- A player with checkin_type "autoup:1:H" will be assigned to HOME team

This ensures players in position 21 and others with team designations get properly assigned.