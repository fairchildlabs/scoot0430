#!/bin/bash

# Backup the original file
cp scootd.c scootd.c.backup

# Use sed to format the file with ANSI style braces
# 1. Function declarations - put opening brace on new line at same indentation level
sed -i 's/\([a-zA-Z0-9_*]\+[ ]\+[a-zA-Z0-9_*]\+[ ]*(.*)[ ]*{[ ]*\)/\1\n{/g' scootd.c

# 2. Indented blocks - put opening brace on new line with same indentation
sed -i 's/\([ ]\+\)\(if\|for\|while\|else\)[ ]*(.*)[[:space:]]*{[[:space:]]*$/\1\2 (...)\n\1{/g' scootd.c
sed -i 's/\([ ]\+\)\(if\|for\|while\|else\)[ ]*(.*)[[:space:]]*{[[:space:]]*\([^}]*\)$/\1\2 (...)\n\1{\n\1    \3/g' scootd.c

# 3. Fix for 'else {' constructs
sed -i 's/\([ ]\+\)else {/\1else\n\1{/g' scootd.c

echo "Formatting complete. Original file backed up as scootd.c.backup"