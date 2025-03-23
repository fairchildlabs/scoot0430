// Temporary fix for scootd_enhanced_fixed.c

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <libpq-fe.h>

int main() {
    FILE *input = fopen("scootd_enhanced_fixed.c", "r");
    FILE *output = fopen("scootd_enhanced_fixed_new.c", "w");
    
    if (!input || !output) {
        fprintf(stderr, "Error opening files\n");
        return 1;
    }
    
    char line[1024];
    int line_num = 0;
    
    while (fgets(line, sizeof(line), input)) {
        line_num++;
        
        // Fix line 738
        if (line_num == 738) {
            fputs("                            /* Not used */ int queue_pos_tmp = atoi(PQgetvalue(players_result, j, 1));\n", output);
        }
        // Fix line 769
        else if (line_num == 769) {
            fputs("                            /* Not used */ int queue_pos_tmp2 = atoi(PQgetvalue(players_result, j, 1));\n", output);
        }
        else {
            fputs(line, output);
        }
    }
    
    fclose(input);
    fclose(output);
    
    printf("File fixed successfully\n");
    return 0;
}